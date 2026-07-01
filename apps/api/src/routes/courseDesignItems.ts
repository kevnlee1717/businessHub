import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { courseDesignItems, db } from "@bh/db";
import { courseDesignItemCreateSchema, courseDesignItemUpdateSchema } from "@bh/shared";
import { type MultipartFile } from "@fastify/multipart";
import { asc, eq } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");
const storageDirectory = "course-design";
const COURSE_DESIGN_IMAGE_MAX_UPLOAD = 50 * 1024 * 1024;

type CourseDesignItemRow = typeof courseDesignItems.$inferSelect;
type UploadedFile = {
  filename: string;
  storagePath: string;
  mime: string;
  size: number;
};

function serializeItem(item: CourseDesignItemRow) {
  return {
    id: item.id,
    section: item.section,
    status: item.status,
    sort_order: item.sortOrder,
    fields: item.fields,
    image_key: item.imageKey,
    image_url: item.imageKey ? `/uploads/${item.imageKey}` : null,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
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

function isImage(part: MultipartFile) {
  return part.mimetype.startsWith("image/");
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

async function readMultipartWithFirstImage(request: FastifyRequest) {
  let file: UploadedFile | null = null;

  try {
    for await (const part of request.parts({ limits: { fileSize: COURSE_DESIGN_IMAGE_MAX_UPLOAD } })) {
      if (part.type === "field") {
        continue;
      }

      if (file) {
        await discardFile(part);
        continue;
      }

      if (!isImage(part)) {
        await discardFile(part);
        throw new Error("image_required");
      }

      file = await saveFile(part);
    }
  } catch (error) {
    await unlinkStoragePath(file?.storagePath);
    throw error;
  }

  return file;
}

function isFileTooLargeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

function sendFileTooLarge(reply: FastifyReply) {
  return reply.code(413).send({
    error: "file_too_large",
    message: "文件超过 50MB 上限,请压缩后再传"
  });
}

function isLockedUpdate(
  existing: CourseDesignItemRow,
  body: { fields?: unknown; sort_order?: number | undefined; status?: string | undefined }
) {
  return (
    existing.status === "approved" &&
    (body.fields !== undefined || body.sort_order !== undefined) &&
    body.status !== "draft"
  );
}

export async function registerCourseDesignItemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/course-design-items", { preHandler: requirePerm("education.view") }, async () => {
    const rows = await db
      .select()
      .from(courseDesignItems)
      .orderBy(asc(courseDesignItems.section), asc(courseDesignItems.sortOrder), asc(courseDesignItems.createdAt));

    return { items: rows.map(serializeItem) };
  });

  app.post("/course-design-items", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(courseDesignItemCreateSchema, request.body);
    const [item] = await db
      .insert(courseDesignItems)
      .values({
        section: body.section,
        fields: body.fields ?? {},
        status: body.status,
        sortOrder: body.sort_order
      })
      .returning();

    if (!item) {
      throw new Error("course_design_item_create_failed");
    }

    return reply.code(201).send({ item: serializeItem(item) });
  });

  app.patch("/course-design-items/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(courseDesignItemUpdateSchema, request.body);
    const [existing] = await db.select().from(courseDesignItems).where(eq(courseDesignItems.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);

    if (isLockedUpdate(existing, body)) {
      return reply.code(409).send({ error: "item_locked" });
    }

    const update: Partial<typeof courseDesignItems.$inferInsert> = {
      updatedAt: new Date()
    };

    if (body.fields !== undefined) update.fields = body.fields;
    if (body.status !== undefined) update.status = body.status;
    if (body.sort_order !== undefined) update.sortOrder = body.sort_order;

    const [item] = await db.update(courseDesignItems).set(update).where(eq(courseDesignItems.id, id)).returning();
    if (!item) return sendNotFound(reply);

    return { item: serializeItem(item) };
  });

  app.delete("/course-design-items/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(courseDesignItems).where(eq(courseDesignItems.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);

    if (existing.status === "approved") {
      return reply.code(409).send({ error: "item_locked" });
    }

    const [item] = await db.delete(courseDesignItems).where(eq(courseDesignItems.id, id)).returning();
    if (!item) return sendNotFound(reply);
    await unlinkStoragePath(item.imageKey);
    return { ok: true };
  });

  app.post("/course-design-items/:id/image", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(courseDesignItems).where(eq(courseDesignItems.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (existing.status === "approved") {
      return reply.code(409).send({ error: "item_locked" });
    }

    let file: UploadedFile | null = null;

    try {
      file = await readMultipartWithFirstImage(request);
      if (!file) return reply.code(400).send({ error: "image_required" });

      const [item] = await db
        .update(courseDesignItems)
        .set({
          imageKey: file.storagePath,
          updatedAt: new Date()
        })
        .where(eq(courseDesignItems.id, id))
        .returning();

      if (!item) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }

      await unlinkStoragePath(existing.imageKey);
      return { item: serializeItem(item) };
    } catch (error) {
      await unlinkStoragePath(file?.storagePath);
      if (isFileTooLargeError(error)) return sendFileTooLarge(reply);
      if (error instanceof Error && error.message === "image_required") {
        return reply.code(400).send({ error: "image_required" });
      }
      throw error;
    }
  });
}
