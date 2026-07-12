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
import { asc, eq, inArray, sql } from "drizzle-orm";
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

const parentIdSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
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
      .where(eq(driveNodes.id, currentId))
      .limit(1);
    currentId = parent?.parentId ?? null;
  }
  return false;
}

async function collectDescendantFileStoragePaths(folderId: string) {
  const storagePaths: string[] = [];
  let pending = [folderId];

  while (pending.length > 0) {
    const children = await db
      .select({
        id: driveNodes.id,
        kind: driveNodes.kind,
        storagePath: driveNodes.storagePath
      })
      .from(driveNodes)
      .where(inArray(driveNodes.parentId, pending));

    pending = [];
    for (const child of children) {
      if (child.kind === "folder") {
        pending.push(child.id);
      } else if (child.storagePath) {
        storagePaths.push(child.storagePath);
      }
    }
  }

  return storagePaths;
}

export async function registerDriveRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/drive/tree", { preHandler: requirePerm("brochure.view") }, async (request) => {
    parseWithSchema(driveTreeQuery, request.query);
    const rows = await db
      .select()
      .from(driveNodes)
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
      .where(eq(driveNodes.id, id))
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
        .where(eq(driveNodes.id, id))
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

  app.delete("/drive/nodes/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const existing = await findNode(id);
    if (!existing) return sendNotFound(reply);

    const storagePaths =
      existing.kind === "folder"
        ? await collectDescendantFileStoragePaths(existing.id)
        : existing.storagePath
          ? [existing.storagePath]
          : [];

    const [row] = await db.delete(driveNodes).where(eq(driveNodes.id, id)).returning({ id: driveNodes.id });
    if (!row) return sendNotFound(reply);
    await Promise.all(storagePaths.map((storagePath) => unlinkStoragePath(storagePath)));
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
