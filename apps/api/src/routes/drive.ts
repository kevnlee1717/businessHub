import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { db, driveNodes } from "@bh/db";
import { driveTreeQuery, folderCreateSchema, idParams, nodePatchSchema } from "@bh/shared";
import { type MultipartFile } from "@fastify/multipart";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema, sendNotFound } from "./hrUtils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");
const storageDirectory = "brochure";
const DRIVE_MAX_UPLOAD = 300 * 1024 * 1024;

type DriveNodeRow = typeof driveNodes.$inferSelect;
type MultipartFields = Record<string, string>;
type UploadedFile = {
  filename: string;
  storagePath: string;
  mime: string;
  size: number;
};
type FolderUploadFile = UploadedFile & {
  relPath: string;
  segments: string[];
};

const parentIdSchema = z.preprocess(
  (value) => (value === "" || value === "null" || value === undefined ? null : value),
  z.string().uuid().nullable()
);

const multipartParentSchema = z.object({
  parent_id: parentIdSchema.default(null)
});

function urlForStoragePath(storagePath: string | null | undefined) {
  return storagePath ? `/uploads/${storagePath}` : null;
}

function serializeNode(row: DriveNodeRow) {
  return {
    id: row.id,
    parent_id: row.parentId,
    kind: row.kind,
    name: row.name,
    storage_path: row.storagePath,
    mime: row.mime,
    size: row.size,
    sort_order: row.sortOrder,
    updated_at: row.updatedAt,
    created_at: row.createdAt,
    ...(row.kind === "file" ? { url: urlForStoragePath(row.storagePath) } : {})
  };
}

function serializeTrashNode(row: DriveNodeRow, path: string, descendantCount: number) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    size: row.size,
    deleted_at: row.deletedAt,
    path,
    descendant_count: descendantCount
  };
}

function fieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

async function discardFile(part: MultipartFile): Promise<void> {
  await pipeline(
    part.file,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

async function unlinkStoragePath(storagePath: string | null | undefined) {
  if (!storagePath) return;
  try {
    await unlink(join(uploadRoot, storagePath));
  } catch {
    // Best-effort cleanup only; stale files should not break API writes.
  }
}

async function saveFile(part: MultipartFile) {
  const directory = join(uploadRoot, storageDirectory);
  await mkdir(directory, { recursive: true });

  const extension = extname(part.filename);
  const storedFilename = `${randomUUID()}${extension}`;
  const absolutePath = join(directory, storedFilename);
  const storagePath = posix.join(storageDirectory, storedFilename);
  let size = 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      callback(null, chunk);
    }
  });

  try {
    await pipeline(part.file, counter, createWriteStream(absolutePath));
  } catch (error) {
    await unlinkStoragePath(storagePath);
    throw error;
  }

  return {
    filename: part.filename,
    storagePath,
    mime: part.mimetype,
    size
  };
}

async function readMultipartWithFiles(request: FastifyRequest) {
  const fields: MultipartFields = {};
  const files: UploadedFile[] = [];

  try {
    for await (const part of request.parts({ limits: { fileSize: DRIVE_MAX_UPLOAD } })) {
      if (part.type === "field") {
        const value = fieldValue(part.value);
        if (value !== "") {
          fields[part.fieldname] = value;
        }
        continue;
      }

      files.push(await saveFile(part));
    }
  } catch (error) {
    await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
    throw error;
  }

  return { fields, files };
}

async function readMultipartWithFirstFile(request: FastifyRequest) {
  const fields: MultipartFields = {};
  let file: UploadedFile | null = null;

  try {
    for await (const part of request.parts({ limits: { fileSize: DRIVE_MAX_UPLOAD } })) {
      if (part.type === "field") {
        const value = fieldValue(part.value);
        if (value !== "") {
          fields[part.fieldname] = value;
        }
        continue;
      }

      if (file) {
        await discardFile(part);
        continue;
      }

      file = await saveFile(part);
    }
  } catch (error) {
    await unlinkStoragePath(file?.storagePath);
    throw error;
  }

  return { fields, file };
}

async function readMultipartFolderUpload(request: FastifyRequest) {
  const fields: MultipartFields = {};
  const files: FolderUploadFile[] = [];

  try {
    for await (const part of request.parts({ limits: { fileSize: DRIVE_MAX_UPLOAD } })) {
      if (part.type === "field") {
        const value = fieldValue(part.value);
        if (value !== "") {
          fields[part.fieldname] = value;
        }
        continue;
      }

      const segments = part.fieldname.split("/").filter(Boolean);
      if (segments.length === 0) {
        await discardFile(part);
        throw new Error("invalid_relative_path");
      }

      const file = await saveFile(part);
      files.push({
        ...file,
        relPath: part.fieldname,
        segments
      });
    }
  } catch (error) {
    await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
    throw error;
  }

  return { fields, files };
}

function isFileTooLargeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

function sendDriveFileTooLarge(reply: FastifyReply) {
  return reply.code(413).send({
    error: "file_too_large",
    message: "文件超过 300MB 上限,请压缩后再传"
  });
}

function parseParentId(value: unknown): string | null {
  return parentIdSchema.parse(value);
}

async function findNode(id: string) {
  const [node] = await db
    .select()
    .from(driveNodes)
    .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
    .limit(1);
  return node ?? null;
}

async function findAnyNode(id: string) {
  const [node] = await db.select().from(driveNodes).where(eq(driveNodes.id, id)).limit(1);
  return node ?? null;
}

async function validateParentFolder(parentId: string | null, reply: FastifyReply) {
  if (!parentId) return true;
  const parent = await findNode(parentId);
  if (!parent || parent.kind !== "folder") {
    reply.code(400).send({ error: "parent_folder_required" });
    return false;
  }
  return true;
}

async function isFolderMoveCyclic(id: string, targetParentId: string | null) {
  let currentId = targetParentId;
  while (currentId) {
    if (currentId === id) return true;
    const [parent] = await db
      .select({ parentId: driveNodes.parentId })
      .from(driveNodes)
      .where(and(eq(driveNodes.id, currentId), isNull(driveNodes.deletedAt)))
      .limit(1);
    currentId = parent?.parentId ?? null;
  }
  return false;
}

async function buildActiveParentPath(parentId: string | null) {
  const names: string[] = [];
  let currentId = parentId;

  while (currentId) {
    const [parent] = await db
      .select({ id: driveNodes.id, parentId: driveNodes.parentId, name: driveNodes.name })
      .from(driveNodes)
      .where(and(eq(driveNodes.id, currentId), isNull(driveNodes.deletedAt)))
      .limit(1);
    if (!parent) break;
    names.push(parent.name);
    currentId = parent.parentId;
  }

  return names.reverse().join("/");
}

async function countDeletedDescendants(id: string) {
  const result = await db.execute(sql`
    with recursive descendants as (
      select id, parent_id
      from drive_nodes
      where parent_id = ${id} and deleted_at is not null
      union all
      select child.id, child.parent_id
      from drive_nodes child
      join descendants on child.parent_id = descendants.id
      where child.deleted_at is not null
    )
    select count(*)::int as count
    from descendants
  `);
  return Number(result.rows[0]?.count ?? 0);
}

async function getTrashTopNode(id: string) {
  const node = await findAnyNode(id);
  if (!node?.deletedAt) return null;
  if (!node.parentId) return node;
  const parent = await findAnyNode(node.parentId);
  return parent && !parent.deletedAt ? node : null;
}

async function collectBatchFileStoragePaths(deletedBatch: string) {
  const result = await db.execute(sql`
    select storage_path
    from drive_nodes
    where deleted_batch = ${deletedBatch}
      and kind = 'file'
      and storage_path is not null
  `);
  return result.rows.map((row) => String(row.storage_path));
}

async function collectAllTrashFileStoragePaths() {
  const result = await db.execute(sql`
    select storage_path
    from drive_nodes
    where deleted_at is not null
      and kind = 'file'
      and storage_path is not null
  `);
  return result.rows.map((row) => String(row.storage_path));
}

export async function registerDriveRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/drive/tree", { preHandler: requirePerm("brochure.view") }, async (request) => {
    parseWithSchema(driveTreeQuery, request.query);
    const rows = await db
      .select()
      .from(driveNodes)
      .where(isNull(driveNodes.deletedAt))
      .orderBy(sql`case when ${driveNodes.kind} = 'folder' then 0 else 1 end`, asc(driveNodes.name));

    return { nodes: rows.map(serializeNode) };
  });

  app.post("/drive/folders", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const body = parseWithSchema(folderCreateSchema, request.body);
    const parentId = parseParentId(body.parent_id);
    if (!(await validateParentFolder(parentId, reply))) return;

    const [row] = await db
      .insert(driveNodes)
      .values({
        parentId,
        kind: "folder",
        name: body.name,
        createdBy: request.user.id,
        updatedAt: new Date()
      })
      .returning();
    if (!row) throw new Error("drive_folder_create_failed");
    return reply.code(201).send({ node: serializeNode(row) });
  });

  app.post("/drive/files", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    let files: UploadedFile[] = [];

    try {
      const multipart = await readMultipartWithFiles(request);
      files = multipart.files;
      if (files.length === 0) return reply.code(400).send({ error: "file_required" });

      const body = parseWithSchema(multipartParentSchema, multipart.fields);
      const parentId = parseParentId(body.parent_id);
      if (!(await validateParentFolder(parentId, reply))) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const rows = await db
        .insert(driveNodes)
        .values(
          files.map((file) => ({
            parentId,
            kind: "file",
            name: file.filename,
            storagePath: file.storagePath,
            mime: file.mime,
            size: file.size,
            createdBy: request.user.id,
            updatedAt: new Date()
          }))
        )
        .returning();

      return reply.code(201).send({ nodes: rows.map(serializeNode) });
    } catch (error) {
      await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.post("/drive/upload-folder", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    let files: FolderUploadFile[] = [];

    try {
      const multipart = await readMultipartFolderUpload(request);
      files = multipart.files;
      if (files.length === 0) return reply.code(400).send({ error: "file_required" });

      const body = parseWithSchema(multipartParentSchema, multipart.fields);
      const parentId = parseParentId(body.parent_id);
      if (!(await validateParentFolder(parentId, reply))) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const result = await db.transaction(async (tx) => {
        const folderCache = new Map<string, string>();
        const topFolders = new Map<string, DriveNodeRow>();
        let createdFolders = 0;
        let createdFiles = 0;

        async function ensureFolder(currentParentId: string | null, name: string) {
          const key = `${currentParentId ?? "root"}::${name}`;
          const cached = folderCache.get(key);
          if (cached) return cached;

          const parentFilter = currentParentId ? eq(driveNodes.parentId, currentParentId) : isNull(driveNodes.parentId);
          const [existing] = await tx
            .select()
            .from(driveNodes)
            .where(and(parentFilter, eq(driveNodes.kind, "folder"), eq(driveNodes.name, name), isNull(driveNodes.deletedAt)))
            .limit(1);
          if (existing) {
            folderCache.set(key, existing.id);
            return existing.id;
          }

          const [folder] = await tx
            .insert(driveNodes)
            .values({
              parentId: currentParentId,
              kind: "folder",
              name,
              createdBy: request.user.id,
              updatedAt: new Date()
            })
            .returning();
          if (!folder) throw new Error("drive_folder_create_failed");

          folderCache.set(key, folder.id);
          createdFolders += 1;
          if (currentParentId === parentId) {
            topFolders.set(folder.id, folder);
          }
          return folder.id;
        }

        for (const file of files) {
          const fileName = file.segments[file.segments.length - 1];
          if (!fileName) throw new Error("invalid_relative_path");

          let currentParentId = parentId;
          for (const segment of file.segments.slice(0, -1)) {
            currentParentId = await ensureFolder(currentParentId, segment);
          }

          const [row] = await tx
            .insert(driveNodes)
            .values({
              parentId: currentParentId,
              kind: "file",
              name: fileName,
              storagePath: file.storagePath,
              mime: file.mime,
              size: file.size,
              createdBy: request.user.id,
              updatedAt: new Date()
            })
            .returning({ id: driveNodes.id });
          if (!row) throw new Error("drive_file_node_create_failed");
          createdFiles += 1;
        }

        return {
          createdFolders,
          createdFiles,
          topFolders: Array.from(topFolders.values())
        };
      });

      return reply.code(201).send({
        created_folders: result.createdFolders,
        created_files: result.createdFiles,
        top_folders: result.topFolders.map(serializeNode)
      });
    } catch (error) {
      await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      if (error instanceof Error && error.message === "invalid_relative_path") {
        return reply.code(400).send({ error: "invalid_relative_path" });
      }
      throw error;
    }
  });

  app.patch("/drive/nodes/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const body = parseWithSchema(nodePatchSchema, request.body);
    const existing = await findNode(id);
    if (!existing) return sendNotFound(reply);

    const parentId = body.parent_id === undefined ? undefined : parseParentId(body.parent_id);
    if (parentId !== undefined) {
      if (!(await validateParentFolder(parentId, reply))) return;
      if (existing.kind === "folder" && (await isFolderMoveCyclic(id, parentId))) {
        return reply.code(400).send({ error: "cyclic_parent" });
      }
    }

    const [row] = await db
      .update(driveNodes)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
      .returning();
    if (!row) return sendNotFound(reply);
    return { node: serializeNode(row) };
  });

  app.post("/drive/nodes/:id/replace", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    let file: UploadedFile | null = null;

    try {
      const multipart = await readMultipartWithFirstFile(request);
      file = multipart.file;
      if (!file) return reply.code(400).send({ error: "file_required" });

      const existing = await findNode(id);
      if (!existing) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }
      if (existing.kind !== "file") {
        await unlinkStoragePath(file.storagePath);
        return reply.code(400).send({ error: "file_node_required" });
      }

      const [row] = await db
        .update(driveNodes)
        .set({
          name: file.filename,
          storagePath: file.storagePath,
          mime: file.mime,
          size: file.size,
          updatedAt: new Date()
        })
        .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
        .returning();
      if (!row) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }

      await unlinkStoragePath(existing.storagePath);
      return { node: serializeNode(row) };
    } catch (error) {
      await unlinkStoragePath(file?.storagePath);
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.get("/drive/trash", { preHandler: requirePerm("brochure.admin") }, async () => {
    const rows = await db
      .select()
      .from(driveNodes)
      .where(
        and(
          isNotNull(driveNodes.deletedAt),
          sql`(${driveNodes.parentId} is null or exists (
            select 1
            from drive_nodes parent
            where parent.id = ${driveNodes.parentId}
              and parent.deleted_at is null
          ))`
        )
      )
      .orderBy(sql`${driveNodes.deletedAt} desc`, asc(driveNodes.name));

    const nodes = await Promise.all(
      rows.map(async (row) => {
        const path = await buildActiveParentPath(row.parentId);
        const descendantCount = row.kind === "folder" ? await countDeletedDescendants(row.id) : 0;
        return serializeTrashNode(row, path, descendantCount);
      })
    );

    return { nodes };
  });

  app.post("/drive/trash/:id/restore", { preHandler: requirePerm("brochure.admin") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const root = await getTrashTopNode(id);
    if (!root) return sendNotFound(reply);
    if (!root.deletedBatch) return reply.code(400).send({ error: "deleted_batch_required" });
    const deletedBatch = root.deletedBatch;

    await db.transaction(async (tx) => {
      let restoreParentId = root.parentId;
      if (restoreParentId) {
        const [parent] = await tx.select().from(driveNodes).where(eq(driveNodes.id, restoreParentId)).limit(1);
        if (!parent || parent.deletedAt) {
          restoreParentId = null;
        }
      }

      if (restoreParentId !== root.parentId) {
        await tx.update(driveNodes).set({ parentId: restoreParentId, updatedAt: new Date() }).where(eq(driveNodes.id, root.id));
      }

      await tx
        .update(driveNodes)
        .set({ deletedAt: null, deletedBatch: null, updatedAt: new Date() })
        .where(eq(driveNodes.deletedBatch, deletedBatch));
    });

    return { ok: true };
  });

  app.delete("/drive/trash/:id", { preHandler: requirePerm("brochure.admin") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const root = await getTrashTopNode(id);
    if (!root) return sendNotFound(reply);
    if (!root.deletedBatch) return reply.code(400).send({ error: "deleted_batch_required" });

    const storagePaths = await collectBatchFileStoragePaths(root.deletedBatch);
    const [row] = await db.delete(driveNodes).where(eq(driveNodes.id, root.id)).returning({ id: driveNodes.id });
    if (!row) return sendNotFound(reply);
    await Promise.all(storagePaths.map((storagePath) => unlinkStoragePath(storagePath)));
    return { ok: true };
  });

  app.delete("/drive/trash", { preHandler: requirePerm("brochure.admin") }, async () => {
    const storagePaths = await collectAllTrashFileStoragePaths();
    await db.delete(driveNodes).where(isNotNull(driveNodes.deletedAt));
    await Promise.all(storagePaths.map((storagePath) => unlinkStoragePath(storagePath)));
    return { ok: true };
  });

  app.delete("/drive/nodes/:id", { preHandler: requirePerm("brochure.admin") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const existing = await findNode(id);
    if (!existing) return sendNotFound(reply);

    const deletedAt = new Date();
    const deletedBatch = randomUUID();
    const result = await db.execute(sql`
      with recursive target as (
        select id
        from drive_nodes
        where id = ${id} and deleted_at is null
        union all
        select child.id
        from drive_nodes child
        join target on child.parent_id = target.id
        where child.deleted_at is null
      )
      update drive_nodes
      set deleted_at = ${deletedAt},
          deleted_batch = ${deletedBatch},
          updated_at = ${deletedAt}
      where id in (select id from target)
      returning id
    `);

    if (result.rows.length === 0) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/drive/nodes/:id/download", { preHandler: requirePerm("brochure.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const node = await findNode(id);
    if (!node || node.kind !== "file" || !node.storagePath) return sendNotFound(reply);

    const absolutePath = join(uploadRoot, node.storagePath);
    try {
      await access(absolutePath);
    } catch {
      return sendNotFound(reply);
    }

    reply.header("Content-Type", node.mime ?? "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(node.name)}`);
    return reply.send(createReadStream(absolutePath));
  });
}
