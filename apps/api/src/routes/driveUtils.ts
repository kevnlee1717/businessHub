import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { db, driveNodes } from "@bh/db";
import { type MultipartFile } from "@fastify/multipart";
import { and, eq, isNull, sql } from "drizzle-orm";
import { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const uploadRoot = join(__dirname, "../../../..", "uploads");
const storageDirectory = "brochure";
const DRIVE_MAX_UPLOAD = 300 * 1024 * 1024;

export type DriveNodeRow = typeof driveNodes.$inferSelect;
export type MultipartFields = Record<string, string>;
export type UploadedFile = {
  filename: string;
  storagePath: string;
  mime: string;
  size: number;
};
export type FolderUploadFile = UploadedFile & {
  relPath: string;
  segments: string[];
};

export const parentIdSchema = z.preprocess(
  (value) => (value === "" || value === "null" || value === undefined ? null : value),
  z.string().uuid().nullable()
);

export const multipartParentSchema = z.object({
  parent_id: parentIdSchema.default(null)
});

export function urlForStoragePath(storagePath: string | null | undefined) {
  return storagePath ? `/uploads/${storagePath}` : null;
}

export function serializeNode(row: DriveNodeRow, parentIdOverride?: string | null) {
  return {
    id: row.id,
    parent_id: parentIdOverride === undefined ? row.parentId : parentIdOverride,
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

export function fieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

export async function discardFile(part: MultipartFile): Promise<void> {
  await pipeline(
    part.file,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

export async function unlinkStoragePath(storagePath: string | null | undefined) {
  if (!storagePath) return;
  try {
    await unlink(join(uploadRoot, storagePath));
  } catch {
    // Best-effort cleanup only; stale files should not break API writes.
  }
}

export async function saveFile(part: MultipartFile) {
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

export async function readMultipartWithFiles(request: FastifyRequest) {
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

export async function readMultipartWithFirstFile(request: FastifyRequest) {
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

export async function readMultipartFolderUpload(request: FastifyRequest) {
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

export function isFileTooLargeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

export function sendDriveFileTooLarge(reply: FastifyReply) {
  return reply.code(413).send({
    error: "file_too_large",
    message: "文件超过 300MB 上限,请压缩后再传"
  });
}

export function parseParentId(value: unknown): string | null {
  return parentIdSchema.parse(value);
}

export async function findNode(id: string) {
  const [node] = await db
    .select()
    .from(driveNodes)
    .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
    .limit(1);
  return node ?? null;
}

export async function findAnyNode(id: string) {
  const [node] = await db.select().from(driveNodes).where(eq(driveNodes.id, id)).limit(1);
  return node ?? null;
}

export async function validateParentFolder(parentId: string | null, reply: FastifyReply) {
  if (!parentId) return true;
  const parent = await findNode(parentId);
  if (!parent || parent.kind !== "folder") {
    reply.code(400).send({ error: "parent_folder_required" });
    return false;
  }
  return true;
}

export async function isFolderMoveCyclic(id: string, targetParentId: string | null) {
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

export async function findOrCreateFolder(parentId: string | null, folderName: string, userId: string) {
  const parentFilter = parentId ? eq(driveNodes.parentId, parentId) : isNull(driveNodes.parentId);
  const [existing] = await db
    .select()
    .from(driveNodes)
    .where(and(parentFilter, eq(driveNodes.kind, "folder"), eq(driveNodes.name, folderName), isNull(driveNodes.deletedAt)))
    .limit(1);
  if (existing) return existing.id;

  const [folder] = await db
    .insert(driveNodes)
    .values({
      parentId,
      kind: "folder",
      name: folderName,
      createdBy: userId,
      updatedAt: new Date()
    })
    .returning();
  if (!folder) throw new Error("drive_folder_create_failed");
  return folder.id;
}

export async function createFolder(parentId: string | null, name: string, userId: string) {
  const [row] = await db
    .insert(driveNodes)
    .values({
      parentId,
      kind: "folder",
      name,
      createdBy: userId,
      updatedAt: new Date()
    })
    .returning();
  if (!row) throw new Error("drive_folder_create_failed");
  return row;
}

export async function insertUploadedFiles(parentId: string | null, files: UploadedFile[], userId: string) {
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
        createdBy: userId,
        updatedAt: new Date()
      }))
    )
    .returning();
  return rows;
}

export async function createFolderUploadTree(parentId: string | null, files: FolderUploadFile[], userId: string) {
  return db.transaction(async (tx) => {
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
          createdBy: userId,
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
          createdBy: userId,
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
}

export async function softDeleteNodeTree(id: string) {
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
  return result.rows.length;
}

export async function sendDriveNodeDownload(id: string, reply: FastifyReply) {
  const node = await findNode(id);
  if (!node || node.kind !== "file" || !node.storagePath) return false;

  const absolutePath = join(uploadRoot, node.storagePath);
  try {
    await access(absolutePath);
  } catch {
    return false;
  }

  reply.header("Content-Type", node.mime ?? "application/octet-stream");
  reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(node.name)}`);
  reply.send(createReadStream(absolutePath));
  return true;
}
