import {
  billing,
  billingCharges,
  businesses,
  caseResubmissions,
  caseServices,
  caseStepDateLogs,
  caseStepDocuments,
  caseSteps,
  caseSubmissions,
  cases,
  clients,
  db,
  dealParties,
  documents,
  driveNodes,
  employees,
  externalCommissionEntries,
  externalParties,
  followUps,
  guarantors,
  packageItems,
  packageMilestones,
  schemeLines,
  serviceItems,
  servicePackages,
  stepReviews,
  templateSteps
} from "@bh/db";
import { randomUUID } from "node:crypto";
import {
  businessTypes,
  caseCreateSchema,
  caseResubmissionCreateSchema,
  caseResubmissionUpdateSchema,
  caseSubmissionCreateSchema,
  caseSubmissionUpdateSchema,
  caseStatuses,
  caseUpdateSchema,
  caseStepDocCreateSchema,
  caseStepDocUpdateSchema,
  caseStepUpdateSchema,
  followUpCreateSchema,
  stepReviewMessageSchema,
  stepReviewRequestSchema,
  computeIcaStats,
  computeCaseResultCounts,
  folderCreateSchema,
  nodePatchSchema,
  type CaseStatus,
  type IcaStatsCaseInput
} from "@bh/shared";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { getTranslations, saveTranslation, type TranslationValue } from "../lib/translationStore";
import { ctxCan, getVisibleCaseIds, loadAuthContext } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { deleteUpload, saveUpload } from "../lib/files";
import { getPagination, paginationQuery } from "../lib/pagination";
import { generateCommissionEntries } from "./commissionUtils";
import { refreshExternalCommissionEntries } from "./externalCommissionUtils";
import { refreshBillingCharges } from "./billing";
import { refreshPackageDealLineAmounts } from "./financeUtils";
import {
  createFolder,
  createFolderUploadTree,
  findNode,
  findOrCreateFolder,
  insertUploadedFiles,
  isFileTooLargeError,
  isFolderMoveCyclic,
  multipartParentSchema,
  parseParentId,
  readMultipartFolderUpload,
  readMultipartWithFiles,
  readMultipartWithFirstFile,
  sendDriveFileTooLarge,
  sendDriveNodeDownload,
  serializeNode,
  softDeleteNodeTree,
  unlinkStoragePath,
  validateParentFolder
} from "./driveUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CaseCreateTransactionResult =
  | { caseRow: typeof cases.$inferSelect; stepRows: (typeof caseSteps.$inferSelect)[] }
  | { error: "package_not_found" | "billing_not_found" };

const caseCommissionParamsSchema = z.object({
  caseId: z.string().uuid()
});
const caseResubmissionParamsSchema = z.object({
  id: z.string().uuid(),
  rid: z.string().uuid()
});

function serializeCase(row: typeof cases.$inferSelect) {
  return {
    id: row.id,
    business_type: row.businessType,
    parent_case_id: row.parentCaseId,
    client_id: row.clientId,
    current_step: row.currentStep,
    status: row.status,
    billing_id: row.billingId,
    package_id: row.packageId,
    fee_scheme_version_id: row.feeSchemeVersionId,
    guarantor_id: row.guarantorId,
    guarantor_name: row.guarantorName,
    guarantor_relation: row.guarantorRelation,
    guarantor_contact: row.guarantorContact,
    company_name: row.companyName,
    drive_folder_id: row.driveFolderId,
    signed_at: row.signedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function inputsWithPackagePrice(
  inputs: Record<string, unknown> | null | undefined,
  totalPriceSgd: string
): Record<string, unknown> {
  return { ...(inputs ?? {}), price: Number(totalPriceSgd) };
}

async function applyPackageToCase(
  tx: DbTransaction,
  caseRow: typeof cases.$inferSelect,
  stepRows: (typeof caseSteps.$inferSelect)[],
  packageId: string,
  salesId?: string | null
) {
  const [servicePackage] = await tx.select().from(servicePackages).where(eq(servicePackages.id, packageId)).limit(1);

  if (!servicePackage) {
    return { error: "package_not_found" as const };
  }

  const totalPriceSgd = toNumeric(servicePackage.basePriceSgd) ?? "0";
  const billingId = caseRow.billingId;
  let resolvedBillingId = billingId;

  if (billingId) {
    const [billingRow] = await tx.select().from(billing).where(eq(billing.id, billingId)).limit(1);

    if (!billingRow) {
      return { error: "billing_not_found" as const };
    }

    await tx
      .update(billing)
      .set({
        totalPriceSgd,
        salesId: salesId === undefined ? undefined : salesId,
        schemeVersionId: null,
        inputs: inputsWithPackagePrice(billingRow.inputs, totalPriceSgd),
        updatedAt: new Date()
      })
      .where(eq(billing.id, billingId));
  } else {
    const [billingRow] = await tx
      .insert(billing)
      .values({
        refType: "ep",
        refId: caseRow.id,
        totalPriceSgd,
        depositSgd: "0",
        status: "unpaid",
        salesId: salesId ?? null,
        schemeVersionId: null,
        inputs: inputsWithPackagePrice(null, totalPriceSgd)
      })
      .returning();

    if (!billingRow) {
      throw new Error("billing_create_failed");
    }

    resolvedBillingId = billingRow.id;
  }

  if (!resolvedBillingId) {
    throw new Error("billing_resolve_failed");
  }

  await tx
    .delete(billingCharges)
    .where(and(eq(billingCharges.billingId, resolvedBillingId), eq(billingCharges.status, "pending")));

  const stepIdByOrder = new Map(stepRows.map((step) => [step.stepOrder, step.id]));
  const milestoneRows = await tx
    .select()
    .from(packageMilestones)
    .where(eq(packageMilestones.packageId, packageId))
    .orderBy(asc(packageMilestones.seq), asc(packageMilestones.id));

  if (milestoneRows.length > 0) {
    await tx.insert(billingCharges).values(
      milestoneRows.map((milestone) => ({
        billingId: resolvedBillingId,
        chargeKind: "milestone" as const,
        seq: milestone.seq,
        label: milestone.label,
        caseStepId:
          milestone.bindStepOrder === null || milestone.bindStepOrder === undefined
            ? null
            : stepIdByOrder.get(milestone.bindStepOrder) ?? null,
        amountExpected: toNumeric(milestone.amountSgd) ?? "0",
        amountCollected: "0",
        status: "pending" as const,
        currency: "SGD" as const,
        note: milestone.refundableNote
      }))
    );
  }

  const packageServiceRows = await tx
    .select({ serviceItem: serviceItems })
    .from(packageItems)
    .innerJoin(serviceItems, eq(packageItems.serviceItemId, serviceItems.id))
    .where(eq(packageItems.packageId, packageId))
    .orderBy(asc(serviceItems.sortOrder), asc(serviceItems.code));

  if (packageServiceRows.length > 0) {
    await tx.insert(caseServices).values(
      packageServiceRows.map(({ serviceItem }) => ({
        caseId: caseRow.id,
        serviceItemId: serviceItem.id,
        nameSnapshot: serviceItem.name,
        source: "package" as const,
        isBillable: false,
        priceSgd: null,
        chargeId: null,
        status: "active" as const
      }))
    );
  }

  const [updatedCase] = await tx
    .update(cases)
    .set({ packageId, billingId: resolvedBillingId, updatedAt: new Date() })
    .where(eq(cases.id, caseRow.id))
    .returning();

  if (!updatedCase) {
    throw new Error("case_package_update_failed");
  }

  const billingRow = await refreshPackageDealLineAmounts(resolvedBillingId, tx);
  if (billingRow) {
    await generateCommissionEntries(billingRow, tx);
    await refreshExternalCommissionEntries(tx, billingRow);
  }

  return { caseRow: updatedCase };
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
    completed_by: row.completedBy,
    created_at: row.createdAt
  };
}

type CaseStepDateLogWithActor = typeof caseStepDateLogs.$inferSelect & {
  actorName?: string | null;
  actorNameEn?: string | null;
};

function serializeCaseStepDateLog(row: CaseStepDateLogWithActor) {
  return {
    id: row.id,
    case_step_id: row.caseStepId,
    actor_id: row.actorId,
    actor_name: row.actorName ?? null,
    actor_name_en: row.actorNameEn ?? null,
    action: row.action,
    old_completed_at: row.oldCompletedAt,
    new_completed_at: row.newCompletedAt,
    created_at: row.createdAt
  };
}

type CaseResubmissionWithCreator = typeof caseResubmissions.$inferSelect & {
  createdByName?: string | null;
  createdByNameEn?: string | null;
};

function serializeCaseResubmission(row: CaseResubmissionWithCreator) {
  return {
    id: row.id,
    case_id: row.caseId,
    round_no: row.roundNo,
    required_note: row.requiredNote,
    status: row.status,
    requested_at: row.requestedAt,
    resubmitted_at: row.resubmittedAt,
    created_by: row.createdBy,
    created_by_name: row.createdByName ?? null,
    created_by_name_en: row.createdByNameEn ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt
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

type SubmissionFile = Pick<typeof documents.$inferSelect, "id" | "filename" | "storagePath" | "mime">;

function serializeSubmissionFile(file?: SubmissionFile | null) {
  return file ? { id: file.id, filename: file.filename, storage_path: file.storagePath, mime: file.mime } : null;
}

function serializeSubmission(
  row: typeof caseSubmissions.$inferSelect,
  filesById: Map<string, SubmissionFile> = new Map()
) {
  return {
    id: row.id,
    case_id: row.caseId,
    submitted_at: row.submittedAt,
    result: row.result,
    rejected_at: row.rejectedAt,
    note: row.note,
    screenshot_document: serializeSubmissionFile(row.screenshotDocumentId ? filesById.get(row.screenshotDocumentId) : null),
    appeal_document: serializeSubmissionFile(row.appealDocumentId ? filesById.get(row.appealDocumentId) : null),
    attachment_documents: row.attachmentDocumentIds
      .map((documentId) => serializeSubmissionFile(filesById.get(documentId)))
      .filter((file): file is NonNullable<typeof file> => Boolean(file)),
    created_at: row.createdAt
  };
}

async function getSubmissionFilesById(submissionRows: (typeof caseSubmissions.$inferSelect)[]) {
  const documentIds = [
    ...new Set(
      submissionRows.flatMap((row) => [
        ...(row.screenshotDocumentId ? [row.screenshotDocumentId] : []),
        ...(row.appealDocumentId ? [row.appealDocumentId] : []),
        ...row.attachmentDocumentIds
      ])
    )
  ];
  const fileRows =
    documentIds.length === 0
      ? []
      : await db
          .select({
            id: documents.id,
            filename: documents.filename,
            storagePath: documents.storagePath,
            mime: documents.mime
          })
          .from(documents)
          .where(inArray(documents.id, documentIds));

  return new Map(fileRows.map((file) => [file.id, file]));
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

const caseQuerySchema = z
  .object({
    business_type: z.enum(businessTypes).optional(),
    status: z.enum(caseStatuses).optional(),
    status_in: z.string().optional(),
    client_id: z.string().uuid().optional(),
    parent_case_id: z.string().uuid().optional(),
    signed_month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    order_by: z.enum(["signed_at", "created_at"]).optional().default("created_at"),
    order: z.enum(["asc", "desc"]).optional().default("desc")
  })
  .merge(paginationQuery);

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

async function serializeCasesWithLatest(rows: (typeof cases.$inferSelect)[]) {
  const caseIds = rows.map((row) => row.id);
  const subs = caseIds.length
    ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, caseIds))
    : [];
  const resubs = caseIds.length
    ? await db.select().from(caseResubmissions).where(inArray(caseResubmissions.caseId, caseIds))
    : [];
  const byCase = new Map<string, typeof subs>();
  const resubsByCase = new Map<string, typeof resubs>();

  for (const submission of subs) {
    const submissions = byCase.get(submission.caseId) ?? [];
    submissions.push(submission);
    byCase.set(submission.caseId, submissions);
  }

  for (const resubmission of resubs) {
    const resubmissions = resubsByCase.get(resubmission.caseId) ?? [];
    resubmissions.push(resubmission);
    resubsByCase.set(resubmission.caseId, resubmissions);
  }

  return rows.map((row) => {
    const submissions = (byCase.get(row.id) ?? []).sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    );
    const currentOpenResubmission =
      (resubsByCase.get(row.id) ?? [])
        .filter((resubmission) => resubmission.status !== "approved")
        .sort((left, right) => right.roundNo - left.roundNo)[0] ?? null;
    const latest = submissions[0] ?? null;
    const submittedTimes = submissions
      .map((submission) => submission.submittedAt ?? submission.createdAt)
      .filter((value): value is Date => value instanceof Date)
      .map((value) => value.getTime());
    const firstSubmissionAt = submittedTimes.length
      ? new Date(Math.min(...submittedTimes)).toISOString()
      : null;
    const lastSubmissionAt = submittedTimes.length
      ? new Date(Math.max(...submittedTimes)).toISOString()
      : null;

    return {
      ...serializeCase(row),
      latest_result: latest?.result ?? null,
      latest_rejected_at:
        latest && latest.result === "rejected"
          ? (latest.rejectedAt?.toISOString() ?? null)
          : null,
      latest_submission_at: latest?.createdAt.toISOString() ?? null,
      first_submission_at: firstSubmissionAt,
      last_submission_at: lastSubmissionAt,
      resubmission_open: Boolean(currentOpenResubmission),
      resubmission_open_round: currentOpenResubmission?.roundNo ?? null,
      resubmission_open_since: currentOpenResubmission?.requestedAt ?? null
    };
  });
}

const caseStatsQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(9999).optional(),
  business_type: z.enum(businessTypes).optional()
});

const caseFileNodeParamsSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().uuid()
});

type CaseDriveContext = {
  caseRow: typeof cases.$inferSelect;
  clientName: string | null;
};

function hasOwn(input: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
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

function caseFolderName(row: CaseDriveContext): string {
  const name = (row.clientName?.trim() || "案件").replace(/[\\/]/g, "-");
  return `${name} (${row.caseRow.id.slice(0, 8)})`;
}

async function findCaseDriveContext(id: string, reply: FastifyReply): Promise<CaseDriveContext | null> {
  const [row] = await db
    .select({ caseRow: cases, clientName: clients.name })
    .from(cases)
    .leftJoin(clients, eq(cases.clientId, clients.id))
    .where(eq(cases.id, id))
    .limit(1);

  if (!row) {
    sendNotFound(reply);
    return null;
  }

  return row;
}

async function ensureCaseDriveRoot(caseId: string, userId: string, reply: FastifyReply): Promise<string | null> {
  const context = await findCaseDriveContext(caseId, reply);
  if (!context) return null;

  if (context.caseRow.driveFolderId) {
    const existing = await findNode(context.caseRow.driveFolderId);
    if (existing?.kind === "folder") {
      return existing.id;
    }
  }

  // 案件盘按业务类型独立成不同 root(各自 scope='case',对宣传册隔离)
  const caseRootName =
    context.caseRow.businessType === "ica" ? "ICA案件" : context.caseRow.businessType === "dp" ? "DP案件" : "EP案件";
  const moduleRootId = await findOrCreateFolder(null, caseRootName, userId);
  await db
    .update(driveNodes)
    .set({ scope: "case" })
    .where(and(eq(driveNodes.id, moduleRootId), isNull(driveNodes.scope)));
  const caseRootId = await findOrCreateFolder(moduleRootId, caseFolderName(context), userId);

  await db
    .update(cases)
    .set({ driveFolderId: caseRootId, updatedAt: new Date() })
    .where(eq(cases.id, caseId));

  return caseRootId;
}

async function getExistingCaseDriveRoot(caseId: string, reply: FastifyReply): Promise<string | null> {
  const context = await findCaseDriveContext(caseId, reply);
  if (!context) return null;

  const rootId = context.caseRow.driveFolderId;
  if (!rootId) {
    reply.code(400).send({ error: "case_drive_root_required" });
    return null;
  }

  const root = await findNode(rootId);
  if (!root || root.kind !== "folder") {
    reply.code(400).send({ error: "case_drive_root_required" });
    return null;
  }

  return root.id;
}

async function isNodeInCaseDriveTree(rootId: string, nodeId: string): Promise<boolean> {
  const result = await db.execute(sql`
    with recursive ancestors as (
      select id, parent_id
      from drive_nodes
      where id = ${nodeId} and deleted_at is null
      union all
      select parent.id, parent.parent_id
      from drive_nodes parent
      join ancestors on ancestors.parent_id = parent.id
      where parent.deleted_at is null
    )
    select 1
    from ancestors
    where id = ${rootId}
    limit 1
  `);
  return result.rows.length > 0;
}

async function resolveCaseDriveParent(rootId: string, parentId: string | null, reply: FastifyReply): Promise<string | null | undefined> {
  if (!parentId) return rootId;
  if (!(await validateParentFolder(parentId, reply))) return undefined;
  if (!(await isNodeInCaseDriveTree(rootId, parentId))) {
    reply.code(400).send({ error: "parent_outside_case_drive" });
    return undefined;
  }
  return parentId;
}

async function getCaseDriveRows(rootId: string) {
  const rows = await db
    .select()
    .from(driveNodes)
    .where(isNull(driveNodes.deletedAt))
    .orderBy(sql`case when ${driveNodes.kind} = 'folder' then 0 else 1 end`, asc(driveNodes.name));
  const childrenByParent = new Map<string | null, (typeof rows)[number][]>();

  for (const row of rows) {
    const siblings = childrenByParent.get(row.parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parentId, siblings);
  }

  const scopedRows: (typeof rows)[number][] = [];
  const pending = [...(childrenByParent.get(rootId) ?? [])];
  while (pending.length > 0) {
    const row = pending.shift();
    if (!row) continue;
    scopedRows.push(row);
    pending.push(...(childrenByParent.get(row.id) ?? []));
  }

  return scopedRows;
}

export async function registerCaseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.post("/cases/:id/files/ensure-root", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const driveFolderId = await ensureCaseDriveRoot(id, request.user.id, reply);
    if (!driveFolderId) return;
    return { drive_folder_id: driveFolderId };
  });

  app.get("/cases/:id/files/tree", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rootId = await getExistingCaseDriveRoot(id, reply);
    if (!rootId) return;

    const rows = await getCaseDriveRows(rootId);
    return {
      nodes: rows.map((row) => serializeNode(row, row.parentId === rootId ? null : row.parentId))
    };
  });

  app.post("/cases/:id/files/folders", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(folderCreateSchema, request.body);
    const rootId = await getExistingCaseDriveRoot(id, reply);
    if (!rootId) return;

    const parentId = parseParentId(body.parent_id);
    const resolvedParentId = await resolveCaseDriveParent(rootId, parentId, reply);
    if (resolvedParentId === undefined) return;

    const row = await createFolder(resolvedParentId, body.name, request.user.id);
    return reply.code(201).send({ node: serializeNode(row, row.parentId === rootId ? null : row.parentId) });
  });

  app.post("/cases/:id/files/upload", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    let files: Awaited<ReturnType<typeof readMultipartWithFiles>>["files"] = [];

    try {
      const multipart = await readMultipartWithFiles(request);
      files = multipart.files;
      if (files.length === 0) return reply.code(400).send({ error: "file_required" });

      const rootId = await getExistingCaseDriveRoot(id, reply);
      if (!rootId) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const body = parseWithSchema(multipartParentSchema, multipart.fields);
      const parentId = parseParentId(body.parent_id);
      const resolvedParentId = await resolveCaseDriveParent(rootId, parentId, reply);
      if (resolvedParentId === undefined) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const rows = await insertUploadedFiles(resolvedParentId, files, request.user.id);
      return reply
        .code(201)
        .send({ nodes: rows.map((row) => serializeNode(row, row.parentId === rootId ? null : row.parentId)) });
    } catch (error) {
      await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.post("/cases/:id/files/upload-folder", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    let files: Awaited<ReturnType<typeof readMultipartFolderUpload>>["files"] = [];

    try {
      const multipart = await readMultipartFolderUpload(request);
      files = multipart.files;
      if (files.length === 0) return reply.code(400).send({ error: "file_required" });

      const rootId = await getExistingCaseDriveRoot(id, reply);
      if (!rootId) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const body = parseWithSchema(multipartParentSchema, multipart.fields);
      const parentId = parseParentId(body.parent_id);
      const resolvedParentId = await resolveCaseDriveParent(rootId, parentId, reply);
      if (resolvedParentId === undefined) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const result = await createFolderUploadTree(resolvedParentId, files, request.user.id);
      return reply.code(201).send({
        created_folders: result.createdFolders,
        created_files: result.createdFiles,
        top_folders: result.topFolders.map((row) => serializeNode(row, row.parentId === rootId ? null : row.parentId))
      });
    } catch (error) {
      await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      if (error instanceof Error && error.message === "invalid_relative_path") {
        return reply.code(400).send({ error: "invalid_relative_path" });
      }
      throw error;
    }
  });

  app.patch("/cases/:id/files/nodes/:nodeId", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id, nodeId } = parseWithSchema(caseFileNodeParamsSchema, request.params);
    const body = parseWithSchema(nodePatchSchema, request.body);
    const rootId = await getExistingCaseDriveRoot(id, reply);
    if (!rootId) return;
    if (nodeId === rootId) return reply.code(400).send({ error: "case_drive_root_readonly" });

    const existing = await findNode(nodeId);
    if (!existing || !(await isNodeInCaseDriveTree(rootId, nodeId))) return sendNotFound(reply);

    const parentId = body.parent_id === undefined ? undefined : parseParentId(body.parent_id);
    let resolvedMoveParentId: string | null | undefined;
    if (parentId !== undefined) {
      const resolvedParentId = await resolveCaseDriveParent(rootId, parentId, reply);
      if (resolvedParentId === undefined) return;
      if (existing.kind === "folder" && (await isFolderMoveCyclic(nodeId, resolvedParentId))) {
        return reply.code(400).send({ error: "cyclic_parent" });
      }
      resolvedMoveParentId = resolvedParentId;
    }

    const [row] = await db
      .update(driveNodes)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(parentId !== undefined ? { parentId: resolvedMoveParentId } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(driveNodes.id, nodeId), isNull(driveNodes.deletedAt)))
      .returning();
    if (!row) return sendNotFound(reply);
    return { node: serializeNode(row, row.parentId === rootId ? null : row.parentId) };
  });

  app.put("/cases/:id/files/nodes/:nodeId/replace", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id, nodeId } = parseWithSchema(caseFileNodeParamsSchema, request.params);
    let file: Awaited<ReturnType<typeof readMultipartWithFirstFile>>["file"] = null;

    try {
      const multipart = await readMultipartWithFirstFile(request);
      file = multipart.file;
      if (!file) return reply.code(400).send({ error: "file_required" });

      const rootId = await getExistingCaseDriveRoot(id, reply);
      if (!rootId) {
        await unlinkStoragePath(file.storagePath);
        return;
      }

      const existing = await findNode(nodeId);
      if (!existing || !(await isNodeInCaseDriveTree(rootId, nodeId))) {
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
        .where(and(eq(driveNodes.id, nodeId), isNull(driveNodes.deletedAt)))
        .returning();
      if (!row) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }

      await unlinkStoragePath(existing.storagePath);
      return { node: serializeNode(row, row.parentId === rootId ? null : row.parentId) };
    } catch (error) {
      await unlinkStoragePath(file?.storagePath);
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.delete("/cases/:id/files/nodes/:nodeId", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id, nodeId } = parseWithSchema(caseFileNodeParamsSchema, request.params);
    const rootId = await getExistingCaseDriveRoot(id, reply);
    if (!rootId) return;
    if (nodeId === rootId) return reply.code(400).send({ error: "case_drive_root_readonly" });

    const existing = await findNode(nodeId);
    if (!existing || !(await isNodeInCaseDriveTree(rootId, nodeId))) return sendNotFound(reply);

    const deletedCount = await softDeleteNodeTree(nodeId);
    if (deletedCount === 0) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/cases/:id/files/nodes/:nodeId/download", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id, nodeId } = parseWithSchema(caseFileNodeParamsSchema, request.params);
    const rootId = await getExistingCaseDriveRoot(id, reply);
    if (!rootId) return;

    const existing = await findNode(nodeId);
    if (!existing || !(await isNodeInCaseDriveTree(rootId, nodeId))) return sendNotFound(reply);
    const sent = await sendDriveNodeDownload(nodeId, reply);
    if (!sent) return sendNotFound(reply);
  });

  app.get("/cases", { preHandler: requirePerm("case.view") }, async (request) => {
    const query = parseWithSchema(caseQuerySchema, request.query);
    const filters: SQL[] = [];
    const ctx = await loadAuthContext(request);

    if (query.business_type) {
      filters.push(eq(cases.businessType, query.business_type));
    }
    if (query.status) {
      filters.push(eq(cases.status, query.status));
    } else if (query.status_in) {
      const statuses = query.status_in
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is CaseStatus => (caseStatuses as readonly string[]).includes(value));
      if (statuses.length > 0) {
        filters.push(inArray(cases.status, statuses));
      }
    }
    if (query.client_id) {
      filters.push(eq(cases.clientId, query.client_id));
    }
    if (query.signed_month) {
      // signed_at 为 date 列,按 [当月1号, 下月1号) 区间过滤;signed_at 为空的行不命中
      const year = Number(query.signed_month.slice(0, 4));
      const month = Number(query.signed_month.slice(5, 7));
      const start = `${query.signed_month}-01`;
      const next =
        month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      filters.push(gte(cases.signedAt, start), lt(cases.signedAt, next));
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

    const pagination = getPagination(query);
    const whereClause = filters.length > 0 ? and(...filters) : sql`true`;
    const orderBy = getCaseSort(query.order_by ?? "created_at", query.order ?? "desc");
    const rows = pagination.paginate
      ? await db
          .select()
          .from(cases)
          .where(whereClause)
          .orderBy(...orderBy)
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db.select().from(cases).where(whereClause).orderBy(...orderBy);
    const serialized = await serializeCasesWithLatest(rows);

    if (pagination.paginate) {
      const [totalRow] = await db.select({ total: count() }).from(cases).where(whereClause);

      return {
        cases: serialized,
        total: Number(totalRow?.total ?? 0),
        page: pagination.page,
        page_size: pagination.pageSize
      };
    }

    return { cases: serialized };
  });

  app.get("/cases/ica-stats", { preHandler: requirePerm("case.view") }, async () => {
    // 查所有 ICA 案件
    const icaCases = await db
      .select()
      .from(cases)
      .where(eq(cases.businessType, "ica"));

    const caseIds = icaCases.map((c) => c.id);

    // 批量查这些案件的所有 submissions（避免 N+1）
    const submissions =
      caseIds.length > 0
        ? await db
            .select()
            .from(caseSubmissions)
            .where(inArray(caseSubmissions.caseId, caseIds))
        : [];

    // 按 caseId 分组
    const submissionsByCaseId = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const list = submissionsByCaseId.get(sub.caseId) ?? [];
      list.push(sub);
      submissionsByCaseId.set(sub.caseId, list);
    }

    const input: IcaStatsCaseInput[] = icaCases.map((c) => ({
      caseId: c.id,
      submissions: (submissionsByCaseId.get(c.id) ?? []).map((s) => ({
        result: s.result as "pending" | "approved" | "rejected",
        submittedAt: s.submittedAt ? s.submittedAt.toISOString() : s.createdAt.toISOString(),
        createdAt: s.createdAt.toISOString()
      }))
    }));

    return computeIcaStats(input);
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
        year: sql<number>`extract(year from ${effectiveDate})::int`,
        count: sql<number>`count(*)::int`
      })
      .from(cases)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .groupBy(sql`extract(year from ${effectiveDate})::int`)
      .orderBy(desc(sql`extract(year from ${effectiveDate})::int`));
    const yearTotals = yearRows
      .map((row) => ({ year: Number(row.year), count: Number(row.count) }))
      .filter((row) => Number.isFinite(row.year));
    const availableYears = yearTotals.map((row) => row.year);
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
    const caseRows = await db
      .select({ id: cases.id })
      .from(cases)
      .where(filters.length > 0 ? and(...filters) : sql`true`);
    const caseIds = caseRows.map((row) => row.id);
    const submissionRows =
      caseIds.length > 0
        ? await db
            .select({
              caseId: caseSubmissions.caseId,
              result: caseSubmissions.result,
              submittedAt: caseSubmissions.submittedAt,
              createdAt: caseSubmissions.createdAt
            })
            .from(caseSubmissions)
            .where(inArray(caseSubmissions.caseId, caseIds))
        : [];
    const submissionsByCaseId = new Map<string, typeof submissionRows>();

    for (const submission of submissionRows) {
      const list = submissionsByCaseId.get(submission.caseId) ?? [];
      list.push(submission);
      submissionsByCaseId.set(submission.caseId, list);
    }

    const statsInput: IcaStatsCaseInput[] = caseRows.map((row) => ({
      caseId: row.id,
      submissions: (submissionsByCaseId.get(row.id) ?? []).map((submission) => ({
        result: submission.result,
        submittedAt: (submission.submittedAt ?? submission.createdAt).toISOString(),
        createdAt: submission.createdAt.toISOString()
      }))
    }));

    return {
      year: selectedYear,
      business_type: query.business_type ?? null,
      months,
      total: months.reduce((sum, item) => sum + item.count, 0),
      available_years: availableYears,
      summary: {
        year_totals: yearTotals,
        result_counts: computeCaseResultCounts(statsInput)
      }
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
    const submissionFilesById = await getSubmissionFilesById(submissionRows);

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
      submissions: submissionRows.map((submission) => serializeSubmission(submission, submissionFilesById))
    };
  });

  app.post("/cases", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const body = parseWithSchema(caseCreateSchema, request.body);

    if (body.business_type === "ica" && !body.guarantor_name) {
      return reply.code(400).send({ error: "guarantor_required" });
    }

    const created: CaseCreateTransactionResult = await db.transaction(async (tx): Promise<CaseCreateTransactionResult> => {
      const [caseRow] = await tx
        .insert(cases)
        .values({
          businessType: body.business_type,
          parentCaseId: body.parent_case_id ?? null,
          clientId: body.client_id ?? null,
          currentStep: 0,
          status: "open",
          billingId: body.billing_id ?? null,
          packageId: body.package_id ?? null,
          feeSchemeVersionId: body.fee_scheme_version_id ?? null,
          guarantorName: body.guarantor_name,
          guarantorRelation: body.guarantor_relation,
          guarantorContact: body.guarantor_contact,
          companyName: body.company_name,
          signedAt: body.signed_at ?? null
        })
        .returning();

      if (!caseRow) {
        throw new Error("case_create_failed");
      }

      const stepRows: (typeof caseSteps.$inferSelect)[] = [];

      if (body.template_id) {
        const templateStepRows = await tx
          .select()
          .from(templateSteps)
          .where(eq(templateSteps.templateId, body.template_id))
          .orderBy(asc(templateSteps.stepOrder));

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
      }

      const firstStepOrder = stepRows[0]?.stepOrder;
      let resultCaseRow = caseRow;
      if (firstStepOrder !== undefined) {
        const [updatedCase] = await tx
          .update(cases)
          .set({ currentStep: firstStepOrder, updatedAt: new Date() })
          .where(eq(cases.id, caseRow.id))
          .returning();

        resultCaseRow = updatedCase ?? caseRow;
      }

      if (body.package_id) {
        const packageResult = await applyPackageToCase(tx, resultCaseRow, stepRows, body.package_id, body.sales_id);
        if ("error" in packageResult) {
          return { error: packageResult.error };
        }
        return { caseRow: packageResult.caseRow, stepRows };
      }

      if (body.billing_id) {
        await refreshBillingCharges(body.billing_id, tx);
      }

      return { caseRow: resultCaseRow, stepRows };
    });

    if ("error" in created) {
      return reply.code(400).send({ error: created.error });
    }

    return reply
      .code(201)
      .send({ case: serializeCase(created.caseRow), steps: created.stepRows.map(serializeCaseStep) });
  });

  app.post(
    "/cases/:caseId/commission/recompute",
    { preHandler: requirePerm("case.manage") },
    async (request, reply) => {
      const { caseId } = parseWithSchema(caseCommissionParamsSchema, request.params);

      const result = await db.transaction(async (tx) => {
        const [caseRow] = await tx.select().from(cases).where(eq(cases.id, caseId)).limit(1);

        if (!caseRow) {
          return null;
        }

        const billingId =
          caseRow.billingId ??
          (
            await tx
              .select({ id: billing.id })
              .from(billing)
              .where(and(eq(billing.refType, "ep"), eq(billing.refId, caseId)))
              .limit(1)
          )[0]?.id;

        if (!billingId) {
          return { error: "billing_not_found" as const };
        }

        const billingRow = await refreshPackageDealLineAmounts(billingId, tx);
        if (!billingRow) {
          return { error: "billing_not_found" as const };
        }

        const internal = await generateCommissionEntries(billingRow, tx);
        const external = await refreshExternalCommissionEntries(tx, billingRow);

        return {
          billing_id: billingRow.id,
          internal,
          external
        };
      });

      if (!result) {
        return sendNotFound(reply);
      }

      if ("error" in result) {
        return reply.code(400).send({ error: result.error });
      }

      return result;
    }
  );

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
          feeSchemeVersionId: body.fee_scheme_version_id,
          guarantorId: body.guarantor_id,
          guarantorName: body.guarantor_name,
          guarantorRelation: body.guarantor_relation,
          guarantorContact: body.guarantor_contact,
          companyName: body.company_name,
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
    const submissionFilesById = await getSubmissionFilesById(submissionRows);

    return { submissions: submissionRows.map((submission) => serializeSubmission(submission, submissionFilesById)) };
  });

  app.get("/cases/:id/resubmissions", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const rows = await db
      .select({
        resubmission: caseResubmissions,
        createdByName: employees.name,
        createdByNameEn: employees.nameEn
      })
      .from(caseResubmissions)
      .leftJoin(employees, eq(caseResubmissions.createdBy, employees.id))
      .where(eq(caseResubmissions.caseId, id))
      .orderBy(asc(caseResubmissions.roundNo));

    return {
      resubmissions: rows.map((row) =>
        serializeCaseResubmission({
          ...row.resubmission,
          createdByName: row.createdByName,
          createdByNameEn: row.createdByNameEn
        })
      )
    };
  });

  app.post("/cases/:id/resubmissions", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseResubmissionCreateSchema, request.body);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!caseRow) {
      return sendNotFound(reply);
    }

    const [roundRow] = await db
      .select({ maxRoundNo: sql<number>`coalesce(max(${caseResubmissions.roundNo}), 0)::int` })
      .from(caseResubmissions)
      .where(eq(caseResubmissions.caseId, id));
    const [resubmission] = await db
      .insert(caseResubmissions)
      .values({
        caseId: id,
        roundNo: (roundRow?.maxRoundNo ?? 0) + 1,
        requiredNote: body.required_note,
        status: "awaiting",
        requestedAt: body.requested_at,
        createdBy: request.user.id
      })
      .returning();

    if (!resubmission) {
      throw new Error("case_resubmission_create_failed");
    }

    return reply.code(201).send({ resubmission: serializeCaseResubmission(resubmission) });
  });

  app.patch("/cases/:id/resubmissions/:rid", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id, rid } = parseWithSchema(caseResubmissionParamsSchema, request.params);
    const body = parseWithSchema(caseResubmissionUpdateSchema, request.body);
    const [resubmission] = await db
      .update(caseResubmissions)
      .set({
        requiredNote: body.required_note,
        status: body.status,
        requestedAt: body.requested_at,
        resubmittedAt: body.resubmitted_at,
        updatedAt: new Date()
      })
      .where(and(eq(caseResubmissions.id, rid), eq(caseResubmissions.caseId, id)))
      .returning();

    if (!resubmission) {
      return sendNotFound(reply);
    }

    return { resubmission: serializeCaseResubmission(resubmission) };
  });

  app.delete("/cases/:id/resubmissions/:rid", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id, rid } = parseWithSchema(caseResubmissionParamsSchema, request.params);
    const [resubmission] = await db
      .delete(caseResubmissions)
      .where(and(eq(caseResubmissions.id, rid), eq(caseResubmissions.caseId, id)))
      .returning();

    if (!resubmission) {
      return sendNotFound(reply);
    }

    return { ok: true };
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

    const filesById = await getSubmissionFilesById([submission]);
    return { submission: serializeSubmission(submission, filesById) };
  });

  // 给某次提交记录上传文件:fieldname 决定槽位 —— screenshot(截图,单图)/ appeal(申诉信,单文件)/ attachment(附件,可多)
  app.post("/case-submissions/:id/files", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [submission] = await db.select().from(caseSubmissions).where(eq(caseSubmissions.id, id)).limit(1);

    if (!submission) {
      return sendNotFound(reply);
    }

    const [caseRow] = await db.select().from(cases).where(eq(cases.id, submission.caseId)).limit(1);
    if (!caseRow) {
      return sendNotFound(reply);
    }

    let screenshotDocumentId = submission.screenshotDocumentId;
    let appealDocumentId = submission.appealDocumentId;
    const attachmentDocumentIds = [...submission.attachmentDocumentIds];
    const replacedDocumentIds: string[] = [];
    let uploadedAny = false;

    for await (const part of request.parts()) {
      if (part.type !== "file") {
        continue;
      }

      const document = await saveUpload(part, {
        subjectType: "case_submission",
        subjectId: submission.id,
        clientId: caseRow.clientId ?? null,
        uploadedBy: request.user.id
      });
      if (!document) {
        throw new Error("case_submission_file_upload_failed");
      }
      uploadedAny = true;

      if (part.fieldname === "screenshot") {
        if (screenshotDocumentId) {
          replacedDocumentIds.push(screenshotDocumentId);
        }
        screenshotDocumentId = document.id;
      } else if (part.fieldname === "appeal") {
        if (appealDocumentId) {
          replacedDocumentIds.push(appealDocumentId);
        }
        appealDocumentId = document.id;
      } else {
        attachmentDocumentIds.push(document.id);
      }
    }

    if (!uploadedAny) {
      return reply.code(400).send({ error: "file_required" });
    }

    const [updated] = await db
      .update(caseSubmissions)
      .set({ screenshotDocumentId, appealDocumentId, attachmentDocumentIds })
      .where(eq(caseSubmissions.id, id))
      .returning();

    if (!updated) {
      return sendNotFound(reply);
    }

    // 删除被替换掉的旧截图/申诉信文件,避免遗留孤儿
    if (replacedDocumentIds.length > 0) {
      const oldRows = await db
        .select({ id: documents.id, storagePath: documents.storagePath })
        .from(documents)
        .where(inArray(documents.id, replacedDocumentIds));
      for (const oldRow of oldRows) {
        await deleteUpload(oldRow.storagePath);
      }
      await db.delete(documents).where(inArray(documents.id, replacedDocumentIds));
    }

    const filesById = await getSubmissionFilesById([updated]);
    return { submission: serializeSubmission(updated, filesById) };
  });

  // ICA 建收款计划时生成担保人应付分成(pending):收到定金后由财务在外部分成台账手动确认付款。
  // 幂等:同一 billing 已有该担保人的分成 entry 就不重复建。
  app.post("/cases/:id/guarantor-payout", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(z.object({ billing_id: z.string().uuid() }), request.body);
    const [caseRow] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
    if (!caseRow) {
      return sendNotFound(reply);
    }
    if (caseRow.businessType !== "ica" || !caseRow.guarantorId) {
      return { ok: true, created: false };
    }

    // 担保人分成额 = ICA 方案里担保人 commission line 的 rate
    const [icaBusiness] = await db.select().from(businesses).where(eq(businesses.code, "ica")).limit(1);
    const [guarantorParty] = await db.select().from(dealParties).where(eq(dealParties.code, "guarantor")).limit(1);
    const versionId = caseRow.feeSchemeVersionId ?? icaBusiness?.defaultVersionId;
    if (!icaBusiness || !versionId || !guarantorParty) {
      return { ok: true, created: false };
    }
    const lines = await db.select().from(schemeLines).where(eq(schemeLines.versionId, versionId));
    const guarantorLine = lines.find((line) => line.kind === "commission" && line.partyId === guarantorParty.id);
    const share = Number(guarantorLine?.rate ?? 0);
    if (!(share > 0)) {
      return { ok: true, created: false };
    }

    const [guarantor] = await db.select().from(guarantors).where(eq(guarantors.id, caseRow.guarantorId)).limit(1);
    if (!guarantor) {
      return { ok: true, created: false };
    }
    // 客户自己找的担保人不给公司分成
    if (guarantor.isClientOwn) {
      return { ok: true, created: false };
    }

    // 找/建这个担保人的外部分成收款人
    let [payee] = await db
      .select()
      .from(externalParties)
      .where(and(eq(externalParties.name, guarantor.name), eq(externalParties.partyId, guarantorParty.id)))
      .limit(1);
    if (!payee) {
      [payee] = await db
        .insert(externalParties)
        .values({
          partyId: guarantorParty.id,
          name: guarantor.name,
          contact: guarantor.nric ?? null,
          statementToken: randomUUID(),
          note: "ICA 担保人分成"
        })
        .returning();
    }
    if (!payee) {
      throw new Error("external_party_create_failed");
    }

    // 幂等:该 billing 已有此担保人的应付分成就不重复
    const existing = await db
      .select({ id: externalCommissionEntries.id })
      .from(externalCommissionEntries)
      .where(
        and(
          eq(externalCommissionEntries.billingId, body.billing_id),
          eq(externalCommissionEntries.payeeId, payee.id)
        )
      )
      .limit(1);
    if (existing.length > 0) {
      return { ok: true, created: false };
    }

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await db.insert(externalCommissionEntries).values({
      payeeId: payee.id,
      billingId: body.billing_id,
      businessId: icaBusiness.id,
      partyId: guarantorParty.id,
      period,
      recurrence: "one_time",
      seq: 1,
      milestoneSeq: 1,
      amountSgd: String(share),
      status: "pending",
      note: "ICA 定金分成"
    });

    return { ok: true, created: true };
  });

  app.patch("/case-steps/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(caseStepUpdateSchema, request.body);
    const [existingStep] = await db.select().from(caseSteps).where(eq(caseSteps.id, id)).limit(1);

    if (!existingStep) {
      return sendNotFound(reply);
    }

    if (body.status === "done" && body.force !== true) {
      const requiredDocuments = await db
        .select()
        .from(caseStepDocuments)
        .where(and(eq(caseStepDocuments.caseStepId, id), eq(caseStepDocuments.isRequired, true)));
      const missingRequiredDocument = requiredDocuments.some((documentRow) => getSlotDocumentIds(documentRow).length === 0);

      if (missingRequiredDocument) {
        return reply.code(400).send({ error: "missing_required_documents" });
      }
    }

    const statusChanged = body.status !== undefined && body.status !== existingStep.status;
    const nextCompletedAt =
      body.completed_at !== undefined
        ? body.completed_at === null
          ? null
          : new Date(body.completed_at)
        : statusChanged
          ? body.status === "done"
            ? new Date()
            : null
          : undefined;
    const nextCompletedBy = statusChanged ? (body.status === "done" ? request.user.id : null) : undefined;

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
        completedAt: nextCompletedAt,
        completedBy: nextCompletedBy
      })
      .where(eq(caseSteps.id, id))
      .returning();

    if (!step) {
      return sendNotFound(reply);
    }

    const completedAtChanged =
      nextCompletedAt !== undefined && existingStep.completedAt?.getTime() !== nextCompletedAt?.getTime();
    const action =
      existingStep.status !== "done" && step.status === "done"
        ? "check"
        : existingStep.status === "done" && step.status !== "done"
          ? "uncheck"
          : !statusChanged && completedAtChanged
            ? "edit_date"
            : null;

    if (action) {
      await db.insert(caseStepDateLogs).values({
        caseStepId: id,
        actorId: request.user.id,
        action,
        oldCompletedAt: existingStep.completedAt,
        newCompletedAt: step.completedAt
      });
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

  app.get("/case-steps/:id/date-logs", { preHandler: requirePerm("case.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select({
        log: caseStepDateLogs,
        actorName: employees.name,
        actorNameEn: employees.nameEn
      })
      .from(caseStepDateLogs)
      .leftJoin(employees, eq(caseStepDateLogs.actorId, employees.id))
      .where(eq(caseStepDateLogs.caseStepId, id))
      .orderBy(desc(caseStepDateLogs.createdAt));

    return {
      dateLogs: rows.map((row) =>
        serializeCaseStepDateLog({
          ...row.log,
          actorName: row.actorName,
          actorNameEn: row.actorNameEn
        })
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
