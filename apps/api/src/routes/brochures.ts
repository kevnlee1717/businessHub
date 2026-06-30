import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  brochureCategories,
  brochureIndustries,
  brochureVersions,
  brochures,
  db
} from "@bh/db";
import {
  brochureCategoryCreateSchema,
  brochureCategoryUpdateSchema,
  brochureCreateSchema,
  brochureIndustryCreateSchema,
  brochureIndustryUpdateSchema,
  brochureListQuerySchema,
  brochureSetCurrentSchema,
  brochureUpdateSchema,
  brochureVersionUploadSchema
} from "@bh/shared";
import { type MultipartFile } from "@fastify/multipart";
import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { getPagination } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");
const storageDirectory = "brochure";

const versionParamsSchema = z.object({
  id: z.string().uuid(),
  vid: z.string().uuid()
});

type BrochureDictionaryRow = typeof brochureIndustries.$inferSelect | typeof brochureCategories.$inferSelect;
type BrochureRow = typeof brochures.$inferSelect;
type BrochureVersionRow = typeof brochureVersions.$inferSelect;
type MultipartFields = Record<string, string>;

function serializeDictionary(row: BrochureDictionaryRow) {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sortOrder,
    created_at: row.createdAt
  };
}

function urlForStoragePath(storagePath: string | null | undefined) {
  return storagePath ? `/uploads/${storagePath}` : null;
}

function serializeVersion(row: BrochureVersionRow) {
  return {
    id: row.id,
    brochure_id: row.brochureId,
    version_no: row.versionNo,
    note: row.note,
    filename: row.filename,
    storage_path: row.storagePath,
    url: urlForStoragePath(row.storagePath),
    mime: row.mime,
    size: row.size,
    uploaded_by: row.uploadedBy,
    uploaded_at: row.uploadedAt
  };
}

function serializeBrochure(row: BrochureRow) {
  return {
    id: row.id,
    name: row.name,
    industry_id: row.industryId,
    category_id: row.categoryId,
    notes: row.notes,
    current_version_id: row.currentVersionId,
    sort_order: row.sortOrder,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    created_by: row.createdBy
  };
}

function serializeBrochureListRow(row: {
  brochure: BrochureRow;
  industry: BrochureDictionaryRow | null;
  category: BrochureDictionaryRow | null;
  currentVersion: BrochureVersionRow | null;
}) {
  const base = serializeBrochure(row.brochure);
  return {
    ...base,
    industry_name: row.industry?.name ?? null,
    category_name: row.category?.name ?? null,
    current_version: row.currentVersion ? serializeVersion(row.currentVersion) : null,
    current_version_no: row.currentVersion?.versionNo ?? null,
    current_filename: row.currentVersion?.filename ?? null,
    current_uploaded_at: row.currentVersion?.uploadedAt ?? null,
    current_mime: row.currentVersion?.mime ?? null,
    current_storage_path: row.currentVersion?.storagePath ?? null,
    current_url: urlForStoragePath(row.currentVersion?.storagePath)
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

  await pipeline(part.file, counter, createWriteStream(absolutePath));

  return {
    filename: part.filename,
    storagePath,
    mime: part.mimetype,
    size
  };
}

async function unlinkStoragePath(storagePath: string | null | undefined) {
  if (!storagePath) return;
  try {
    await unlink(join(uploadRoot, storagePath));
  } catch {
    // Best-effort cleanup only; stale files should not break API writes.
  }
}

function fieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

async function readMultipartWithFirstFile(request: FastifyRequest) {
  const fields: MultipartFields = {};
  let file:
    | {
        filename: string;
        storagePath: string;
        mime: string;
        size: number;
      }
    | null = null;

  for await (const part of request.parts()) {
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

  return { fields, file };
}

export async function registerBrochureRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/brochure-industries", { preHandler: requirePerm("brochure.view") }, async () => {
    const rows = await db.select().from(brochureIndustries).orderBy(asc(brochureIndustries.sortOrder), asc(brochureIndustries.name));
    return { industries: rows.map(serializeDictionary) };
  });

  app.post("/brochure-industries", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const body = parseWithSchema(brochureIndustryCreateSchema, request.body);
    const [row] = await db
      .insert(brochureIndustries)
      .values({ name: body.name, sortOrder: body.sort_order })
      .returning();
    if (!row) throw new Error("brochure_industry_create_failed");
    return reply.code(201).send({ industry: serializeDictionary(row) });
  });

  app.patch("/brochure-industries/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(brochureIndustryUpdateSchema, request.body);
    const [row] = await db
      .update(brochureIndustries)
      .set({ name: body.name, sortOrder: body.sort_order })
      .where(eq(brochureIndustries.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    return { industry: serializeDictionary(row) };
  });

  app.delete("/brochure-industries/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [row] = await db.delete(brochureIndustries).where(eq(brochureIndustries.id, id)).returning({ id: brochureIndustries.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/brochure-categories", { preHandler: requirePerm("brochure.view") }, async () => {
    const rows = await db.select().from(brochureCategories).orderBy(asc(brochureCategories.sortOrder), asc(brochureCategories.name));
    return { categories: rows.map(serializeDictionary) };
  });

  app.post("/brochure-categories", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const body = parseWithSchema(brochureCategoryCreateSchema, request.body);
    const [row] = await db
      .insert(brochureCategories)
      .values({ name: body.name, sortOrder: body.sort_order })
      .returning();
    if (!row) throw new Error("brochure_category_create_failed");
    return reply.code(201).send({ category: serializeDictionary(row) });
  });

  app.patch("/brochure-categories/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(brochureCategoryUpdateSchema, request.body);
    const [row] = await db
      .update(brochureCategories)
      .set({ name: body.name, sortOrder: body.sort_order })
      .where(eq(brochureCategories.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    return { category: serializeDictionary(row) };
  });

  app.delete("/brochure-categories/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [row] = await db.delete(brochureCategories).where(eq(brochureCategories.id, id)).returning({ id: brochureCategories.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/brochures", { preHandler: requirePerm("brochure.view") }, async (request) => {
    const query = parseWithSchema(brochureListQuerySchema, request.query);
    const pagination = getPagination(query);
    const filters = [];
    if (query.industry_id) filters.push(eq(brochures.industryId, query.industry_id));
    if (query.category_id) filters.push(eq(brochures.categoryId, query.category_id));
    if (query.q) filters.push(or(sql`${brochures.name} ilike ${`%${query.q}%`}`, sql`${brochures.notes} ilike ${`%${query.q}%`}`)!);
    const whereClause = filters.length > 0 ? and(...filters) : sql`true`;

    const baseQuery = db
      .select({
        brochure: brochures,
        industry: brochureIndustries,
        category: brochureCategories,
        currentVersion: brochureVersions
      })
      .from(brochures)
      .leftJoin(brochureIndustries, eq(brochures.industryId, brochureIndustries.id))
      .leftJoin(brochureCategories, eq(brochures.categoryId, brochureCategories.id))
      .leftJoin(brochureVersions, eq(brochures.currentVersionId, brochureVersions.id))
      .where(whereClause)
      .orderBy(asc(brochures.sortOrder), desc(brochures.updatedAt));

    const rows = pagination.paginate
      ? await baseQuery.limit(pagination.limit).offset(pagination.offset)
      : await baseQuery;

    if (!pagination.paginate) {
      return { brochures: rows.map(serializeBrochureListRow) };
    }

    const [totalRow] = await db.select({ total: count() }).from(brochures).where(whereClause);
    return {
      brochures: rows.map(serializeBrochureListRow),
      total: totalRow?.total ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });

  app.post("/brochures", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { fields, file } = await readMultipartWithFirstFile(request);
    if (!file) return reply.code(400).send({ error: "file_required" });

    try {
      const body = parseWithSchema(brochureCreateSchema, fields);
      const result = await db.transaction(async (tx) => {
        const [brochure] = await tx
          .insert(brochures)
          .values({
            name: body.name,
            industryId: body.industry_id,
            categoryId: body.category_id,
            notes: body.notes,
            sortOrder: body.sort_order,
            currentVersionId: null,
            createdBy: request.user.id,
            updatedAt: new Date()
          })
          .returning();
        if (!brochure) throw new Error("brochure_create_failed");

        const [version] = await tx
          .insert(brochureVersions)
          .values({
            brochureId: brochure.id,
            versionNo: 1,
            filename: file.filename,
            storagePath: file.storagePath,
            mime: file.mime,
            size: file.size,
            uploadedBy: request.user.id
          })
          .returning();
        if (!version) throw new Error("brochure_version_create_failed");

        const [updatedBrochure] = await tx
          .update(brochures)
          .set({ currentVersionId: version.id, updatedAt: new Date() })
          .where(eq(brochures.id, brochure.id))
          .returning();
        if (!updatedBrochure) throw new Error("brochure_current_version_update_failed");

        return { brochure: updatedBrochure, version };
      });

      return reply.code(201).send({
        brochure: {
          ...serializeBrochure(result.brochure),
          current_version: serializeVersion(result.version)
        }
      });
    } catch (error) {
      await unlinkStoragePath(file.storagePath);
      throw error;
    }
  });

  app.patch("/brochures/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(brochureUpdateSchema, request.body);
    const [row] = await db
      .update(brochures)
      .set({
        name: body.name,
        industryId: body.industry_id,
        categoryId: body.category_id,
        notes: body.notes,
        sortOrder: body.sort_order,
        updatedAt: new Date()
      })
      .where(eq(brochures.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    return { brochure: serializeBrochure(row) };
  });

  app.delete("/brochures/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const versions = await db.select().from(brochureVersions).where(eq(brochureVersions.brochureId, id));
    const [row] = await db.delete(brochures).where(eq(brochures.id, id)).returning({ id: brochures.id });
    if (!row) return sendNotFound(reply);
    await Promise.all(versions.map((version) => unlinkStoragePath(version.storagePath)));
    return { ok: true };
  });

  app.get("/brochures/:id/versions", { preHandler: requirePerm("brochure.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [brochure] = await db.select({ id: brochures.id }).from(brochures).where(eq(brochures.id, id)).limit(1);
    if (!brochure) return sendNotFound(reply);
    const rows = await db
      .select()
      .from(brochureVersions)
      .where(eq(brochureVersions.brochureId, id))
      .orderBy(desc(brochureVersions.versionNo));
    return { versions: rows.map(serializeVersion) };
  });

  app.post("/brochures/:id/versions", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const { fields, file } = await readMultipartWithFirstFile(request);
    if (!file) return reply.code(400).send({ error: "file_required" });

    try {
      const body = parseWithSchema(brochureVersionUploadSchema, fields);
      const result = await db.transaction(async (tx) => {
        const [brochure] = await tx.select().from(brochures).where(eq(brochures.id, id)).limit(1);
        if (!brochure) return null;

        const [next] = await tx
          .select({ versionNo: sql<number>`coalesce(max(${brochureVersions.versionNo}), 0) + 1` })
          .from(brochureVersions)
          .where(eq(brochureVersions.brochureId, id));

        const [version] = await tx
          .insert(brochureVersions)
          .values({
            brochureId: id,
            versionNo: next?.versionNo ?? 1,
            note: body.note,
            filename: file.filename,
            storagePath: file.storagePath,
            mime: file.mime,
            size: file.size,
            uploadedBy: request.user.id
          })
          .returning();
        if (!version) throw new Error("brochure_version_create_failed");

        if (body.set_current ?? true) {
          await tx.update(brochures).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(brochures.id, id));
        }

        return version;
      });

      if (!result) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }

      return reply.code(201).send({ version: serializeVersion(result) });
    } catch (error) {
      await unlinkStoragePath(file.storagePath);
      throw error;
    }
  });

  app.patch("/brochures/:id/current", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(brochureSetCurrentSchema, request.body);
    const [version] = await db
      .select()
      .from(brochureVersions)
      .where(and(eq(brochureVersions.id, body.version_id), eq(brochureVersions.brochureId, id)))
      .limit(1);
    if (!version) return reply.code(400).send({ error: "version_not_in_brochure" });

    const [row] = await db
      .update(brochures)
      .set({ currentVersionId: body.version_id, updatedAt: new Date() })
      .where(eq(brochures.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    return { brochure: serializeBrochure(row), current_version: serializeVersion(version) };
  });

  app.delete("/brochures/:id/versions/:vid", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id, vid } = parseWithSchema(versionParamsSchema, request.params);
    const result = await db.transaction(async (tx) => {
      const [brochure] = await tx.select().from(brochures).where(eq(brochures.id, id)).limit(1);
      if (!brochure) return null;

      const [target] = await tx
        .select()
        .from(brochureVersions)
        .where(and(eq(brochureVersions.id, vid), eq(brochureVersions.brochureId, id)))
        .limit(1);
      if (!target) return null;

      await tx.delete(brochureVersions).where(eq(brochureVersions.id, vid));

      let currentVersionId = brochure.currentVersionId;
      if (brochure.currentVersionId === vid) {
        const [fallback] = await tx
          .select()
          .from(brochureVersions)
          .where(eq(brochureVersions.brochureId, id))
          .orderBy(desc(brochureVersions.versionNo))
          .limit(1);
        currentVersionId = fallback?.id ?? null;
        await tx.update(brochures).set({ currentVersionId, updatedAt: new Date() }).where(eq(brochures.id, id));
      }

      return { target, currentVersionId };
    });

    if (!result) return sendNotFound(reply);
    await unlinkStoragePath(result.target.storagePath);
    return { ok: true, current_version_id: result.currentVersionId };
  });
}
