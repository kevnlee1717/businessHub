import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { caseStepDocuments, caseSteps, cases, db, documents, followUps, templateSteps } from "@bh/db";
import {
  businessTypes,
  caseCreateSchema,
  caseStatuses,
  caseUpdateSchema,
  caseStepDocCreateSchema,
  caseStepDocUpdateSchema,
  caseStepUpdateSchema,
  followUpCreateSchema
} from "@bh/shared";
import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeCase(row: typeof cases.$inferSelect) {
  return {
    id: row.id,
    business_type: row.businessType,
    client_id: row.clientId,
    current_step: row.currentStep,
    status: row.status,
    billing_id: row.billingId,
    guarantor_name: row.guarantorName,
    guarantor_relation: row.guarantorRelation,
    guarantor_contact: row.guarantorContact,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeCaseStep(row: typeof caseSteps.$inferSelect) {
  return {
    id: row.id,
    case_id: row.caseId,
    step_order: row.stepOrder,
    name: row.name,
    name_en: row.nameEn,
    description: row.description,
    assignee_id: row.assigneeId,
    status: row.status,
    completed_at: row.completedAt,
    created_at: row.createdAt
  };
}

function serializeCaseStepDoc(row: typeof caseStepDocuments.$inferSelect) {
  return {
    id: row.id,
    case_step_id: row.caseStepId,
    doc_name: row.docName,
    doc_name_en: row.docNameEn,
    is_required: row.isRequired,
    status: row.status,
    document_id: row.documentId,
    created_at: row.createdAt
  };
}

function serializeFollowUp(row: typeof followUps.$inferSelect) {
  return {
    id: row.id,
    case_step_id: row.caseStepId,
    author_id: row.authorId,
    content: row.content,
    created_at: row.createdAt
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

const caseQuerySchema = z.object({
  business_type: z.enum(businessTypes).optional(),
  status: z.enum(caseStatuses).optional(),
  client_id: z.string().uuid().optional()
});

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

async function recalculateCurrentStep(caseId: string): Promise<void> {
  const remainingSteps = await db
    .select({ stepOrder: caseSteps.stepOrder })
    .from(caseSteps)
    .where(and(eq(caseSteps.caseId, caseId), ne(caseSteps.status, "done")))
    .orderBy(asc(caseSteps.stepOrder))
    .limit(1);

  let currentStep = remainingSteps[0]?.stepOrder;

  if (currentStep === undefined) {
    const lastSteps = await db
      .select({ stepOrder: caseSteps.stepOrder })
      .from(caseSteps)
      .where(eq(caseSteps.caseId, caseId))
      .orderBy(desc(caseSteps.stepOrder))
      .limit(1);

    currentStep = lastSteps[0]?.stepOrder ?? 0;
  }

  await db.update(cases).set({ currentStep, updatedAt: new Date() }).where(eq(cases.id, caseId));
}

export async function registerCaseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/cases", { preHandler: requirePerm("case.view") }, async (request) => {
    const query = parseWithSchema(caseQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.business_type) {
      filters.push(eq(cases.businessType, query.business_type));
    }
    if (query.status) {
      filters.push(eq(cases.status, query.status));
    }
    if (query.client_id) {
      filters.push(eq(cases.clientId, query.client_id));
    }

    const rows = await db
      .select()
      .from(cases)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(cases.createdAt));

    return { cases: rows.map(serializeCase) };
  });

  app.get("/cases/:id", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const stepRows = await db.select().from(caseSteps).where(eq(caseSteps.caseId, id)).orderBy(asc(caseSteps.stepOrder));
    const stepIds = stepRows.map((step) => step.id);
    const documentRows =
      stepRows.length === 0
        ? []
        : await db
            .select()
            .from(caseStepDocuments)
            .where(inArray(caseStepDocuments.caseStepId, stepIds))
            .orderBy(asc(caseStepDocuments.createdAt));
    const documentsByStep = new Map<string, (typeof caseStepDocuments.$inferSelect)[]>();

    for (const documentRow of documentRows) {
      const items = documentsByStep.get(documentRow.caseStepId) ?? [];
      items.push(documentRow);
      documentsByStep.set(documentRow.caseStepId, items);
    }

    return {
      case: serializeCase(caseRow),
      steps: stepRows.map((step) => ({
        ...serializeCaseStep(step),
        documents: (documentsByStep.get(step.id) ?? []).map(serializeCaseStepDoc)
      }))
    };
  });

  app.post("/cases", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const body = parseWithSchema(caseCreateSchema, request.body);

    if (body.business_type === "ica" && !body.guarantor_name) {
      return reply.code(400).send({ error: "guarantor_required" });
    }

    const created = await db.transaction(async (tx) => {
      const [caseRow] = await tx
        .insert(cases)
        .values({
          businessType: body.business_type,
          clientId: body.client_id ?? null,
          currentStep: 0,
          status: "open",
          billingId: body.billing_id ?? null,
          guarantorName: body.guarantor_name,
          guarantorRelation: body.guarantor_relation,
          guarantorContact: body.guarantor_contact
        })
        .returning();

      if (!caseRow) {
        throw new Error("case_create_failed");
      }

      if (!body.template_id) {
        return { caseRow, stepRows: [] };
      }

      const templateStepRows = await tx
        .select()
        .from(templateSteps)
        .where(eq(templateSteps.templateId, body.template_id))
        .orderBy(asc(templateSteps.stepOrder));
      const stepRows: (typeof caseSteps.$inferSelect)[] = [];

      for (const templateStep of templateStepRows) {
        const [step] = await tx
          .insert(caseSteps)
          .values({
            caseId: caseRow.id,
            stepOrder: templateStep.stepOrder,
            name: templateStep.name,
            nameEn: templateStep.nameEn,
            description: templateStep.description,
            assigneeId: null
          })
          .returning();

        if (!step) {
          throw new Error("case_step_snapshot_failed");
        }

        stepRows.push(step);

        for (const item of templateStep.requiredDocuments) {
          await tx.insert(caseStepDocuments).values({
            caseStepId: step.id,
            docName: item.name,
            docNameEn: item.name_en,
            isRequired: item.required ?? true,
            status: "missing"
          });
        }
      }

      const firstStepOrder = stepRows[0]?.stepOrder;
      if (firstStepOrder !== undefined) {
        const [updatedCase] = await tx
          .update(cases)
          .set({ currentStep: firstStepOrder, updatedAt: new Date() })
          .where(eq(cases.id, caseRow.id))
          .returning();

        return { caseRow: updatedCase ?? caseRow, stepRows };
      }

      return { caseRow, stepRows };
    });

    return reply
      .code(201)
      .send({ case: serializeCase(created.caseRow), steps: created.stepRows.map(serializeCaseStep) });
  });

  app.patch("/cases/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseUpdateSchema, request.body);
    const [caseRow] = await db
      .update(cases)
      .set({
        clientId: body.client_id,
        billingId: body.billing_id,
        status: body.status,
        currentStep: body.current_step,
        guarantorName: body.guarantor_name,
        guarantorRelation: body.guarantor_relation,
        guarantorContact: body.guarantor_contact,
        updatedAt: new Date()
      })
      .where(eq(cases.id, id))
      .returning();

    if (!caseRow) {
      return sendNotFound(reply);
    }

    return { case: serializeCase(caseRow) };
  });

  app.patch("/case-steps/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseStepUpdateSchema, request.body);
    const [step] = await db
      .update(caseSteps)
      .set({
        name: body.name,
        nameEn: body.name_en,
        description: body.description,
        assigneeId: body.assignee_id,
        status: body.status,
        stepOrder: body.step_order,
        completedAt: body.status === undefined ? undefined : body.status === "done" ? new Date() : null
      })
      .where(eq(caseSteps.id, id))
      .returning();

    if (!step) {
      return sendNotFound(reply);
    }

    await recalculateCurrentStep(step.caseId);

    return { step: serializeCaseStep(step) };
  });

  app.post("/case-steps/:id/documents", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseStepDocCreateSchema, request.body);
    const [step] = await db.select().from(caseSteps).where(eq(caseSteps.id, id)).limit(1);

    if (!step) {
      return sendNotFound(reply);
    }

    const [documentRow] = await db
      .insert(caseStepDocuments)
      .values({
        caseStepId: id,
        docName: body.doc_name,
        docNameEn: body.doc_name_en,
        isRequired: body.is_required ?? true,
        status: "missing"
      })
      .returning();

    if (!documentRow) {
      throw new Error("case_step_document_create_failed");
    }

    return reply.code(201).send({ document: serializeCaseStepDoc(documentRow) });
  });

  app.patch("/case-step-documents/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseStepDocUpdateSchema, request.body);
    const documentStatus = body.document_id === undefined ? undefined : body.document_id === null ? "missing" : "uploaded";
    const [documentRow] = await db
      .update(caseStepDocuments)
      .set({
        docName: body.doc_name,
        docNameEn: body.doc_name_en,
        isRequired: body.is_required,
        documentId: body.document_id,
        status: documentStatus
      })
      .where(eq(caseStepDocuments.id, id))
      .returning();

    if (!documentRow) {
      return sendNotFound(reply);
    }

    return { document: serializeCaseStepDoc(documentRow) };
  });

  app.post("/case-step-documents/:id/upload", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [slot] = await db.select().from(caseStepDocuments).where(eq(caseStepDocuments.id, id)).limit(1);

    if (!slot) {
      return sendNotFound(reply);
    }

    const [step] = await db.select().from(caseSteps).where(eq(caseSteps.id, slot.caseStepId)).limit(1);
    if (!step) {
      return sendNotFound(reply);
    }

    const [caseRow] = await db.select().from(cases).where(eq(cases.id, step.caseId)).limit(1);
    if (!caseRow) {
      return sendNotFound(reply);
    }

    let uploadedDocument: typeof documents.$inferSelect | null = null;

    for await (const part of request.parts()) {
      if (part.type !== "file") {
        continue;
      }

      if (!uploadedDocument) {
        const document = await saveUpload(part, {
          subjectType: "case_step",
          subjectId: step.id,
          clientId: caseRow.clientId ?? null,
          uploadedBy: request.user.id
        });
        if (!document) {
          throw new Error("case_step_document_upload_failed");
        }
        uploadedDocument = document;
      } else {
        await discardFile(part.file);
      }
    }

    if (!uploadedDocument) {
      return reply.code(400).send({ error: "file_required" });
    }

    const [documentRow] = await db
      .update(caseStepDocuments)
      .set({ documentId: uploadedDocument.id, status: "uploaded" })
      .where(eq(caseStepDocuments.id, id))
      .returning();

    if (!documentRow) {
      return sendNotFound(reply);
    }

    return { case_step_document: serializeCaseStepDoc(documentRow), document: serializeDocument(uploadedDocument) };
  });

  app.delete("/case-step-documents/:id", { preHandler: requirePerm("case.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(caseStepDocuments).where(eq(caseStepDocuments.id, id));
    return { ok: true };
  });

  app.get("/case-steps/:id/follow-ups", { preHandler: requirePerm("case.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select()
      .from(followUps)
      .where(eq(followUps.caseStepId, id))
      .orderBy(asc(followUps.createdAt));

    return { followUps: rows.map(serializeFollowUp) };
  });

  app.post("/case-steps/:id/follow-ups", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(followUpCreateSchema, request.body);
    const [step] = await db.select().from(caseSteps).where(eq(caseSteps.id, id)).limit(1);

    if (!step) {
      return sendNotFound(reply);
    }

    const [followUp] = await db
      .insert(followUps)
      .values({
        caseStepId: id,
        authorId: request.user.id,
        content: body.content
      })
      .returning();

    if (!followUp) {
      throw new Error("follow_up_create_failed");
    }

    return reply.code(201).send({ followUp: serializeFollowUp(followUp) });
  });
}
