import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { companies, db, employees, ipadSlides } from "@bh/db";
import { ipadSlideUpdateSchema, ipadSlideUploadSchema } from "@bh/shared";
import { type MultipartFile } from "@fastify/multipart";
import { and, asc, eq, sql } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { generateIpadSlideThumbnail } from "../lib/ipadThumbs";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");
const storageDirectory = "ipad-slides";
const IPAD_SLIDE_MAX_UPLOAD = 300 * 1024 * 1024;

type IpadSlideRow = typeof ipadSlides.$inferSelect;
type MultipartFields = Record<string, string>;
type UploadedFile = {
  filename: string;
  storagePath: string;
  mime: string;
  size: number;
};

function serializeSlide(row: IpadSlideRow) {
  return {
    id: row.id,
    company_id: row.companyId,
    title: row.title,
    filename: row.filename,
    storage_path: row.storagePath,
    url: `/uploads/${row.storagePath}`,
    thumb_path: row.thumbPath,
    thumb_url: row.thumbPath ? `/uploads/${row.thumbPath}` : null,
    mime: row.mime,
    size: row.size,
    sort_order: row.sortOrder,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
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

function isPdf(part: MultipartFile) {
  return part.mimetype === "application/pdf" || part.filename.toLowerCase().endsWith(".pdf");
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

async function readMultipartWithFirstPdf(request: FastifyRequest) {
  const fields: MultipartFields = {};
  let file: UploadedFile | null = null;

  try {
    for await (const part of request.parts({ limits: { fileSize: IPAD_SLIDE_MAX_UPLOAD } })) {
      if (part.type === "field") {
        const value = fieldValue(part.value);
        if (value !== "") fields[part.fieldname] = value;
        continue;
      }

      if (file) {
        await discardFile(part);
        continue;
      }

      if (!isPdf(part)) {
        await discardFile(part);
        throw new Error("pdf_required");
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

async function assertCompanyAccess(request: FastifyRequest, reply: FastifyReply, companyId: string | null | undefined) {
  const companyIds = await getAccessibleCompanyIds(request);
  if (companyIds !== "all" && (!companyId || !companyIds.includes(companyId))) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function defaultCompanyIdForRequest(request: FastifyRequest): Promise<string | null> {
  const [employee] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, request.user.id)).limit(1);
  if (employee?.companyId) return employee.companyId;

  const companyIds = await getAccessibleCompanyIds(request);
  if (companyIds !== "all") return companyIds[0] ?? null;

  const [company] = await db.select({ id: companies.id }).from(companies).orderBy(asc(companies.name)).limit(1);
  return company?.id ?? null;
}

function sendFileTooLarge(reply: FastifyReply) {
  return reply.code(413).send({
    error: "file_too_large",
    message: "文件超过 300MB 上限,请压缩后再传"
  });
}

export async function registerIpadSlideRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ipad-slides", { preHandler: app.authenticate }, async (request) => {
    const filter = companyFilter(await getAccessibleCompanyIds(request), ipadSlides.companyId);
    const rows = await db
      .select()
      .from(ipadSlides)
      .where(filter ?? sql`true`)
      .orderBy(asc(ipadSlides.sortOrder), asc(ipadSlides.createdAt));

    return { slides: rows.map(serializeSlide) };
  });

  app.post("/ipad-slides", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    let file: UploadedFile | null = null;
    let thumbPath: string | null = null;

    try {
      const multipart = await readMultipartWithFirstPdf(request);
      file = multipart.file;
      if (!file) return reply.code(400).send({ error: "file_required" });
      try {
        thumbPath = await generateIpadSlideThumbnail(file.storagePath);
      } catch (error) {
        request.log.warn({ error, storagePath: file.storagePath }, "ipad_slide_thumbnail_failed");
      }

      const body = parseWithSchema(ipadSlideUploadSchema, multipart.fields);
      const companyId = await defaultCompanyIdForRequest(request);
      if (!companyId) {
        await unlinkStoragePath(file.storagePath);
        return reply.code(400).send({ error: "company_required" });
      }
      if (!(await assertCompanyAccess(request, reply, companyId))) {
        await unlinkStoragePath(file.storagePath);
        return;
      }

      const [next] = await db
        .select({ sortOrder: sql<number>`coalesce(max(${ipadSlides.sortOrder}), 0) + 1` })
        .from(ipadSlides)
        .where(eq(ipadSlides.companyId, companyId));

      const [row] = await db
        .insert(ipadSlides)
        .values({
          companyId,
          title: body.title,
          filename: file.filename,
          storagePath: file.storagePath,
          thumbPath,
          mime: file.mime,
          size: file.size,
          sortOrder: next?.sortOrder ?? 1,
          createdBy: request.user.id,
          updatedAt: new Date()
        })
        .returning();

      if (!row) throw new Error("ipad_slide_create_failed");
      return reply.code(201).send({ slide: serializeSlide(row) });
    } catch (error) {
      await unlinkStoragePath(file?.storagePath);
      await unlinkStoragePath(thumbPath);
      if (isFileTooLargeError(error)) return sendFileTooLarge(reply);
      if (error instanceof Error && error.message === "pdf_required") {
        return reply.code(400).send({ error: "pdf_required" });
      }
      throw error;
    }
  });

  app.patch("/ipad-slides/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(ipadSlideUpdateSchema, request.body);
    const [existing] = await db.select().from(ipadSlides).where(eq(ipadSlides.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;

    const [row] = await db
      .update(ipadSlides)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(ipadSlides.id, id), eq(ipadSlides.companyId, existing.companyId)))
      .returning();

    if (!row) return sendNotFound(reply);
    return { slide: serializeSlide(row) };
  });

  app.delete("/ipad-slides/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(ipadSlides).where(eq(ipadSlides.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;

    const [row] = await db.delete(ipadSlides).where(eq(ipadSlides.id, id)).returning();
    if (!row) return sendNotFound(reply);
    await unlinkStoragePath(row.storagePath);
    await unlinkStoragePath(row.thumbPath);
    return { ok: true };
  });
}
