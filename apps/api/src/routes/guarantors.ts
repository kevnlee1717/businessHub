import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { caseSubmissions, cases, clients, db, documents, guarantors } from "@bh/db";
import { computeGuarantorStats, computeGuarantorSummary, guarantorCreateSchema, guarantorUpdateSchema, latestSubmissionResult } from "@bh/shared";
import { count, desc, eq, inArray } from "drizzle-orm";
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
    const result = await Promise.all(
      rows.map(async (row) => {
        const caseRows = await db.select().from(cases).where(eq(cases.guarantorId, row.id));
        const ids = caseRows.map((c) => c.id);
        const subs = ids.length
          ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, ids))
          : [];
        const stats = computeGuarantorStats(
          caseRows.map((c) => ({
            caseId: c.id,
            createdAt: c.createdAt.toISOString(),
            latestResult: latestSubmissionResult(
              subs
                .filter((s) => s.caseId === c.id)
                .map((s) => ({
                  result: s.result,
                  submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
                  createdAt: s.createdAt.toISOString()
                }))
            )
          }))
        );
        return { ...serializeGuarantor(row), sponsored_count: stats.total, stats };
      })
    );

    if (pagination.paginate) {
      const [totalRow] = await db.select({ total: count() }).from(guarantors);

      return {
        guarantors: result,
        total: Number(totalRow?.total ?? 0),
        page: pagination.page,
        page_size: pagination.pageSize
      };
    }

    return { guarantors: result };
  });

  app.get("/guarantors/stats", { preHandler: requirePerm("case.view") }, async () => {
    const rows = await db.select({ id: guarantors.id }).from(guarantors);
    const guarantorIds = rows.map((r) => r.id);
    const caseRows = guarantorIds.length
      ? await db.select().from(cases).where(inArray(cases.guarantorId, guarantorIds))
      : [];
    const caseIds = caseRows.map((c) => c.id);
    const subs = caseIds.length
      ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, caseIds))
      : [];
    const subsByCase = new Map<string, typeof subs>();
    for (const s of subs) {
      const list = subsByCase.get(s.caseId) ?? [];
      list.push(s);
      subsByCase.set(s.caseId, list);
    }
    const casesByGuarantor = new Map<string, typeof caseRows>();
    for (const c of caseRows) {
      if (!c.guarantorId) continue;
      const list = casesByGuarantor.get(c.guarantorId) ?? [];
      list.push(c);
      casesByGuarantor.set(c.guarantorId, list);
    }
    const perGuarantor = rows.map((r) =>
      computeGuarantorStats(
        (casesByGuarantor.get(r.id) ?? []).map((c) => ({
          caseId: c.id,
          createdAt: c.createdAt.toISOString(),
          latestResult: latestSubmissionResult(
            (subsByCase.get(c.id) ?? []).map((s) => ({
              result: s.result,
              submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
              createdAt: s.createdAt.toISOString()
            }))
          )
        }))
      )
    );
    return { summary: computeGuarantorSummary(perGuarantor) };
  });

  app.get("/guarantors/:id", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [guarantor] = await db.select().from(guarantors).where(eq(guarantors.id, id)).limit(1);

    if (!guarantor) {
      return sendNotFound(reply);
    }

    const caseRows = await db.select().from(cases).where(eq(cases.guarantorId, id)).orderBy(desc(cases.createdAt));
    const caseIds = caseRows.map((c) => c.id);
    const subs = caseIds.length
      ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, caseIds))
      : [];
    const clientIds = caseRows.map((c) => c.clientId).filter((x): x is string => Boolean(x));
    const clientRows = clientIds.length
      ? await db.select().from(clients).where(inArray(clients.id, clientIds))
      : [];
    const clientNameById = new Map(clientRows.map((cl) => [cl.id, cl.name]));
    const casesWithResult = caseRows.map((c) => ({
      ...serializeCaseBrief(c),
      client_name: c.clientId ? clientNameById.get(c.clientId) ?? null : null,
      latest_result: latestSubmissionResult(
        subs
          .filter((s) => s.caseId === c.id)
          .map((s) => ({
            result: s.result,
            submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
            createdAt: s.createdAt.toISOString()
          }))
      )
    }));

    return {
      guarantor: {
        ...serializeGuarantor(guarantor),
        sponsored_count: caseRows.length,
        cases: casesWithResult
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
