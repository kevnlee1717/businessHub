import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { cases, db, documents, guarantors } from "@bh/db";
import { guarantorCreateSchema, guarantorUpdateSchema } from "@bh/shared";
import { count, desc, eq, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeGuarantor(row: typeof guarantors.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    nric: row.nric,
    gender: row.gender,
    age: row.age,
    id_card_document_id: row.idCardDocumentId,
    note: row.note,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeCaseBrief(row: typeof cases.$inferSelect) {
  return {
    id: row.id,
    business_type: row.businessType,
    client_id: row.clientId,
    parent_case_id: row.parentCaseId,
    current_step: row.currentStep,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeDocument(row: typeof documents.$inferSelect) {
  return {
    id: row.id,
    storage_path: row.storagePath,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    uploaded_by: row.uploadedBy,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    client_id: row.clientId,
    category_id: row.categoryId,
    tags: row.tags,
    uploaded_at: row.uploadedAt
  };
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

async function sponsoredCount(guarantorId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cases)
    .where(eq(cases.guarantorId, guarantorId));

  return row?.count ?? 0;
}

const guarantorQuerySchema = z.object({}).merge(paginationQuery);

export async function registerGuarantorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/guarantors", { preHandler: requirePerm("case.view") }, async (request) => {
    const query = parseWithSchema(guarantorQuerySchema, request.query);
    const pagination = getPagination(query);
    const rows = pagination.paginate
      ? await db
          .select()
          .from(guarantors)
          .orderBy(desc(guarantors.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(guarantors).orderBy(desc(guarantors.createdAt));
    const serialized = await Promise.all(
      rows.map(async (row) => ({
        ...serializeGuarantor(row),
        sponsored_count: await sponsoredCount(row.id)
      }))
    );

    if (pagination.paginate) {
      const [totalRow] = await db.select({ total: count() }).from(guarantors);

      return {
        guarantors: serialized,
        total: Number(totalRow?.total ?? 0),
        page: pagination.page,
        page_size: pagination.pageSize
      };
    }

    return { guarantors: serialized };
  });

  app.get("/guarantors/:id", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [guarantor] = await db.select().from(guarantors).where(eq(guarantors.id, id)).limit(1);

    if (!guarantor) {
      return sendNotFound(reply);
    }

    const caseRows = await db.select().from(cases).where(eq(cases.guarantorId, id)).orderBy(desc(cases.createdAt));

    return {
      guarantor: {
        ...serializeGuarantor(guarantor),
        sponsored_count: caseRows.length,
        cases: caseRows.map(serializeCaseBrief)
      }
    };
  });

  app.post("/guarantors", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const body = parseWithSchema(guarantorCreateSchema, request.body);
    const [guarantor] = await db
      .insert(guarantors)
      .values({
        name: body.name,
        nric: body.nric,
        gender: body.gender,
        age: body.age,
        note: body.note
      })
      .returning();

    if (!guarantor) {
      throw new Error("guarantor_create_failed");
    }

    return reply.code(201).send({ guarantor: serializeGuarantor(guarantor) });
  });

  app.patch("/guarantors/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(guarantorUpdateSchema, request.body);
    const [guarantor] = await db
      .update(guarantors)
      .set({
        name: body.name,
        nric: body.nric,
        gender: body.gender,
        age: body.age,
        note: body.note,
        updatedAt: new Date()
      })
      .where(eq(guarantors.id, id))
      .returning();

    if (!guarantor) {
      return sendNotFound(reply);
    }

    return { guarantor: serializeGuarantor(guarantor) };
  });

  app.delete("/guarantors/:id", { preHandler: requirePerm("case.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(guarantors).where(eq(guarantors.id, id));
    return { ok: true };
  });

  app.post("/guarantors/:id/id-card", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(guarantors).where(eq(guarantors.id, id)).limit(1);

    if (!existing) {
      return sendNotFound(reply);
    }

    let uploadedDocument: typeof documents.$inferSelect | null = null;

    for await (const part of request.parts()) {
      if (part.type !== "file") {
        continue;
      }

      if (!uploadedDocument) {
        const document = await saveUpload(part, {
          subjectType: "guarantor_id_card",
          subjectId: id,
          uploadedBy: request.user.id
        });
        if (!document) {
          throw new Error("guarantor_id_card_upload_failed");
        }
        uploadedDocument = document;
      } else {
        await discardFile(part.file);
      }
    }

    if (!uploadedDocument) {
      return reply.code(400).send({ error: "file_required" });
    }

    const [guarantor] = await db
      .update(guarantors)
      .set({ idCardDocumentId: uploadedDocument.id, updatedAt: new Date() })
      .where(eq(guarantors.id, id))
      .returning();

    if (!guarantor) {
      return sendNotFound(reply);
    }

    return { guarantor: serializeGuarantor(guarantor), document: serializeDocument(uploadedDocument) };
  });
}
