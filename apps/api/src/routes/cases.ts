import {
  caseStepDocuments,
  caseSteps,
  caseSubmissions,
  cases,
  db,
  documents,
  followUps,
  guarantors,
  stepReviews,
  templateSteps
} from "@bh/db";
import {
  businessTypes,
  caseCreateSchema,
  caseSubmissionCreateSchema,
  caseSubmissionUpdateSchema,
  caseStatuses,
  caseUpdateSchema,
  caseStepDocCreateSchema,
  caseStepDocUpdateSchema,
  caseStepUpdateSchema,
  followUpCreateSchema,
  stepReviewMessageSchema,
  stepReviewRequestSchema
} from "@bh/shared";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { getTranslations, saveTranslation, type TranslationValue } from "../lib/translationStore";
import { ctxCan, getVisibleCaseIds, loadAuthContext } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { refreshBillingCharges } from "./billing";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeCase(row: typeof cases.$inferSelect) {
  return {
    id: row.id,
    business_type: row.businessType,
    parent_case_id: row.parentCaseId,
    client_id: row.clientId,
    current_step: row.currentStep,
    status: row.status,
    billing_id: row.billingId,
    guarantor_id: row.guarantorId,
    guarantor_name: row.guarantorName,
    guarantor_relation: row.guarantorRelation,
    guarantor_contact: row.guarantorContact,
    signed_at: row.signedAt,
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
    reviewer_id: row.reviewerId,
    review_status: row.reviewStatus,
    meta: row.meta,
    collections: row.collections,
    completed_at: row.completedAt,
    created_at: row.createdAt
  };
}

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

function serializeSubmission(row: typeof caseSubmissions.$inferSelect) {
  return {
    id: row.id,
    case_id: row.caseId,
    submitted_at: row.submittedAt,
    result: row.result,
    rejected_at: row.rejectedAt,
    note: row.note,
    created_at: row.createdAt
  };
}

function getSlotDocumentIds(row: typeof caseStepDocuments.$inferSelect) {
  return row.documentIds.length > 0 ? row.documentIds : row.documentId ? [row.documentId] : [];
}

function serializeCaseStepDoc(
  row: typeof caseStepDocuments.$inferSelect,
  files: Pick<typeof documents.$inferSelect, "id" | "filename" | "storagePath">[] = []
) {
  return {
    id: row.id,
    case_step_id: row.caseStepId,
    doc_name: row.docName,
    doc_name_en: row.docNameEn,
    is_required: row.isRequired,
    status: row.status,
    category_id: row.categoryId,
    document_id: row.documentId,
    document_ids: getSlotDocumentIds(row),
    files: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      storage_path: file.storagePath
    })),
    created_at: row.createdAt
  };
}

function serializeFollowUp(row: typeof followUps.$inferSelect, translation?: TranslationValue) {
  return {
    id: row.id,
    case_step_id: row.caseStepId,
    author_id: row.authorId,
    content: row.content,
    content_zh: translation?.zh ?? null,
    content_en: translation?.en ?? null,
    source_lang: translation?.source_lang ?? null,
    created_at: row.createdAt
  };
}

function serializeStepReview(
  row: typeof stepReviews.$inferSelect,
  files: Pick<typeof documents.$inferSelect, "id" | "filename" | "storagePath">[] = []
) {
  return {
    id: row.id,
    case_step_id: row.caseStepId,
    author_id: row.authorId,
    action: row.action,
    content: row.content,
    document_ids: row.documentIds,
    files: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      storage_path: file.storagePath
    })),
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
  client_id: z.string().uuid().optional(),
  parent_case_id: z.string().uuid().optional(),
  order_by: z.enum(["signed_at", "created_at"]).optional().default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc")
});

const caseStatsQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(9999).optional(),
  business_type: z.enum(businessTypes).optional()
});

function hasOwn(input: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function getCaseSort(orderBy: "signed_at" | "created_at", order: "asc" | "desc") {
  if (orderBy === "signed_at") {
    return [
      sql`${cases.signedAt} is null`,
      order === "asc" ? asc(cases.signedAt) : desc(cases.signedAt),
      desc(cases.createdAt)
    ];
  }

  return [order === "asc" ? asc(cases.createdAt) : desc(cases.createdAt)];
}

async function recalculateCurrentStep(caseId: string): Promise<void> {
  const stepRows = await db
    .select({
      stepOrder: caseSteps.stepOrder,
      status: caseSteps.status,
      reviewerId: caseSteps.reviewerId,
      reviewStatus: caseSteps.reviewStatus
    })
    .from(caseSteps)
    .where(eq(caseSteps.caseId, caseId))
    .orderBy(asc(caseSteps.stepOrder));

  const firstUnpassedStep = stepRows.find(
    (step) => step.status !== "done" || (step.reviewerId && step.reviewStatus !== "approved")
  );
  const currentStep = firstUnpassedStep?.stepOrder ?? stepRows[stepRows.length - 1]?.stepOrder ?? 0;

  await db.update(cases).set({ currentStep, updatedAt: new Date() }).where(eq(cases.id, caseId));
}

async function getReviewFilesById(reviewRows: (typeof stepReviews.$inferSelect)[]) {
  const documentIds = [...new Set(reviewRows.flatMap((review) => review.documentIds))];
  const fileRows =
    documentIds.length === 0
      ? []
      : await db
          .select({
            id: documents.id,
            filename: documents.filename,
            storagePath: documents.storagePath
          })
          .from(documents)
          .where(inArray(documents.id, documentIds));

  return new Map(fileRows.map((file) => [file.id, file]));
}

export async function registerCaseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/cases", { preHandler: requirePerm("case.view") }, async (request) => {
    const query = parseWithSchema(caseQuerySchema, request.query);
    const filters: SQL[] = [];
    const ctx = await loadAuthContext(request);

    if (query.business_type) {
      filters.push(eq(cases.businessType, query.business_type));
    }
    if (query.status) {
      filters.push(eq(cases.status, query.status));
    }
    if (query.client_id) {
      filters.push(eq(cases.clientId, query.client_id));
    }
    if (query.parent_case_id) {
      filters.push(eq(cases.parentCaseId, query.parent_case_id));
    } else {
      filters.push(isNull(cases.parentCaseId));
    }

    if (ctx.dataScope === "self") {
      const visibleCaseIds = await getVisibleCaseIds(request.user.id);
      filters.push(inArray(cases.id, visibleCaseIds.length ? visibleCaseIds : ["00000000-0000-0000-0000-000000000000"]));
    }

    const rows = await db
      .select()
      .from(cases)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(...getCaseSort(query.order_by ?? "created_at", query.order ?? "desc"));

    return { cases: rows.map(serializeCase) };
  });

  app.get("/cases/stats", { preHandler: requirePerm("case.view") }, async (request) => {
    const query = parseWithSchema(caseStatsQuerySchema, request.query);
    const ctx = await loadAuthContext(request);
    const filters: SQL[] = [];
    const effectiveDate = sql`coalesce(${cases.signedAt}, ${cases.createdAt}::date)`;

    if (query.business_type) {
      filters.push(eq(cases.businessType, query.business_type));
    }

    if (ctx.dataScope === "self") {
      const visibleCaseIds = await getVisibleCaseIds(request.user.id);
      filters.push(inArray(cases.id, visibleCaseIds.length ? visibleCaseIds : ["00000000-0000-0000-0000-000000000000"]));
    }

    const yearRows = await db
      .select({
        year: sql<number>`extract(year from ${effectiveDate})::int`
      })
      .from(cases)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .groupBy(sql`extract(year from ${effectiveDate})::int`)
      .orderBy(desc(sql`extract(year from ${effectiveDate})::int`));
    const availableYears = yearRows.map((row) => Number(row.year)).filter((year) => Number.isFinite(year));
    const selectedYear = query.year ?? availableYears[0] ?? new Date().getFullYear();
    const statsFilters = [
      ...filters,
      sql`extract(year from ${effectiveDate})::int = ${selectedYear}`
    ];
    const monthRows = await db
      .select({
        month: sql<number>`extract(month from ${effectiveDate})::int`,
        count: sql<number>`count(*)::int`
      })
      .from(cases)
      .where(and(...statsFilters))
      .groupBy(sql`extract(month from ${effectiveDate})::int`);
    const countByMonth = new Map(monthRows.map((row) => [Number(row.month), Number(row.count)]));
    const months = Array.from({ length: 12 }, (_value, index) => {
      const month = index + 1;
      return { month, count: countByMonth.get(month) ?? 0 };
    });

    return {
      year: selectedYear,
      business_type: query.business_type ?? null,
      months,
      total: months.reduce((sum, item) => sum + item.count, 0),
      available_years: availableYears
    };
  });

  app.get("/cases/:id", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const ctx = await loadAuthContext(request);

    if (ctx.dataScope === "self") {
      const visibleCaseIds = await getVisibleCaseIds(request.user.id);

      if (!visibleCaseIds.includes(id)) {
        return reply.code(403).send({ error: "forbidden" });
      }
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
    const slotDocumentIds = [...new Set(documentRows.flatMap(getSlotDocumentIds))];
    const slotFileRows =
      slotDocumentIds.length === 0
        ? []
        : await db
            .select({
              id: documents.id,
              filename: documents.filename,
              storagePath: documents.storagePath
            })
            .from(documents)
            .where(inArray(documents.id, slotDocumentIds));
    const slotFilesById = new Map(slotFileRows.map((file) => [file.id, file]));
    const reviewRows =
      stepRows.length === 0
        ? []
        : await db
            .select()
            .from(stepReviews)
            .where(inArray(stepReviews.caseStepId, stepIds))
            .orderBy(asc(stepReviews.createdAt));
    const reviewsByStep = new Map<string, (typeof stepReviews.$inferSelect)[]>();

    for (const reviewRow of reviewRows) {
      const items = reviewsByStep.get(reviewRow.caseStepId) ?? [];
      items.push(reviewRow);
      reviewsByStep.set(reviewRow.caseStepId, items);
    }
    const reviewFilesById = await getReviewFilesById(reviewRows);

    const childRows = await db.select().from(cases).where(eq(cases.parentCaseId, id)).orderBy(desc(cases.createdAt));
    const guarantorRow = caseRow.guarantorId
      ? (await db.select().from(guarantors).where(eq(guarantors.id, caseRow.guarantorId)).limit(1))[0] ?? null
      : null;
    const submissionRows = await db
      .select()
      .from(caseSubmissions)
      .where(eq(caseSubmissions.caseId, id))
      .orderBy(desc(caseSubmissions.createdAt));

    return {
      case: serializeCase(caseRow),
      steps: stepRows.map((step) => ({
        ...serializeCaseStep(step),
        documents: (documentsByStep.get(step.id) ?? []).map((documentRow) =>
          serializeCaseStepDoc(
            documentRow,
            getSlotDocumentIds(documentRow)
              .map((documentId) => slotFilesById.get(documentId))
              .filter((file): file is (typeof slotFileRows)[number] => Boolean(file))
          )
        ),
        reviews: (reviewsByStep.get(step.id) ?? []).map((review) =>
          serializeStepReview(
            review,
            review.documentIds
              .map((documentId) => reviewFilesById.get(documentId))
              .filter((file): file is NonNullable<ReturnType<typeof reviewFilesById.get>> => Boolean(file))
          )
        )
      })),
      children: childRows.map(serializeCase),
      guarantor: guarantorRow ? serializeGuarantor(guarantorRow) : null,
      submissions: submissionRows.map(serializeSubmission)
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
          parentCaseId: body.parent_case_id ?? null,
          clientId: body.client_id ?? null,
          currentStep: 0,
          status: "open",
          billingId: body.billing_id ?? null,
          guarantorName: body.guarantor_name,
          guarantorRelation: body.guarantor_relation,
          guarantorContact: body.guarantor_contact,
          signedAt: body.signed_at ?? null
        })
        .returning();

      if (!caseRow) {
        throw new Error("case_create_failed");
      }

      if (!body.template_id) {
        if (body.billing_id) {
          await refreshBillingCharges(body.billing_id, tx);
        }
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
            collections: templateStep.collections,
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
            categoryId: item.category_id ?? null,
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

        if (body.billing_id) {
          await refreshBillingCharges(body.billing_id, tx);
        }

        return { caseRow: updatedCase ?? caseRow, stepRows };
      }

      if (body.billing_id) {
        await refreshBillingCharges(body.billing_id, tx);
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

    const caseRow = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(cases).where(eq(cases.id, id)).limit(1);

      if (!current) {
        return null;
      }

      const [updated] = await tx
        .update(cases)
        .set({
          clientId: body.client_id,
          billingId: body.billing_id,
          status: body.status,
          currentStep: body.current_step,
          guarantorId: body.guarantor_id,
          guarantorName: body.guarantor_name,
          guarantorRelation: body.guarantor_relation,
          guarantorContact: body.guarantor_contact,
          signedAt: body.signed_at,
          updatedAt: new Date()
        })
        .where(eq(cases.id, id))
        .returning();

      if (!updated) {
        return null;
      }

      if (hasOwn(body, "billing_id") && body.billing_id && body.billing_id !== current.billingId) {
        await refreshBillingCharges(body.billing_id, tx);
      }

      return updated;
    });

    if (!caseRow) {
      return sendNotFound(reply);
    }

    return { case: serializeCase(caseRow) };
  });

  app.post("/cases/:id/submissions", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseSubmissionCreateSchema, request.body);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const [submission] = await db
      .insert(caseSubmissions)
      .values({
        caseId: id,
        submittedAt: body.submitted_at ? new Date(body.submitted_at) : new Date(),
        result: "pending",
        note: body.note
      })
      .returning();

    if (!submission) {
      throw new Error("case_submission_create_failed");
    }

    return reply.code(201).send({ submission: serializeSubmission(submission) });
  });

  app.get("/cases/:id/submissions", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const submissionRows = await db
      .select()
      .from(caseSubmissions)
      .where(eq(caseSubmissions.caseId, id))
      .orderBy(desc(caseSubmissions.createdAt));

    return { submissions: submissionRows.map(serializeSubmission) };
  });

  app.patch("/case-submissions/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseSubmissionUpdateSchema, request.body);
    const [submission] = await db
      .update(caseSubmissions)
      .set({
        result: body.result,
        rejectedAt: body.rejected_at === undefined ? undefined : body.rejected_at === null ? null : new Date(body.rejected_at),
        submittedAt:
          body.submitted_at === undefined ? undefined : body.submitted_at === null ? null : new Date(body.submitted_at),
        note: body.note
      })
      .where(eq(caseSubmissions.id, id))
      .returning();

    if (!submission) {
      return sendNotFound(reply);
    }

    return { submission: serializeSubmission(submission) };
  });

  app.patch("/case-steps/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseStepUpdateSchema, request.body);

    if (body.status === "done") {
      const requiredDocuments = await db
        .select()
        .from(caseStepDocuments)
        .where(and(eq(caseStepDocuments.caseStepId, id), eq(caseStepDocuments.isRequired, true)));
      const missingRequiredDocument = requiredDocuments.some((documentRow) => getSlotDocumentIds(documentRow).length === 0);

      if (missingRequiredDocument) {
        return reply.code(400).send({ error: "missing_required_documents" });
      }
    }

    const [step] = await db
      .update(caseSteps)
      .set({
        name: body.name,
        nameEn: body.name_en,
        description: body.description,
        assigneeId: body.assignee_id,
        status: body.status,
        stepOrder: body.step_order,
        meta: body.meta,
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
        categoryId: body.category_id ?? null,
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
    const nextDocumentIds =
      body.document_ids !== undefined
        ? body.document_ids ?? []
        : body.document_id !== undefined
          ? body.document_id === null
            ? []
            : [body.document_id]
          : undefined;
    const documentStatus = nextDocumentIds === undefined ? undefined : nextDocumentIds.length === 0 ? "missing" : "uploaded";
    const [documentRow] = await db
      .update(caseStepDocuments)
      .set({
        docName: body.doc_name,
        docNameEn: body.doc_name_en,
        categoryId: body.category_id,
        isRequired: body.is_required,
        documentId:
          nextDocumentIds === undefined
            ? body.document_id
            : nextDocumentIds.length === 0
              ? null
              : nextDocumentIds[nextDocumentIds.length - 1],
        documentIds: nextDocumentIds,
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

    const uploadedDocuments: (typeof documents.$inferSelect)[] = [];

    for await (const part of request.parts()) {
      if (part.type !== "file") {
        continue;
      }

      const document = await saveUpload(part, {
        subjectType: "case_step",
        subjectId: step.id,
        clientId: caseRow.clientId ?? null,
        uploadedBy: request.user.id
      });
      if (!document) {
        throw new Error("case_step_document_upload_failed");
      }
      uploadedDocuments.push(document);
    }

    if (uploadedDocuments.length === 0) {
      return reply.code(400).send({ error: "file_required" });
    }

    const nextDocumentIds = [...getSlotDocumentIds(slot), ...uploadedDocuments.map((document) => document.id)];
    const [documentRow] = await db
      .update(caseStepDocuments)
      .set({
        documentId: nextDocumentIds[nextDocumentIds.length - 1],
        documentIds: nextDocumentIds,
        status: "uploaded"
      })
      .where(eq(caseStepDocuments.id, id))
      .returning();

    if (!documentRow) {
      return sendNotFound(reply);
    }

    return {
      case_step_document: serializeCaseStepDoc(documentRow),
      documents: uploadedDocuments.map(serializeDocument)
    };
  });

  app.delete(
    "/case-step-documents/:id/files/:documentId",
    { preHandler: requirePerm("case.manage") },
    async (request, reply) => {
      const params = parseWithSchema(
        z.object({
          id: z.string().uuid(),
          documentId: z.string().uuid()
        }),
        request.params
      );
      const [slot] = await db.select().from(caseStepDocuments).where(eq(caseStepDocuments.id, params.id)).limit(1);

      if (!slot) {
        return sendNotFound(reply);
      }

      const nextDocumentIds = getSlotDocumentIds(slot).filter((documentId) => documentId !== params.documentId);
      const [documentRow] = await db
        .update(caseStepDocuments)
        .set({
          documentId: nextDocumentIds.length === 0 ? null : nextDocumentIds[nextDocumentIds.length - 1],
          documentIds: nextDocumentIds,
          status: nextDocumentIds.length === 0 ? "missing" : "uploaded"
        })
        .where(eq(caseStepDocuments.id, params.id))
        .returning();

      if (!documentRow) {
        return sendNotFound(reply);
      }

      return { document: serializeCaseStepDoc(documentRow) };
    }
  );

  app.delete("/case-step-documents/:id", { preHandler: requirePerm("case.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(caseStepDocuments).where(eq(caseStepDocuments.id, id));
    return { ok: true };
  });

  app.post("/case-steps/:id/review/request", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(stepReviewRequestSchema, request.body);
    const [step] = await db
      .update(caseSteps)
      .set({
        reviewerId: body.reviewer_id,
        reviewStatus: "pending"
      })
      .where(eq(caseSteps.id, id))
      .returning();

    if (!step) {
      return sendNotFound(reply);
    }

    const [review] = await db
      .insert(stepReviews)
      .values({
        caseStepId: id,
        authorId: request.user.id,
        action: "request",
        content: body.content
      })
      .returning();

    if (!review) {
      throw new Error("step_review_request_failed");
    }

    await recalculateCurrentStep(step.caseId);

    return reply.code(201).send({ step: serializeCaseStep(step), review: serializeStepReview(review) });
  });

  app.post("/case-steps/:id/review/messages", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [step] = await db.select().from(caseSteps).where(eq(caseSteps.id, id)).limit(1);

    if (!step) {
      return sendNotFound(reply);
    }

    const [caseRow] = await db.select().from(cases).where(eq(cases.id, step.caseId)).limit(1);
    if (!caseRow) {
      return sendNotFound(reply);
    }

    let action: string | undefined;
    let content: string | null | undefined;
    const uploadedDocuments: (typeof documents.$inferSelect)[] = [];

    for await (const part of request.parts()) {
      if (part.type === "file") {
        const document = await saveUpload(part, {
          subjectType: "step_review",
          subjectId: id,
          clientId: caseRow.clientId ?? null,
          uploadedBy: request.user.id
        });
        if (!document) {
          throw new Error("step_review_upload_failed");
        }
        uploadedDocuments.push(document);
        continue;
      }

      if (part.fieldname === "action") {
        action = String(part.value);
      }
      if (part.fieldname === "content") {
        const value = String(part.value).trim();
        content = value ? value : null;
      }
    }

    const body = parseWithSchema(stepReviewMessageSchema, { action, content });
    const canManageCase = await ctxCan(request, "case.manage");

    if (body.action === "comment") {
      if (!(await ctxCan(request, "case.view"))) {
        return reply.code(403).send({ error: "forbidden" });
      }
    } else if (step.reviewerId !== request.user.id && !canManageCase) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const [review] = await db
      .insert(stepReviews)
      .values({
        caseStepId: id,
        authorId: request.user.id,
        action: body.action,
        content: body.content,
        documentIds: uploadedDocuments.map((document) => document.id)
      })
      .returning();

    if (!review) {
      throw new Error("step_review_message_failed");
    }

    let updatedStep = step;
    if (body.action === "approve" || body.action === "reject") {
      const [nextStep] = await db
        .update(caseSteps)
        .set({ reviewStatus: body.action === "approve" ? "approved" : "rejected" })
        .where(eq(caseSteps.id, id))
        .returning();

      if (!nextStep) {
        return sendNotFound(reply);
      }
      updatedStep = nextStep;
      await recalculateCurrentStep(updatedStep.caseId);
    }

    return reply
      .code(201)
      .send({ review: serializeStepReview(review, uploadedDocuments), step: serializeCaseStep(updatedStep) });
  });

  app.get("/case-steps/:id/reviews", { preHandler: requirePerm("case.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select()
      .from(stepReviews)
      .where(eq(stepReviews.caseStepId, id))
      .orderBy(asc(stepReviews.createdAt));
    const filesById = await getReviewFilesById(rows);

    return {
      reviews: rows.map((review) =>
        serializeStepReview(
          review,
          review.documentIds
            .map((documentId) => filesById.get(documentId))
            .filter((file): file is NonNullable<ReturnType<typeof filesById.get>> => Boolean(file))
        )
      )
    };
  });

  app.get("/case-steps/:id/follow-ups", { preHandler: requirePerm("case.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select()
      .from(followUps)
      .where(eq(followUps.caseStepId, id))
      .orderBy(asc(followUps.createdAt));

    const tr = await getTranslations("followUp", "content", rows.map((r) => r.id));
    return { followUps: rows.map((r) => serializeFollowUp(r, tr.get(r.id))) };
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

    await saveTranslation("followUp", followUp.id, "content", body.content);
    const tr = await getTranslations("followUp", "content", [followUp.id]);
    return reply.code(201).send({ followUp: serializeFollowUp(followUp, tr.get(followUp.id)) });
  });
}
