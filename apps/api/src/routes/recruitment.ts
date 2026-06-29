import {
  db,
  documents,
  recruitmentCampaignJobs,
  recruitmentCampaignMaterials,
  recruitmentCampaigns,
  recruitmentCandidates,
  recruitmentFollowups,
  recruitmentIndustries,
  recruitmentInterviews,
  recruitmentJobs,
  recruitmentMaterials,
  recruitmentPostings,
  recruitmentSettings
} from "@bh/db";
import {
  recruitmentAiCopySchema,
  recruitmentCampaignCreateSchema,
  recruitmentCampaignListQuerySchema,
  recruitmentCampaignUpdateSchema,
  recruitmentCandidateCreateSchema,
  recruitmentCandidateListQuerySchema,
  recruitmentCandidateUpdateSchema,
  recruitmentFollowupCreateSchema,
  recruitmentIndustryCreateSchema,
  recruitmentIndustryListQuerySchema,
  recruitmentIndustryUpdateSchema,
  recruitmentInterviewCreateSchema,
  recruitmentInterviewUpdateSchema,
  recruitmentJobCreateSchema,
  recruitmentJobListQuerySchema,
  recruitmentJobUpdateSchema,
  recruitmentMaterialCreateSchema,
  recruitmentMaterialUpdateSchema,
  recruitmentPostingCreateSchema,
  recruitmentPostingListQuerySchema,
  recruitmentPostingUpdateSchema,
  recruitmentSettingsUpdateSchema
} from "@bh/shared";
import { and, asc, count, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { generateRecruitmentCopy } from "../lib/ai";
import { saveUpload } from "../lib/files";
import { getTranslations, saveTranslationPair, type TranslationValue } from "../lib/translationStore";
import { type Lang } from "../lib/translate";
import { idParamsSchema, isUniqueViolation, parseWithSchema, sendConflict, sendNotFound } from "./hrUtils";

const uuidArrayBodySchema = z.object({
  job_ids: z.array(z.string().uuid()).optional(),
  material_ids: z.array(z.string().uuid()).optional()
});

const RECRUITMENT_JOB_ENTITY = "recruitment_job";
const RECRUITMENT_INDUSTRY_ENTITY = "recruitment_industry";
const JOB_TRANSLATION_FIELDS = ["title", "jobContent", "requirements", "salaryNote"] as const;
const INDUSTRY_NAME_FIELD = "name";

type TranslationFieldValue = { zh: string | null; en: string | null };
type JobTranslationField = (typeof JOB_TRANSLATION_FIELDS)[number];

function hasOwn(input: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function nonEmptyOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() ? value : null;
}

function looksChinese(value: string | null | undefined): boolean {
  return Boolean(value && /[一-鿿]/.test(value));
}

function inferSourceLang(zh: string | null, en: string | null, fallback: string | null | undefined, explicit?: Lang): Lang {
  if (explicit) return explicit;
  if (zh) return "zh";
  if (en) return "en";
  return looksChinese(fallback) ? "zh" : "en";
}

function i18nValue(value: TranslationValue | undefined): TranslationFieldValue {
  return { zh: value?.zh ?? null, en: value?.en ?? null };
}

function booleanValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1";
}

function nullableValue(value: unknown) {
  if (value === undefined) return undefined;
  if (value === "" || value === "null") return null;
  return value;
}

function arrayValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function mustReturn<T>(row: T | undefined, error = "db_write_failed"): T {
  if (!row) {
    throw new Error(error);
  }

  return row;
}

function isMultipartRequest(request: FastifyRequest) {
  return typeof (request as any).isMultipart === "function" && (request as any).isMultipart();
}

async function assertCompanyAccess(request: FastifyRequest, reply: FastifyReply, companyId: string | null | undefined) {
  const companyIds = await getAccessibleCompanyIds(request);

  if (companyIds !== "all" && (!companyId || !companyIds.includes(companyId))) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }

  return true;
}

async function getAccessibleFilter(request: FastifyRequest, column: any): Promise<SQL | undefined> {
  return companyFilter(await getAccessibleCompanyIds(request), column);
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
    category_id: row.categoryId,
    uploaded_at: row.uploadedAt
  };
}

function serializeIndustry(row: typeof recruitmentIndustries.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    sort_order: row.sortOrder,
    active: row.active,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeJob(row: typeof recruitmentJobs.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    industry_id: row.industryId,
    title: row.title,
    headcount: row.headcount,
    salary_min: row.salaryMin,
    salary_max: row.salaryMax,
    employment_types: row.employmentTypes,
    pt_salary_min: row.ptSalaryMin == null ? null : Number(row.ptSalaryMin),
    pt_salary_max: row.ptSalaryMax == null ? null : Number(row.ptSalaryMax),
    salary_note: row.salaryNote,
    job_content: row.jobContent,
    requirements: row.requirements,
    nationalities: row.nationalities,
    status: row.status,
    priority: row.priority,
    owner_id: row.ownerId,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function serializeIndustriesWithI18n(rows: (typeof recruitmentIndustries.$inferSelect)[]) {
  const serialized = rows.map(serializeIndustry);
  const ids = rows.map((row) => row.id);
  const nameMap = await getTranslations(RECRUITMENT_INDUSTRY_ENTITY, INDUSTRY_NAME_FIELD, ids);

  return serialized.map((industry) => ({
    ...industry,
    name_i18n: i18nValue(nameMap.get(industry.id))
  }));
}

async function serializeJobsWithI18n(rows: (typeof recruitmentJobs.$inferSelect)[]) {
  const serialized = rows.map(serializeJob);
  const ids = rows.map((row) => row.id);
  const translationEntries = await Promise.all(
    JOB_TRANSLATION_FIELDS.map(async (field) => [field, await getTranslations(RECRUITMENT_JOB_ENTITY, field, ids)] as const)
  );
  const translationMaps = new Map<JobTranslationField, Map<string, TranslationValue>>(translationEntries);

  return serialized.map((job) => {
    const withI18n: ReturnType<typeof serializeJob> & Record<`${JobTranslationField}_i18n`, TranslationFieldValue> = {
      ...job,
      title_i18n: i18nValue(translationMaps.get("title")?.get(job.id)),
      jobContent_i18n: i18nValue(translationMaps.get("jobContent")?.get(job.id)),
      requirements_i18n: i18nValue(translationMaps.get("requirements")?.get(job.id)),
      salaryNote_i18n: i18nValue(translationMaps.get("salaryNote")?.get(job.id))
    };
    return withI18n;
  });
}

function getSourceLang(record: Record<string, unknown>, key: string, fallbackKey = "sourceLang"): Lang | undefined {
  const value = record[key] ?? record[fallbackKey];
  return value === "zh" || value === "en" ? value : undefined;
}

async function saveJobTranslationPairs(
  job: typeof recruitmentJobs.$inferSelect,
  body: object
): Promise<void> {
  const record = body as Record<string, string | null | undefined>;
  const fallbackByField: Record<JobTranslationField, string | null> = {
    title: job.title,
    jobContent: job.jobContent,
    requirements: job.requirements,
    salaryNote: job.salaryNote
  };

  await Promise.all(
    JOB_TRANSLATION_FIELDS.map(async (field) => {
      const zhKey = `${field}Zh`;
      const enKey = `${field}En`;
      if (!hasOwn(record, zhKey) && !hasOwn(record, enKey)) return;

      const zh = nonEmptyOrNull(record[zhKey]);
      const en = nonEmptyOrNull(record[enKey]);
      const sourceLang = inferSourceLang(zh, en, fallbackByField[field], getSourceLang(record, `${field}SourceLang`));
      await saveTranslationPair(RECRUITMENT_JOB_ENTITY, job.id, field, zh, en, sourceLang);
    })
  );
}

async function saveIndustryTranslationPair(
  industry: typeof recruitmentIndustries.$inferSelect,
  body: object
): Promise<void> {
  const record = body as Record<string, string | null | undefined>;
  if (!hasOwn(record, "nameZh") && !hasOwn(record, "nameEn")) return;

  const zh = nonEmptyOrNull(record.nameZh);
  const en = nonEmptyOrNull(record.nameEn);
  const sourceLang = inferSourceLang(zh, en, industry.name, getSourceLang(record, "nameSourceLang"));
  await saveTranslationPair(RECRUITMENT_INDUSTRY_ENTITY, industry.id, INDUSTRY_NAME_FIELD, zh, en, sourceLang);
}

function serializeMaterial(
  row: typeof recruitmentMaterials.$inferSelect,
  usageCount = 0,
  document?: typeof documents.$inferSelect | null
) {
  return {
    id: row.id,
    company_id: row.companyId,
    job_id: row.jobId,
    type: row.type,
    title: row.title,
    source_text: row.sourceText,
    text_content: row.textContent,
    document_id: row.documentId,
    platforms: row.platforms,
    active: row.active,
    ai_generated: row.aiGenerated,
    usage_count: usageCount,
    document: document
      ? {
          id: document.id,
          storage_path: document.storagePath,
          filename: document.filename,
          mime: document.mime
        }
      : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function getMaterialDocumentMap(rows: (typeof recruitmentMaterials.$inferSelect)[]) {
  const ids = [...new Set(rows.map((row) => row.documentId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, typeof documents.$inferSelect>();

  const documentRows = await db.select().from(documents).where(inArray(documents.id, ids));
  return new Map(documentRows.map((document) => [document.id, document]));
}

async function getMaterialUsageMap(materialIds: string[]) {
  const usage = new Map<string, number>();
  if (materialIds.length === 0) return usage;

  const [copyRows, imageRows, campaignRows] = await Promise.all([
    db
      .select({ materialId: recruitmentPostings.copyMaterialId, total: count() })
      .from(recruitmentPostings)
      .where(inArray(recruitmentPostings.copyMaterialId, materialIds))
      .groupBy(recruitmentPostings.copyMaterialId),
    db
      .select({ materialId: recruitmentPostings.imageMaterialId, total: count() })
      .from(recruitmentPostings)
      .where(inArray(recruitmentPostings.imageMaterialId, materialIds))
      .groupBy(recruitmentPostings.imageMaterialId),
    db
      .select({ materialId: recruitmentCampaignMaterials.materialId, total: count() })
      .from(recruitmentCampaignMaterials)
      .where(inArray(recruitmentCampaignMaterials.materialId, materialIds))
      .groupBy(recruitmentCampaignMaterials.materialId)
  ]);

  for (const row of [...copyRows, ...imageRows, ...campaignRows]) {
    if (!row.materialId) continue;
    usage.set(row.materialId, (usage.get(row.materialId) ?? 0) + Number(row.total));
  }

  return usage;
}

async function serializeMaterialsWithUsage(rows: (typeof recruitmentMaterials.$inferSelect)[]) {
  const usageMap = await getMaterialUsageMap(rows.map((row) => row.id));
  const documentMap = await getMaterialDocumentMap(rows);
  return rows.map((row) => serializeMaterial(row, usageMap.get(row.id) ?? 0, row.documentId ? documentMap.get(row.documentId) : null));
}

function serializePosting(row: typeof recruitmentPostings.$inferSelect, screenshotDocument?: typeof documents.$inferSelect | null) {
  return {
    id: row.id,
    company_id: row.companyId,
    job_id: row.jobId,
    platform: row.platform,
    copy_material_id: row.copyMaterialId,
    image_material_id: row.imageMaterialId,
    share_url: row.shareUrl,
    screenshot_document_id: row.screenshotDocumentId,
    published_on: row.publishedOn,
    status: row.status,
    owner_id: row.ownerId,
    invite_clerk_id: row.inviteClerkId,
    inquiry_count: row.inquiryCount,
    notes: row.notes,
    screenshot_document: screenshotDocument
      ? {
          id: screenshotDocument.id,
          storage_path: screenshotDocument.storagePath,
          filename: screenshotDocument.filename,
          mime: screenshotDocument.mime
        }
      : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function getScreenshotDocumentMap(rows: (typeof recruitmentPostings.$inferSelect)[]) {
  const ids = [...new Set(rows.map((row) => row.screenshotDocumentId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, typeof documents.$inferSelect>();

  const screenshotRows = await db.select().from(documents).where(inArray(documents.id, ids));
  return new Map(screenshotRows.map((document) => [document.id, document]));
}

function serializeCampaign(row: typeof recruitmentCampaigns.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    type: row.type,
    status: row.status,
    location: row.location,
    planned_date: row.plannedDate,
    planned_start: row.plannedStart,
    planned_end: row.plannedEnd,
    actual_date: row.actualDate,
    owner_id: row.ownerId,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeCandidate(row: typeof recruitmentCandidates.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    phone: row.phone,
    nationality: row.nationality,
    photo_document_id: row.photoDocumentId,
    resume_document_id: row.resumeDocumentId,
    source_type: row.sourceType,
    source_posting_id: row.sourcePostingId,
    source_campaign_id: row.sourceCampaignId,
    intended_job_id: row.intendedJobId,
    status: row.status,
    assigned_clerk_id: row.assignedClerkId,
    in_talent_pool: row.inTalentPool,
    reusable_later: row.reusableLater,
    reusable_note: row.reusableNote,
    last_contacted_at: row.lastContactedAt,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeFollowup(row: typeof recruitmentFollowups.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    candidate_id: row.candidateId,
    by_employee_id: row.byEmployeeId,
    type: row.type,
    note: row.note,
    contacted_at: row.contactedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeInterview(row: typeof recruitmentInterviews.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    candidate_id: row.candidateId,
    scheduled_at: row.scheduledAt,
    interviewer_id: row.interviewerId,
    mode: row.mode,
    status: row.status,
    result: row.result,
    rating: row.rating,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeSettings(row: typeof recruitmentSettings.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    overdue_invite_days: row.overdueInviteDays,
    overdue_followup_days: row.overdueFollowupDays,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function isCandidateOverdue(
  candidate: typeof recruitmentCandidates.$inferSelect,
  settings: { overdueInviteDays: number; overdueFollowupDays: number },
  now = new Date()
) {
  const inviteDue = new Date(candidate.createdAt);
  inviteDue.setDate(inviteDue.getDate() + settings.overdueInviteDays);

  if (candidate.status === "new" && inviteDue < now) {
    return true;
  }

  if (candidate.status === "rejected" || candidate.status === "offered") {
    return false;
  }

  if (!candidate.lastContactedAt) {
    return true;
  }

  const followupDue = new Date(candidate.lastContactedAt);
  followupDue.setDate(followupDue.getDate() + settings.overdueFollowupDays);
  return followupDue < now;
}

async function getSettingsMap(companyIds: string[] | "all") {
  const rows =
    companyIds === "all"
      ? await db.select().from(recruitmentSettings)
      : companyIds.length === 0
        ? []
        : await db.select().from(recruitmentSettings).where(inArray(recruitmentSettings.companyId, companyIds));

  return new Map(rows.map((row) => [row.companyId, row]));
}

function settingsForCompany(
  settingsMap: Map<string, typeof recruitmentSettings.$inferSelect>,
  companyId: string
) {
  const row = settingsMap.get(companyId);
  return {
    overdueInviteDays: row?.overdueInviteDays ?? 2,
    overdueFollowupDays: row?.overdueFollowupDays ?? 3
  };
}

async function parseMaterialBody(request: FastifyRequest) {
  if (!isMultipartRequest(request)) {
    return {
      body: parseWithSchema(recruitmentMaterialCreateSchema, request.body),
      document: null as typeof documents.$inferSelect | null
    };
  }

  const fields: Record<string, unknown> = {};
  let document: typeof documents.$inferSelect | null = null;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const uploaded = await saveUpload(part, {
        subjectType: "recruitment_material",
        uploadedBy: request.user.id
      });
      document = mustReturn(uploaded, "recruitment_material_upload_failed");
      continue;
    }

    fields[part.fieldname] = part.value;
  }

  const body = parseWithSchema(recruitmentMaterialCreateSchema, {
    ...fields,
    active: booleanValue(fields.active),
    ai_generated: booleanValue(fields.ai_generated),
    platforms: arrayValue(fields.platforms),
    source_text: nullableValue(fields.source_text),
    document_id: fields.document_id ?? document?.id
  });

  return { body, document };
}

async function parseMaterialUpdateBody(request: FastifyRequest) {
  if (!isMultipartRequest(request)) {
    return {
      body: parseWithSchema(recruitmentMaterialUpdateSchema, request.body),
      document: null as typeof documents.$inferSelect | null
    };
  }

  const fields: Record<string, unknown> = {};
  let document: typeof documents.$inferSelect | null = null;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const uploaded = await saveUpload(part, {
        subjectType: "recruitment_material",
        uploadedBy: request.user.id
      });
      document = mustReturn(uploaded, "recruitment_material_upload_failed");
      continue;
    }

    fields[part.fieldname] = nullableValue(part.value);
  }

  const body = parseWithSchema(recruitmentMaterialUpdateSchema, {
    ...fields,
    active: booleanValue(fields.active),
    ai_generated: booleanValue(fields.ai_generated),
    platforms: arrayValue(fields.platforms),
    source_text: nullableValue(fields.source_text),
    document_id: fields.document_id ?? document?.id
  });

  return { body, document };
}

async function parseCandidateBody(request: FastifyRequest) {
  if (!isMultipartRequest(request)) {
    return {
      body: parseWithSchema(recruitmentCandidateCreateSchema, request.body),
      uploadedDocuments: [] as (typeof documents.$inferSelect)[]
    };
  }

  const fields: Record<string, unknown> = {};
  const uploadedDocuments: (typeof documents.$inferSelect)[] = [];
  let photoDocumentId: string | undefined;
  let resumeDocumentId: string | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const uploaded = await saveUpload(part, {
        subjectType: "recruitment_candidate",
        uploadedBy: request.user.id
      });
      const document = mustReturn(uploaded, "recruitment_candidate_upload_failed");
      uploadedDocuments.push(document);

      if (part.fieldname === "photo" || part.fieldname === "photo_document") {
        photoDocumentId = document.id;
      } else if (part.fieldname === "resume" || part.fieldname === "resume_document") {
        resumeDocumentId = document.id;
      }
      continue;
    }

    fields[part.fieldname] = nullableValue(part.value);
  }

  const body = parseWithSchema(recruitmentCandidateCreateSchema, {
    ...fields,
    photo_document_id: fields.photo_document_id ?? photoDocumentId,
    resume_document_id: fields.resume_document_id ?? resumeDocumentId,
    in_talent_pool: booleanValue(fields.in_talent_pool),
    reusable_later: booleanValue(fields.reusable_later)
  });

  return { body, uploadedDocuments };
}

async function replaceCampaignLinks(
  campaign: typeof recruitmentCampaigns.$inferSelect,
  jobIds?: string[],
  materialIds?: string[]
) {
  if (jobIds !== undefined) {
    await db.delete(recruitmentCampaignJobs).where(eq(recruitmentCampaignJobs.campaignId, campaign.id));
    if (jobIds.length > 0) {
      await db.insert(recruitmentCampaignJobs).values(
        jobIds.map((jobId) => ({
          companyId: campaign.companyId,
          campaignId: campaign.id,
          jobId
        }))
      );
    }
  }

  if (materialIds !== undefined) {
    await db.delete(recruitmentCampaignMaterials).where(eq(recruitmentCampaignMaterials.campaignId, campaign.id));
    if (materialIds.length > 0) {
      await db.insert(recruitmentCampaignMaterials).values(
        materialIds.map((materialId) => ({
          companyId: campaign.companyId,
          campaignId: campaign.id,
          materialId
        }))
      );
    }
  }
}

export async function registerRecruitmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/recruitment/industries", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const query = parseWithSchema(recruitmentIndustryListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, recruitmentIndustries.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.active) filters.push(eq(recruitmentIndustries.active, query.active === "1" || query.active === "true"));
    if (query.q) filters.push(sql`${recruitmentIndustries.name} ilike ${`%${query.q}%`}`);

    const rows = await db
      .select()
      .from(recruitmentIndustries)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(asc(recruitmentIndustries.sortOrder), asc(recruitmentIndustries.name));

    const resources = await serializeIndustriesWithI18n(rows);
    return { industries: resources, resources };
  });

  app.post("/recruitment/industries", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const body = parseWithSchema(recruitmentIndustryCreateSchema, request.body);
    if (!(await assertCompanyAccess(request, reply, body.company_id))) return;

    try {
      const [industry] = await db
        .insert(recruitmentIndustries)
        .values({
          companyId: body.company_id,
          name: body.name,
          sortOrder: body.sort_order,
          active: body.active
        })
        .returning();

      const savedIndustry = mustReturn(industry);
      await saveIndustryTranslationPair(savedIndustry, body);
      const [resource] = await serializeIndustriesWithI18n([savedIndustry]);
      return reply.code(201).send({ industry: resource, resource });
    } catch (error) {
      if (isUniqueViolation(error)) return sendConflict(reply, "recruitment_industry_exists");
      throw error;
    }
  });

  app.patch("/recruitment/industries/:id", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recruitmentIndustryUpdateSchema, request.body);
    const [existing] = await db.select().from(recruitmentIndustries).where(eq(recruitmentIndustries.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;

    const update: Partial<typeof recruitmentIndustries.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.sort_order !== undefined) update.sortOrder = body.sort_order;
    if (body.active !== undefined) update.active = body.active;

    try {
      const [industry] = await db.update(recruitmentIndustries).set(update).where(eq(recruitmentIndustries.id, id)).returning();
      const savedIndustry = mustReturn(industry);
      await saveIndustryTranslationPair(savedIndustry, body);
      const [resource] = await serializeIndustriesWithI18n([savedIndustry]);
      return { industry: resource, resource };
    } catch (error) {
      if (isUniqueViolation(error)) return sendConflict(reply, "recruitment_industry_exists");
      throw error;
    }
  });

  app.get("/recruitment/jobs", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const query = parseWithSchema(recruitmentJobListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, recruitmentJobs.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.industry_id) filters.push(eq(recruitmentJobs.industryId, query.industry_id));
    if (query.status) filters.push(eq(recruitmentJobs.status, query.status));
    if (query.priority) filters.push(eq(recruitmentJobs.priority, query.priority));
    if (query.q) filters.push(sql`${recruitmentJobs.title} ilike ${`%${query.q}%`}`);

    const rows = await db
      .select()
      .from(recruitmentJobs)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(desc(recruitmentJobs.createdAt));

    const resources = await serializeJobsWithI18n(rows);
    return { jobs: resources, resources };
  });

  app.post("/recruitment/jobs", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const body = parseWithSchema(recruitmentJobCreateSchema, request.body);
    if (!(await assertCompanyAccess(request, reply, body.company_id))) return;

    const [job] = await db
      .insert(recruitmentJobs)
      .values({
        companyId: body.company_id,
        industryId: body.industry_id,
        title: body.title,
        headcount: body.headcount,
        salaryMin: body.salary_min,
        salaryMax: body.salary_max,
        employmentTypes: body.employment_types ?? ["full_time"],
        ptSalaryMin: body.pt_salary_min == null ? null : String(body.pt_salary_min),
        ptSalaryMax: body.pt_salary_max == null ? null : String(body.pt_salary_max),
        salaryNote: body.salary_note,
        jobContent: body.job_content,
        requirements: body.requirements,
        nationalities: body.nationalities,
        status: body.status,
        priority: body.priority,
        ownerId: body.owner_id
      })
      .returning();

    const savedJob = mustReturn(job);
    await saveJobTranslationPairs(savedJob, body);
    const [resource] = await serializeJobsWithI18n([savedJob]);
    return reply.code(201).send({ job: resource, resource });
  });

  app.get("/recruitment/jobs/:id", { preHandler: requirePerm("recruitment.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [job] = await db.select().from(recruitmentJobs).where(eq(recruitmentJobs.id, id)).limit(1);
    if (!job) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, job.companyId))) return;

    const [materials, postings, campaignLinks, funnelRows] = await Promise.all([
      db.select().from(recruitmentMaterials).where(eq(recruitmentMaterials.jobId, id)).orderBy(desc(recruitmentMaterials.createdAt)),
      db.select().from(recruitmentPostings).where(eq(recruitmentPostings.jobId, id)).orderBy(desc(recruitmentPostings.createdAt)),
      db
        .select({ campaign: recruitmentCampaigns })
        .from(recruitmentCampaignJobs)
        .innerJoin(recruitmentCampaigns, eq(recruitmentCampaignJobs.campaignId, recruitmentCampaigns.id))
        .where(eq(recruitmentCampaignJobs.jobId, id)),
      db
        .select({ status: recruitmentCandidates.status, total: count() })
        .from(recruitmentCandidates)
        .where(eq(recruitmentCandidates.intendedJobId, id))
        .groupBy(recruitmentCandidates.status)
    ]);

    const offered = Number(funnelRows.find((row) => row.status === "offered")?.total ?? 0);

    const screenshotMap = await getScreenshotDocumentMap(postings);
    const serializedPostings = postings.map((posting) =>
      serializePosting(posting, posting.screenshotDocumentId ? screenshotMap.get(posting.screenshotDocumentId) : null)
    );

    const serializedMaterials = await serializeMaterialsWithUsage(materials);

    const [serializedJob] = await serializeJobsWithI18n([job]);

    return {
      job: serializedJob,
      resource: serializedJob,
      materials: serializedMaterials,
      postings: serializedPostings,
      campaigns: campaignLinks.map((row) => serializeCampaign(row.campaign)),
      summary: {
        offered,
        gap: Math.max(0, job.headcount - offered),
        funnel: funnelRows.map((row) => ({ status: row.status, count: Number(row.total) }))
      }
    };
  });

  app.patch("/recruitment/jobs/:id", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recruitmentJobUpdateSchema, request.body);
    const [existing] = await db.select().from(recruitmentJobs).where(eq(recruitmentJobs.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;

    const update: Partial<typeof recruitmentJobs.$inferInsert> = { updatedAt: new Date() };
    if (body.industry_id !== undefined) update.industryId = body.industry_id;
    if (body.title !== undefined) update.title = body.title;
    if (body.headcount !== undefined) update.headcount = body.headcount;
    if (hasOwn(body, "salary_min")) update.salaryMin = body.salary_min;
    if (hasOwn(body, "salary_max")) update.salaryMax = body.salary_max;
    if (body.employment_types !== undefined) update.employmentTypes = body.employment_types;
    if (hasOwn(body, "pt_salary_min")) update.ptSalaryMin = body.pt_salary_min == null ? null : String(body.pt_salary_min);
    if (hasOwn(body, "pt_salary_max")) update.ptSalaryMax = body.pt_salary_max == null ? null : String(body.pt_salary_max);
    if (hasOwn(body, "salary_note")) update.salaryNote = body.salary_note;
    if (hasOwn(body, "job_content")) update.jobContent = body.job_content;
    if (hasOwn(body, "requirements")) update.requirements = body.requirements;
    if (body.nationalities !== undefined) update.nationalities = body.nationalities;
    if (body.status !== undefined) update.status = body.status;
    if (body.priority !== undefined) update.priority = body.priority;
    if (hasOwn(body, "owner_id")) update.ownerId = body.owner_id;

    const [job] = await db.update(recruitmentJobs).set(update).where(eq(recruitmentJobs.id, id)).returning();
    const savedJob = mustReturn(job);
    await saveJobTranslationPairs(savedJob, body);
    const [resource] = await serializeJobsWithI18n([savedJob]);
    return { job: resource, resource };
  });

  app.get("/recruitment/jobs/:id/materials", { preHandler: requirePerm("recruitment.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [job] = await db.select().from(recruitmentJobs).where(eq(recruitmentJobs.id, id)).limit(1);
    if (!job) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, job.companyId))) return;

    const rows = await db.select().from(recruitmentMaterials).where(eq(recruitmentMaterials.jobId, id)).orderBy(desc(recruitmentMaterials.createdAt));
    const materials = await serializeMaterialsWithUsage(rows);
    return { materials, resources: materials };
  });

  app.post("/recruitment/materials", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { body, document } = await parseMaterialBody(request);
    if (!(await assertCompanyAccess(request, reply, body.company_id))) return;

    const [material] = await db
      .insert(recruitmentMaterials)
      .values({
        companyId: body.company_id,
        jobId: body.job_id,
        type: body.type,
        title: body.title,
        sourceText: body.source_text,
        textContent: body.text_content,
        documentId: body.document_id,
        platforms: body.platforms,
        active: body.active,
        aiGenerated: body.ai_generated
      })
      .returning();

    const resource = serializeMaterial(mustReturn(material), 0, document);
    return reply.code(201).send({
      material: resource,
      resource,
      document: document ? serializeDocument(document) : null
    });
  });

  app.patch("/recruitment/materials/:id", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const { body, document } = await parseMaterialUpdateBody(request);
    const [existing] = await db.select().from(recruitmentMaterials).where(eq(recruitmentMaterials.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;

    const update: Partial<typeof recruitmentMaterials.$inferInsert> = { updatedAt: new Date() };
    if (body.job_id !== undefined) update.jobId = body.job_id;
    if (body.type !== undefined) update.type = body.type;
    if (body.title !== undefined) update.title = body.title;
    if (hasOwn(body, "source_text")) update.sourceText = body.source_text;
    if (hasOwn(body, "text_content")) update.textContent = body.text_content;
    if (hasOwn(body, "document_id")) update.documentId = body.document_id;
    if (hasOwn(body, "platforms")) update.platforms = body.platforms;
    if (body.active !== undefined) update.active = body.active;
    if (body.ai_generated !== undefined) update.aiGenerated = body.ai_generated;

    const [material] = await db.update(recruitmentMaterials).set(update).where(eq(recruitmentMaterials.id, id)).returning();
    const usageMap = await getMaterialUsageMap([id]);
    const savedMaterial = mustReturn(material);
    const documentMap = document ? new Map([[document.id, document]]) : await getMaterialDocumentMap([savedMaterial]);
    const resource = serializeMaterial(savedMaterial, usageMap.get(id) ?? 0, savedMaterial.documentId ? documentMap.get(savedMaterial.documentId) : null);
    return { material: resource, resource };
  });

  app.delete("/recruitment/materials/:id", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(recruitmentMaterials).where(eq(recruitmentMaterials.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    await db.delete(recruitmentMaterials).where(eq(recruitmentMaterials.id, id));
    return reply.code(204).send();
  });

  app.post("/recruitment/materials/ai-copy", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const body = parseWithSchema(recruitmentAiCopySchema, request.body);
    const result = await generateRecruitmentCopy(body);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error, message: result.message });
    return { draft: result.draft, model: result.model };
  });

  app.get("/recruitment/postings", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const query = parseWithSchema(recruitmentPostingListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, recruitmentPostings.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.job_id) filters.push(eq(recruitmentPostings.jobId, query.job_id));
    if (query.platform) filters.push(eq(recruitmentPostings.platform, query.platform));
    if (query.status) filters.push(eq(recruitmentPostings.status, query.status));
    if (query.owner_id) filters.push(eq(recruitmentPostings.ownerId, query.owner_id));

    const rows = await db
      .select()
      .from(recruitmentPostings)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(desc(recruitmentPostings.createdAt));
    const screenshotMap = await getScreenshotDocumentMap(rows);
    const postings = rows.map((row) => serializePosting(row, row.screenshotDocumentId ? screenshotMap.get(row.screenshotDocumentId) : null));
    return { postings, resources: postings };
  });

  app.post("/recruitment/postings", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const body = parseWithSchema(recruitmentPostingCreateSchema, request.body);
    if (!(await assertCompanyAccess(request, reply, body.company_id))) return;
    const [posting] = await db
      .insert(recruitmentPostings)
      .values({
        companyId: body.company_id,
        jobId: body.job_id,
        platform: body.platform,
        copyMaterialId: body.copy_material_id,
        imageMaterialId: body.image_material_id,
        shareUrl: body.share_url,
        publishedOn: body.published_on,
        status: body.status,
        ownerId: body.owner_id,
        inviteClerkId: body.invite_clerk_id,
        inquiryCount: body.inquiry_count,
        notes: body.notes
      })
      .returning();
    const resource = serializePosting(mustReturn(posting));
    return reply.code(201).send({ posting: resource, resource });
  });

  app.patch("/recruitment/postings/:id", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recruitmentPostingUpdateSchema, request.body);
    const [existing] = await db.select().from(recruitmentPostings).where(eq(recruitmentPostings.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;

    const update: Partial<typeof recruitmentPostings.$inferInsert> = { updatedAt: new Date() };
    if (body.job_id !== undefined) update.jobId = body.job_id;
    if (body.platform !== undefined) update.platform = body.platform;
    if (hasOwn(body, "copy_material_id")) update.copyMaterialId = body.copy_material_id;
    if (hasOwn(body, "image_material_id")) update.imageMaterialId = body.image_material_id;
    if (hasOwn(body, "share_url")) update.shareUrl = body.share_url;
    if (body.published_on !== undefined) update.publishedOn = body.published_on;
    if (body.status !== undefined) update.status = body.status;
    if (body.owner_id !== undefined) update.ownerId = body.owner_id;
    if (hasOwn(body, "invite_clerk_id")) update.inviteClerkId = body.invite_clerk_id;
    if (body.inquiry_count !== undefined) update.inquiryCount = body.inquiry_count;
    if (hasOwn(body, "notes")) update.notes = body.notes;

    const [posting] = await db.update(recruitmentPostings).set(update).where(eq(recruitmentPostings.id, id)).returning();
    const resource = serializePosting(mustReturn(posting));
    return { posting: resource, resource };
  });

  app.post("/recruitment/postings/:id/screenshot", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(recruitmentPostings).where(eq(recruitmentPostings.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;

    let uploadedDocument: typeof documents.$inferSelect | null = null;
    for await (const part of request.parts()) {
      if (part.type !== "file" || uploadedDocument) continue;
      const uploaded = await saveUpload(part, {
        subjectType: "recruitment_posting_screenshot",
        subjectId: id,
        uploadedBy: request.user.id
      });
      uploadedDocument = mustReturn(uploaded, "recruitment_posting_screenshot_upload_failed");
    }

    if (!uploadedDocument) return reply.code(400).send({ error: "file_required" });

    const [posting] = await db
      .update(recruitmentPostings)
      .set({ screenshotDocumentId: uploadedDocument.id, updatedAt: new Date() })
      .where(eq(recruitmentPostings.id, id))
      .returning();
    const resource = serializePosting(mustReturn(posting), uploadedDocument);
    return { posting: resource, resource, document: serializeDocument(uploadedDocument) };
  });

  app.get("/recruitment/campaigns", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const query = parseWithSchema(recruitmentCampaignListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, recruitmentCampaigns.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.status) filters.push(eq(recruitmentCampaigns.status, query.status));
    if (query.type) filters.push(eq(recruitmentCampaigns.type, query.type));
    const rows = await db
      .select()
      .from(recruitmentCampaigns)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(desc(recruitmentCampaigns.plannedDate));
    return { campaigns: rows.map(serializeCampaign), resources: rows.map(serializeCampaign) };
  });

  app.post("/recruitment/campaigns", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const body = parseWithSchema(recruitmentCampaignCreateSchema, request.body);
    if (!(await assertCompanyAccess(request, reply, body.company_id))) return;
    const [campaign] = await db
      .insert(recruitmentCampaigns)
      .values({
        companyId: body.company_id,
        name: body.name,
        type: body.type,
        status: body.status,
        location: body.location,
        plannedDate: body.planned_date,
        plannedStart: body.planned_start,
        plannedEnd: body.planned_end,
        actualDate: body.actual_date,
        ownerId: body.owner_id,
        notes: body.notes
      })
      .returning();
    const createdCampaign = mustReturn(campaign);
    await replaceCampaignLinks(createdCampaign, body.job_ids, body.material_ids);
    const resource = serializeCampaign(createdCampaign);
    return reply.code(201).send({ campaign: resource, resource });
  });

  app.get("/recruitment/campaigns/:id", { preHandler: requirePerm("recruitment.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [campaign] = await db.select().from(recruitmentCampaigns).where(eq(recruitmentCampaigns.id, id)).limit(1);
    if (!campaign) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, campaign.companyId))) return;
    const [jobLinks, materialLinks, candidates] = await Promise.all([
      db
        .select({ job: recruitmentJobs })
        .from(recruitmentCampaignJobs)
        .innerJoin(recruitmentJobs, eq(recruitmentCampaignJobs.jobId, recruitmentJobs.id))
        .where(eq(recruitmentCampaignJobs.campaignId, id)),
      db
        .select({ material: recruitmentMaterials })
        .from(recruitmentCampaignMaterials)
        .innerJoin(recruitmentMaterials, eq(recruitmentCampaignMaterials.materialId, recruitmentMaterials.id))
        .where(eq(recruitmentCampaignMaterials.campaignId, id)),
      db.select().from(recruitmentCandidates).where(eq(recruitmentCandidates.sourceCampaignId, id)).orderBy(desc(recruitmentCandidates.createdAt))
    ]);
    return {
      campaign: serializeCampaign(campaign),
      resource: serializeCampaign(campaign),
      jobs: jobLinks.map((row) => serializeJob(row.job)),
      materials: materialLinks.map((row) => serializeMaterial(row.material)),
      candidates: candidates.map(serializeCandidate)
    };
  });

  app.patch("/recruitment/campaigns/:id", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recruitmentCampaignUpdateSchema, request.body);
    const [existing] = await db.select().from(recruitmentCampaigns).where(eq(recruitmentCampaigns.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const update: Partial<typeof recruitmentCampaigns.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.type !== undefined) update.type = body.type;
    if (body.status !== undefined) update.status = body.status;
    if (body.location !== undefined) update.location = body.location;
    if (body.planned_date !== undefined) update.plannedDate = body.planned_date;
    if (body.planned_start !== undefined) update.plannedStart = body.planned_start;
    if (body.planned_end !== undefined) update.plannedEnd = body.planned_end;
    if (hasOwn(body, "actual_date")) update.actualDate = body.actual_date;
    if (body.owner_id !== undefined) update.ownerId = body.owner_id;
    if (hasOwn(body, "notes")) update.notes = body.notes;
    const [campaign] = await db.update(recruitmentCampaigns).set(update).where(eq(recruitmentCampaigns.id, id)).returning();
    const updatedCampaign = mustReturn(campaign);
    const links = parseWithSchema(uuidArrayBodySchema.partial(), request.body);
    await replaceCampaignLinks(updatedCampaign, links.job_ids, links.material_ids);
    const resource = serializeCampaign(updatedCampaign);
    return { campaign: resource, resource };
  });

  app.get("/recruitment/candidates", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const query = parseWithSchema(recruitmentCandidateListQuerySchema, request.query);
    const filters: SQL[] = [];
    const companyIds = await getAccessibleCompanyIds(request);
    const accessFilter = companyFilter(companyIds, recruitmentCandidates.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.status) filters.push(eq(recruitmentCandidates.status, query.status));
    if (query.intended_job_id) filters.push(eq(recruitmentCandidates.intendedJobId, query.intended_job_id));
    if (query.source_type) filters.push(eq(recruitmentCandidates.sourceType, query.source_type));
    if (query.assigned_clerk_id) filters.push(eq(recruitmentCandidates.assignedClerkId, query.assigned_clerk_id));
    if (query.in_talent_pool) filters.push(eq(recruitmentCandidates.inTalentPool, query.in_talent_pool === "1" || query.in_talent_pool === "true"));
    const rows = await db
      .select()
      .from(recruitmentCandidates)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(desc(recruitmentCandidates.createdAt));
    const settingsMap = await getSettingsMap(companyIds);
    const filtered =
      query.overdue === "1" || query.overdue === "true"
        ? rows.filter((row) => isCandidateOverdue(row, settingsForCompany(settingsMap, row.companyId)))
        : rows;
    return { candidates: filtered.map(serializeCandidate), resources: filtered.map(serializeCandidate) };
  });

  app.post("/recruitment/candidates", { preHandler: requirePerm("recruitment.candidate.manage") }, async (request, reply) => {
    const { body, uploadedDocuments } = await parseCandidateBody(request);
    if (!(await assertCompanyAccess(request, reply, body.company_id))) return;
    const [candidate] = await db
      .insert(recruitmentCandidates)
      .values({
        companyId: body.company_id,
        name: body.name,
        phone: body.phone,
        nationality: body.nationality,
        photoDocumentId: body.photo_document_id,
        resumeDocumentId: body.resume_document_id,
        sourceType: body.source_type,
        sourcePostingId: body.source_posting_id,
        sourceCampaignId: body.source_campaign_id,
        intendedJobId: body.intended_job_id,
        status: body.status,
        assignedClerkId: body.assigned_clerk_id,
        inTalentPool: body.in_talent_pool,
        reusableLater: body.reusable_later,
        reusableNote: body.reusable_note,
        lastContactedAt: body.last_contacted_at ? new Date(body.last_contacted_at) : undefined,
        notes: body.notes
      })
      .returning();
    const resource = serializeCandidate(mustReturn(candidate));
    return reply.code(201).send({
      candidate: resource,
      resource,
      documents: uploadedDocuments.map(serializeDocument)
    });
  });

  app.get("/recruitment/candidates/:id", { preHandler: requirePerm("recruitment.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [candidate] = await db.select().from(recruitmentCandidates).where(eq(recruitmentCandidates.id, id)).limit(1);
    if (!candidate) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, candidate.companyId))) return;
    const [followups, interviews] = await Promise.all([
      db.select().from(recruitmentFollowups).where(eq(recruitmentFollowups.candidateId, id)).orderBy(desc(recruitmentFollowups.contactedAt)),
      db.select().from(recruitmentInterviews).where(eq(recruitmentInterviews.candidateId, id)).orderBy(desc(recruitmentInterviews.scheduledAt))
    ]);
    return {
      candidate: serializeCandidate(candidate),
      resource: serializeCandidate(candidate),
      followups: followups.map(serializeFollowup),
      interviews: interviews.map(serializeInterview)
    };
  });

  app.patch("/recruitment/candidates/:id", { preHandler: requirePerm("recruitment.candidate.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recruitmentCandidateUpdateSchema, request.body);
    const [existing] = await db.select().from(recruitmentCandidates).where(eq(recruitmentCandidates.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const update: Partial<typeof recruitmentCandidates.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.phone !== undefined) update.phone = body.phone;
    if (hasOwn(body, "nationality")) update.nationality = body.nationality;
    if (hasOwn(body, "photo_document_id")) update.photoDocumentId = body.photo_document_id;
    if (hasOwn(body, "resume_document_id")) update.resumeDocumentId = body.resume_document_id;
    if (body.source_type !== undefined) update.sourceType = body.source_type;
    if (hasOwn(body, "source_posting_id")) update.sourcePostingId = body.source_posting_id;
    if (hasOwn(body, "source_campaign_id")) update.sourceCampaignId = body.source_campaign_id;
    if (hasOwn(body, "intended_job_id")) update.intendedJobId = body.intended_job_id;
    if (body.status !== undefined) update.status = body.status;
    if (hasOwn(body, "assigned_clerk_id")) update.assignedClerkId = body.assigned_clerk_id;
    if (body.in_talent_pool !== undefined) update.inTalentPool = body.in_talent_pool;
    if (body.reusable_later !== undefined) update.reusableLater = body.reusable_later;
    if (hasOwn(body, "reusable_note")) update.reusableNote = body.reusable_note;
    if (hasOwn(body, "last_contacted_at")) update.lastContactedAt = body.last_contacted_at ? new Date(body.last_contacted_at) : null;
    if (hasOwn(body, "notes")) update.notes = body.notes;
    const [candidate] = await db.update(recruitmentCandidates).set(update).where(eq(recruitmentCandidates.id, id)).returning();
    const resource = serializeCandidate(mustReturn(candidate));
    return { candidate: resource, resource };
  });

  app.post("/recruitment/candidates/:id/followups", { preHandler: requirePerm("recruitment.candidate.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [candidate] = await db.select().from(recruitmentCandidates).where(eq(recruitmentCandidates.id, id)).limit(1);
    if (!candidate) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, candidate.companyId))) return;
    const raw =
      request.body && typeof request.body === "object"
        ? { ...(request.body as Record<string, unknown>), candidate_id: id, company_id: candidate.companyId }
        : { candidate_id: id, company_id: candidate.companyId };
    const body = parseWithSchema(recruitmentFollowupCreateSchema, raw);
    const contactedAt = body.contacted_at ? new Date(body.contacted_at) : new Date();
    const [followup] = await db
      .insert(recruitmentFollowups)
      .values({
        companyId: candidate.companyId,
        candidateId: id,
        byEmployeeId: body.by_employee_id,
        type: body.type,
        note: body.note,
        contactedAt
      })
      .returning();
    await db.update(recruitmentCandidates).set({ lastContactedAt: contactedAt, updatedAt: new Date() }).where(eq(recruitmentCandidates.id, id));
    const resource = serializeFollowup(mustReturn(followup));
    return reply.code(201).send({ followup: resource, resource });
  });

  app.post("/recruitment/interviews", { preHandler: requirePerm("recruitment.candidate.manage") }, async (request, reply) => {
    const body = parseWithSchema(recruitmentInterviewCreateSchema, request.body);
    if (!(await assertCompanyAccess(request, reply, body.company_id))) return;
    const [interview] = await db
      .insert(recruitmentInterviews)
      .values({
        companyId: body.company_id,
        candidateId: body.candidate_id,
        scheduledAt: new Date(body.scheduled_at),
        interviewerId: body.interviewer_id,
        mode: body.mode,
        status: body.status,
        result: body.result,
        rating: body.rating,
        notes: body.notes
      })
      .returning();
    await db
      .update(recruitmentCandidates)
      .set({ status: "interview_scheduled", updatedAt: new Date() })
      .where(and(eq(recruitmentCandidates.id, body.candidate_id), eq(recruitmentCandidates.companyId, body.company_id)));
    const resource = serializeInterview(mustReturn(interview));
    return reply.code(201).send({ interview: resource, resource });
  });

  app.patch("/recruitment/interviews/:id", { preHandler: requirePerm("recruitment.candidate.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recruitmentInterviewUpdateSchema, request.body);
    const [existing] = await db.select().from(recruitmentInterviews).where(eq(recruitmentInterviews.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const update: Partial<typeof recruitmentInterviews.$inferInsert> = { updatedAt: new Date() };
    if (body.candidate_id !== undefined) update.candidateId = body.candidate_id;
    if (body.scheduled_at !== undefined) update.scheduledAt = new Date(body.scheduled_at);
    if (hasOwn(body, "interviewer_id")) update.interviewerId = body.interviewer_id;
    if (body.mode !== undefined) update.mode = body.mode;
    if (body.status !== undefined) update.status = body.status;
    if (body.result !== undefined) update.result = body.result;
    if (hasOwn(body, "rating")) update.rating = body.rating;
    if (hasOwn(body, "notes")) update.notes = body.notes;
    const [interview] = await db.update(recruitmentInterviews).set(update).where(eq(recruitmentInterviews.id, id)).returning();
    const updatedInterview = mustReturn(interview);
    if (body.status === "done") {
      await db.update(recruitmentCandidates).set({ status: "interviewed", updatedAt: new Date() }).where(eq(recruitmentCandidates.id, updatedInterview.candidateId));
    }
    const resource = serializeInterview(updatedInterview);
    return { interview: resource, resource };
  });

  app.get("/recruitment/settings", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const accessFilter = await getAccessibleFilter(request, recruitmentSettings.companyId);
    const rows = await db.select().from(recruitmentSettings).where(accessFilter ?? sql`true`);
    return { settings: rows.map(serializeSettings), resources: rows.map(serializeSettings) };
  });

  app.patch("/recruitment/settings/:id", { preHandler: requirePerm("recruitment.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(recruitmentSettingsUpdateSchema, request.body);
    const [existing] = await db.select().from(recruitmentSettings).where(eq(recruitmentSettings.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const [settings] = await db
      .update(recruitmentSettings)
      .set({
        overdueInviteDays: body.overdue_invite_days,
        overdueFollowupDays: body.overdue_followup_days,
        updatedAt: new Date()
      })
      .where(eq(recruitmentSettings.id, id))
      .returning();
    const resource = serializeSettings(mustReturn(settings));
    return { settings: resource, resource };
  });

  app.get("/recruitment/dashboard", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const companyIds = await getAccessibleCompanyIds(request);
    const jobAccess = companyFilter(companyIds, recruitmentJobs.companyId);
    const candidateAccess = companyFilter(companyIds, recruitmentCandidates.companyId);
    const campaignAccess = companyFilter(companyIds, recruitmentCampaigns.companyId);
    const postingAccess = companyFilter(companyIds, recruitmentPostings.companyId);
    const settingsMap = await getSettingsMap(companyIds);

    const [jobs, offeredRows, candidateRows, trendRows, campaignRows, campaignInterviewRows, campaignOfferRows, platformRows, platformInterviewRows, platformOfferRows, recentCandidateRows] =
      await Promise.all([
        db.select().from(recruitmentJobs).where(and(jobAccess ?? sql`true`, eq(recruitmentJobs.status, "open"))),
        db
          .select({ jobId: recruitmentCandidates.intendedJobId, total: count() })
          .from(recruitmentCandidates)
          .where(and(candidateAccess ?? sql`true`, eq(recruitmentCandidates.status, "offered"), isNotNull(recruitmentCandidates.intendedJobId)))
          .groupBy(recruitmentCandidates.intendedJobId),
        db.select().from(recruitmentCandidates).where(candidateAccess ?? sql`true`),
        db
          .select({
            day: sql<string>`date(${recruitmentCandidates.createdAt})`,
            postingId: recruitmentCandidates.sourcePostingId,
            jobId: recruitmentCandidates.intendedJobId,
            total: count()
          })
          .from(recruitmentCandidates)
          .where(candidateAccess ?? sql`true`)
          .groupBy(sql`date(${recruitmentCandidates.createdAt})`, recruitmentCandidates.sourcePostingId, recruitmentCandidates.intendedJobId)
          .orderBy(sql`date(${recruitmentCandidates.createdAt})`),
        db.select().from(recruitmentCampaigns).where(campaignAccess ?? sql`true`),
        db
          .select({ campaignId: recruitmentCandidates.sourceCampaignId, total: count() })
          .from(recruitmentCandidates)
          .innerJoin(recruitmentInterviews, eq(recruitmentCandidates.id, recruitmentInterviews.candidateId))
          .where(and(candidateAccess ?? sql`true`, isNotNull(recruitmentCandidates.sourceCampaignId)))
          .groupBy(recruitmentCandidates.sourceCampaignId),
        db
          .select({ campaignId: recruitmentCandidates.sourceCampaignId, total: count() })
          .from(recruitmentCandidates)
          .where(and(candidateAccess ?? sql`true`, isNotNull(recruitmentCandidates.sourceCampaignId), eq(recruitmentCandidates.status, "offered")))
          .groupBy(recruitmentCandidates.sourceCampaignId),
        db
          .select({ postingId: recruitmentPostings.id, platform: recruitmentPostings.platform, jobId: recruitmentPostings.jobId, leads: count(recruitmentCandidates.id) })
          .from(recruitmentPostings)
          .leftJoin(recruitmentCandidates, eq(recruitmentCandidates.sourcePostingId, recruitmentPostings.id))
          .where(postingAccess ?? sql`true`)
          .groupBy(recruitmentPostings.id),
        db
          .select({ postingId: recruitmentCandidates.sourcePostingId, total: count() })
          .from(recruitmentCandidates)
          .innerJoin(recruitmentInterviews, eq(recruitmentCandidates.id, recruitmentInterviews.candidateId))
          .where(and(candidateAccess ?? sql`true`, isNotNull(recruitmentCandidates.sourcePostingId)))
          .groupBy(recruitmentCandidates.sourcePostingId),
        db
          .select({ postingId: recruitmentCandidates.sourcePostingId, total: count() })
          .from(recruitmentCandidates)
          .where(and(candidateAccess ?? sql`true`, isNotNull(recruitmentCandidates.sourcePostingId), eq(recruitmentCandidates.status, "offered")))
          .groupBy(recruitmentCandidates.sourcePostingId),
        db
          .select({ jobId: recruitmentCandidates.intendedJobId, latest: sql<Date>`max(${recruitmentCandidates.createdAt})` })
          .from(recruitmentCandidates)
          .where(and(candidateAccess ?? sql`true`, isNotNull(recruitmentCandidates.intendedJobId)))
          .groupBy(recruitmentCandidates.intendedJobId)
      ]);

    const offeredByJob = new Map(offeredRows.map((row) => [row.jobId, Number(row.total)]));
    const recentCandidateByJob = new Map(recentCandidateRows.map((row) => [row.jobId, row.latest]));
    const gaps = jobs.map((job) => {
      const offered = offeredByJob.get(job.id) ?? 0;
      return {
        job: serializeJob(job),
        headcount: job.headcount,
        offered,
        gap: Math.max(0, job.headcount - offered)
      };
    });
    const totalGap = gaps.reduce((sum, row) => sum + row.gap, 0);
    const now = new Date();
    const urgentJobs = gaps
      .filter((row) => {
        if (row.job.priority === "urgent" && row.gap > 0) return true;
        const latest = recentCandidateByJob.get(row.job.id);
        const daysWithoutLead = latest ? (now.getTime() - new Date(latest).getTime()) / 86400000 : 999;
        return row.gap > 0 && daysWithoutLead > 7;
      })
      .map((row) => ({
        ...row,
        urgent_by_priority: row.job.priority === "urgent",
        urgent_by_rule: row.gap > 0
      }));
    const campaignInterviews = new Map(campaignInterviewRows.map((row) => [row.campaignId, Number(row.total)]));
    const campaignOffers = new Map(campaignOfferRows.map((row) => [row.campaignId, Number(row.total)]));
    const campaignLeads = new Map<string, number>();
    for (const candidate of candidateRows) {
      if (candidate.sourceCampaignId) campaignLeads.set(candidate.sourceCampaignId, (campaignLeads.get(candidate.sourceCampaignId) ?? 0) + 1);
    }
    const postingInterviews = new Map(platformInterviewRows.map((row) => [row.postingId, Number(row.total)]));
    const postingOffers = new Map(platformOfferRows.map((row) => [row.postingId, Number(row.total)]));
    const overdueCandidates = candidateRows.filter((candidate) => isCandidateOverdue(candidate, settingsForCompany(settingsMap, candidate.companyId)));

    return {
      dashboard: {
        gap_overview: {
          total_gap: totalGap,
          jobs: gaps.sort((a, b) => b.gap - a.gap)
        },
        urgent_jobs: urgentJobs,
        daily_leads: trendRows.map((row) => ({
          day: row.day,
          posting_id: row.postingId,
          job_id: row.jobId,
          count: Number(row.total)
        })),
        campaign_reports: campaignRows.map((campaign) => ({
          campaign: serializeCampaign(campaign),
          leads: campaignLeads.get(campaign.id) ?? 0,
          interviews: campaignInterviews.get(campaign.id) ?? 0,
          offers: campaignOffers.get(campaign.id) ?? 0
        })),
        platform_effectiveness: platformRows.map((row) => ({
          posting_id: row.postingId,
          platform: row.platform,
          job_id: row.jobId,
          leads: Number(row.leads),
          interviews: postingInterviews.get(row.postingId) ?? 0,
          offers: postingOffers.get(row.postingId) ?? 0
        })),
        overdue: {
          count: overdueCandidates.length,
          candidates: overdueCandidates.slice(0, 20).map(serializeCandidate)
        }
      }
    };
  });
}
