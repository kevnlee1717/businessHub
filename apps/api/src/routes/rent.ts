import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db, documents, rentFiles, rentLocations } from "@bh/db";
import { rentLocationCreateSchema, rentLocationUpdateSchema } from "@bh/shared";
import { count, desc, eq, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { deleteUpload, saveUpload } from "../lib/files";
import { idParamsSchema, parseWithSchema } from "./hrUtils";

function toNumericString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? String(n) : null;
}

function serializeLocation(row: typeof rentLocations.$inferSelect, fileCount = 0) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    landlord_name: row.landlordName,
    lease_start: row.leaseStart,
    lease_months: row.leaseMonths,
    monthly_rent: row.monthlyRent,
    deposit: row.deposit,
    currency: row.currency,
    note: row.note,
    sort_order: row.sortOrder,
    created_at: row.createdAt,
    file_count: fileCount
  };
}

function locationValues(input: z.infer<typeof rentLocationCreateSchema>) {
  return {
    name: input.name,
    address: input.address ?? null,
    lat: toNumericString(input.lat),
    lng: toNumericString(input.lng),
    landlordName: input.landlord_name ?? null,
    leaseStart: input.lease_start ?? null,
    leaseMonths: input.lease_months ?? null,
    monthlyRent: toNumericString(input.monthly_rent),
    deposit: toNumericString(input.deposit),
    currency: input.currency ?? "SGD",
    note: input.note ?? null,
    sortOrder: input.sort_order ?? 0
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

async function discardFile(file: NodeJS.ReadableStream): Promise<void> {
  await pipeline(
    file,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

const fileMetaFieldsSchema = z.object({
  location_id: z.string().uuid(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  doc_tag: z.string().trim().min(1).optional(),
  paid_at: z.string().datetime().optional(),
  note: z.string().trim().min(1).optional()
});

export async function registerRentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // ---- 地点 ----
  app.get("/rent/locations", { preHandler: requirePerm("document.view") }, async () => {
    const rows = await db.select().from(rentLocations).orderBy(rentLocations.sortOrder, rentLocations.createdAt);
    const counts = await db
      .select({ locationId: rentFiles.locationId, value: count() })
      .from(rentFiles)
      .groupBy(rentFiles.locationId);
    const countMap = new Map(counts.map((c) => [c.locationId, c.value]));
    return { locations: rows.map((row) => serializeLocation(row, countMap.get(row.id) ?? 0)) };
  });

  app.post("/rent/locations", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const input = parseWithSchema(rentLocationCreateSchema, request.body);
    const [row] = await db.insert(rentLocations).values(locationValues(input)).returning();
    return reply.code(201).send({ location: serializeLocation(row!) });
  });

  app.patch("/rent/locations/:id", { preHandler: requirePerm("document.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const input = parseWithSchema(rentLocationUpdateSchema, request.body);
    const full = locationValues(input as z.infer<typeof rentLocationCreateSchema>);
    // 只更新传入的字段。
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = full.name;
    if (input.address !== undefined) patch.address = full.address;
    if (input.lat !== undefined) patch.lat = full.lat;
    if (input.lng !== undefined) patch.lng = full.lng;
    if (input.landlord_name !== undefined) patch.landlordName = full.landlordName;
    if (input.lease_start !== undefined) patch.leaseStart = full.leaseStart;
    if (input.lease_months !== undefined) patch.leaseMonths = full.leaseMonths;
    if (input.monthly_rent !== undefined) patch.monthlyRent = full.monthlyRent;
    if (input.deposit !== undefined) patch.deposit = full.deposit;
    if (input.currency !== undefined) patch.currency = full.currency;
    if (input.note !== undefined) patch.note = full.note;
    if (input.sort_order !== undefined) patch.sortOrder = full.sortOrder;
    const [row] = await db.update(rentLocations).set(patch).where(eq(rentLocations.id, id)).returning();
    return { location: serializeLocation(row!) };
  });

  app.delete("/rent/locations/:id", { preHandler: requirePerm("document.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    // 先删该地点下文件对应的 documents + 物理文件(rent_files 会随地点级联删)。
    const linked = await db
      .select({ documentId: rentFiles.documentId, storagePath: documents.storagePath })
      .from(rentFiles)
      .innerJoin(documents, eq(rentFiles.documentId, documents.id))
      .where(eq(rentFiles.locationId, id));
    await db.delete(rentLocations).where(eq(rentLocations.id, id));
    for (const link of linked) {
      await db.delete(documents).where(eq(documents.id, link.documentId));
      await deleteUpload(link.storagePath);
    }
    return { ok: true } as const;
  });

  // ---- 文件 ----
  app.get("/rent/locations/:id/files", { preHandler: requirePerm("document.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select({
        id: rentFiles.id,
        period: rentFiles.period,
        doc_tag: rentFiles.docTag,
        paid_at: rentFiles.paidAt,
        note: rentFiles.note,
        document_id: documents.id,
        filename: documents.filename,
        storage_path: documents.storagePath,
        mime: documents.mime,
        uploaded_at: documents.uploadedAt
      })
      .from(rentFiles)
      .innerJoin(documents, eq(rentFiles.documentId, documents.id))
      .where(eq(rentFiles.locationId, id))
      // 最后付款的在上面:paid_at 倒序(空值排最后),再按月份倒序。
      .orderBy(sql`${rentFiles.paidAt} desc nulls last`, desc(rentFiles.period), desc(documents.uploadedAt));
    return { files: rows };
  });

  app.post("/rent/files", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const fields: Record<string, unknown> = {};
    let saved: typeof documents.$inferSelect | null = null;

    for await (const part of request.parts()) {
      if (part.type === "field") {
        fields[part.fieldname] = part.value;
        continue;
      }
      if (part.fieldname !== "file" || saved) {
        await discardFile(part.file);
        continue;
      }
      saved =
        (await saveUpload(part, { subjectType: "company", folderPath: "租房&租金", uploadedBy: request.user.id })) ??
        null;
      if (!saved) {
        throw new Error("rent_file_upload_failed");
      }
    }

    if (!saved) {
      return reply.code(400).send({ error: "file_required" });
    }

    const meta = fileMetaFieldsSchema.safeParse({
      location_id: stringField(fields.location_id),
      period: stringField(fields.period),
      doc_tag: stringField(fields.doc_tag),
      paid_at: stringField(fields.paid_at),
      note: stringField(fields.note)
    });
    if (!meta.success) {
      await db.delete(documents).where(eq(documents.id, saved.id));
      throw meta.error;
    }

    const [rentFile] = await db
      .insert(rentFiles)
      .values({
        locationId: meta.data.location_id,
        documentId: saved.id,
        period: meta.data.period ?? null,
        docTag: meta.data.doc_tag ?? null,
        paidAt: meta.data.paid_at ? new Date(meta.data.paid_at) : null,
        note: meta.data.note ?? null
      })
      .returning();

    return reply.code(201).send({ file: { ...rentFile, filename: saved.filename, storage_path: saved.storagePath } });
  });

  app.delete("/rent/files/:id", { preHandler: requirePerm("document.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [row] = await db.select().from(rentFiles).where(eq(rentFiles.id, id));
    if (row) {
      const [doc] = await db.select({ storagePath: documents.storagePath }).from(documents).where(eq(documents.id, row.documentId));
      await db.delete(rentFiles).where(eq(rentFiles.id, id));
      await db.delete(documents).where(eq(documents.id, row.documentId));
      if (doc) {
        await deleteUpload(doc.storagePath);
      }
    }
    return { ok: true } as const;
  });
}
