import {
  companies,
  db,
  employees,
  ifmCompaniesCache,
  recruitmentCampaigns,
  recruitmentCandidates,
  recruitmentFollowups,
  recruitmentGroupOwners,
  recruitmentIfmUserBindings,
  recruitmentInterviews,
  recruitmentJobs,
  recruitmentKpiTargets,
  recruitmentPostings
} from "@bh/db";
import {
  recruitmentCampaignStatuses,
  recruitmentCampaignTypes,
  recruitmentCandidateStatuses,
  recruitmentInterviewResults,
  recruitmentInterviewStatuses,
  recruitmentJobPriorities,
  recruitmentJobStatuses,
  recruitmentPostingStatuses
} from "@bh/shared";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";
import { computeKpiActualForPeriod, enumerateKpiPeriodWindows, kpiPeriodDaysLeft, kpiPeriodWindow, kpiPeriods } from "./recruitmentKpiPeriod";

type BridgeRole = "manager" | "operator";
type BridgeActor = {
  bridgeRole: BridgeRole;
  employeeId: string | null;
  ifmUserId: string;
};

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.string().trim().min(1).optional();
const nullableText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const nullableUuid = uuidField.nullable().optional();
const metricSchema = z.enum(["daily_posts", "daily_new_group_owners", "daily_contacts"]);
const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});
const rangeQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional()
});
const myKpiQuerySchema = z.object({
  date: dateString.default(todayString())
});
const ifmCompanyParamsSchema = z.object({
  ifmCompanyId: z.string().trim().min(1)
});
const companiesSyncSchema = z.object({
  companies: z.array(
    z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      active: z.boolean().optional()
    })
  )
});
const kpiCreateSchema = z
  .object({
    ifmCompanyId: z.string().trim().min(1),
    assigneeEmployeeId: uuidField,
    metric: metricSchema,
    platform: nullableText,
    period: z.enum(kpiPeriods).default("daily"),
    targetPerDay: z.number().int().min(1),
    effectiveFrom: dateString,
    effectiveTo: dateString.nullable().optional(),
    active: z.boolean().optional(),
    note: nullableText
  })
  .refine((body) => !body.effectiveTo || body.effectiveTo >= body.effectiveFrom, {
    message: "效期止不能早于效期起",
    path: ["effectiveTo"]
  });
const kpiPatchSchema = z.object({
  period: z.enum(kpiPeriods).optional(),
  targetPerDay: z.number().int().min(1).optional(),
  effectiveTo: dateString.nullable().optional(),
  active: z.boolean().optional(),
  note: nullableText,
  platform: nullableText
});
const postingCreateSchema = z.object({
  ifmCompanyId: z.string().trim().min(1),
  jobId: uuidField,
  platform: z.string().trim().min(1).max(120),
  publishedOn: dateString,
  shareUrl: z.string().trim().max(1024).nullable().optional(),
  notes: nullableText
});
const candidateCreateSchema = z.object({
  ifmCompanyId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(64),
  sourceType: z.enum(["walk_in", "referral", "posting", "campaign"]),
  intendedJobId: nullableUuid,
  notes: nullableText
});
const followupCreateSchema = z.object({
  type: z.enum(["call", "whatsapp", "email", "interview_invite", "note"]),
  note: z.string().trim().min(1),
  contactedAt: z.string().datetime().optional()
});
const groupOwnerCreateSchema = z.object({
  ifmCompanyId: z.string().trim().min(1),
  platform: z.string().trim().min(1).max(120),
  groupName: z.string().trim().min(1).max(200),
  ownerName: z.string().trim().min(1).max(200).nullable().optional(),
  ownerContact: z.string().trim().min(1).max(120).nullable().optional(),
  groupUrl: z.string().trim().max(1024).nullable().optional(),
  memberCount: z.number().int().min(0).nullable().optional(),
  foundOn: dateString.default(todayString()),
  notes: nullableText
});
const salaryRangeOk = (body: { salaryMin?: number | null | undefined; salaryMax?: number | null | undefined }) =>
  body.salaryMin == null || body.salaryMax == null || body.salaryMax >= body.salaryMin;
const salaryRangeIssue = { message: "薪资上限不能低于下限", path: ["salaryMax"] };
const jobBaseSchema = z.object({
  ifmCompanyId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  headcount: z.number().int().min(1).default(1),
  salaryMin: z.number().int().min(0).nullable().optional(),
  salaryMax: z.number().int().min(0).nullable().optional(),
  jobContent: nullableText,
  requirements: nullableText,
  status: z.enum(recruitmentJobStatuses).default("open"),
  priority: z.enum(recruitmentJobPriorities).default("normal")
});
const jobCreateSchema = jobBaseSchema.refine(salaryRangeOk, salaryRangeIssue);
const jobPatchSchema = jobBaseSchema.omit({ ifmCompanyId: true }).partial().refine(salaryRangeOk, salaryRangeIssue);
const candidatePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(64).optional(),
  nationality: z.string().trim().min(1).max(80).nullable().optional(),
  notes: nullableText,
  status: z.enum(recruitmentCandidateStatuses).optional(),
  intendedJobId: nullableUuid,
  ethnicity: nullableText,
  ageBand: nullableText,
  experienceLevel: nullableText
});
const postingPatchSchema = z.object({
  platform: z.string().trim().min(1).max(120).optional(),
  publishedOn: dateString.optional(),
  shareUrl: z.string().trim().max(1024).nullable().optional(),
  notes: nullableText,
  status: z.enum(recruitmentPostingStatuses).optional(),
  inquiryCount: z.number().int().min(0).optional()
});
const groupOwnerPatchSchema = z.object({
  platform: z.string().trim().min(1).max(120).optional(),
  groupName: z.string().trim().min(1).max(200).optional(),
  ownerName: z.string().trim().min(1).max(200).nullable().optional(),
  ownerContact: z.string().trim().min(1).max(120).nullable().optional(),
  groupUrl: z.string().trim().max(1024).nullable().optional(),
  memberCount: z.number().int().min(0).nullable().optional(),
  foundOn: dateString.optional(),
  notes: nullableText
});
const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const campaignTimeOk = (body: { plannedStart?: string | undefined; plannedEnd?: string | undefined }) =>
  !body.plannedStart || !body.plannedEnd || body.plannedEnd > body.plannedStart;
const campaignTimeIssue = { message: "结束时间必须晚于开始时间", path: ["plannedEnd"] };
const campaignBaseSchema = z.object({
  ifmCompanyId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  type: z.enum(recruitmentCampaignTypes),
  location: z.string().trim().min(1).max(255),
  plannedDate: dateString,
  plannedStart: timeString,
  plannedEnd: timeString,
  cost: z.number().min(0).nullable().optional(),
  notes: nullableText
});
const campaignCreateSchema = campaignBaseSchema.refine(campaignTimeOk, campaignTimeIssue);
const campaignPatchSchema = campaignBaseSchema
  .omit({ ifmCompanyId: true })
  .partial()
  .extend({
    status: z.enum(recruitmentCampaignStatuses).optional(),
    actualDate: dateString.nullable().optional()
  })
  .refine(campaignTimeOk, campaignTimeIssue);
const interviewCreateSchema = z.object({
  candidateId: uuidField,
  scheduledAt: z.string().datetime(),
  mode: z.string().trim().min(1).max(80),
  interviewerId: uuidField.optional(),
  notes: nullableText
});
const interviewPatchSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  mode: z.string().trim().min(1).max(80).optional(),
  interviewerId: uuidField.nullable().optional(),
  status: z.enum(recruitmentInterviewStatuses).optional(),
  result: z.enum(recruitmentInterviewResults).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: nullableText
});
const interviewListQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});
const comparisonQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional()
});

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function endOfDate(date: string) {
  return new Date(`${date}T23:59:59.999`);
}

function shiftDate(date: string, deltaDays: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function enumerateDays(from: string, to: string) {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return days;
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function setActor(request: FastifyRequest, actor: BridgeActor) {
  (request as FastifyRequest & { bridgeActor: BridgeActor }).bridgeActor = actor;
}

function getActor(request: FastifyRequest) {
  return (request as FastifyRequest & { bridgeActor: BridgeActor }).bridgeActor;
}

function hasOwn(input: object, field: string) {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function mustReturn<T>(row: T | undefined): T {
  if (!row) {
    throw new Error("db_write_failed");
  }

  return row;
}

function mapFollowupType(type: z.infer<typeof followupCreateSchema>["type"]) {
  if (type === "whatsapp" || type === "email") return "message";
  if (type === "interview_invite") return "invite";
  return type;
}

function requireManager(request: FastifyRequest, reply: FastifyReply) {
  if (getActor(request).bridgeRole !== "manager") {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

function requireOperatorEmployee(request: FastifyRequest, reply: FastifyReply) {
  const actor = getActor(request);
  if (actor.bridgeRole !== "operator" || !actor.employeeId) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return actor.employeeId;
}

async function bridgeAuthenticate(request: FastifyRequest, reply: FastifyReply) {
  if (!env.IFM_BRIDGE_TOKEN) {
    return reply.code(503).send({ error: "bridge disabled" });
  }

  if (headerValue(request.headers["x-bridge-key"]) !== env.IFM_BRIDGE_TOKEN) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const ifmUserId = headerValue(request.headers["x-acting-user"]);
  if (!ifmUserId) {
    return reply.code(403).send({ error: "forbidden" });
  }

  const [binding] = await db
    .select({
      ifmUserId: recruitmentIfmUserBindings.ifmUserId,
      employeeId: recruitmentIfmUserBindings.employeeId,
      bridgeRole: recruitmentIfmUserBindings.bridgeRole
    })
    .from(recruitmentIfmUserBindings)
    .where(and(eq(recruitmentIfmUserBindings.ifmUserId, ifmUserId), eq(recruitmentIfmUserBindings.active, true)))
    .limit(1);

  if (!binding || (binding.bridgeRole !== "manager" && binding.bridgeRole !== "operator")) {
    return reply.code(403).send({ error: "forbidden" });
  }

  setActor(request, {
    ifmUserId: binding.ifmUserId,
    employeeId: binding.employeeId,
    bridgeRole: binding.bridgeRole
  });
}

function rangeFilters(from: string | undefined, to: string | undefined, dateColumn: any): SQL[] {
  const filters: SQL[] = [];
  if (from) filters.push(gte(dateColumn, from));
  if (to) filters.push(lte(dateColumn, to));
  return filters;
}

function timestampRangeFilters(from: string | undefined, to: string | undefined, dateColumn: any): SQL[] {
  const filters: SQL[] = [];
  if (from) filters.push(gte(dateColumn, new Date(`${from}T00:00:00.000`)));
  if (to) filters.push(lte(dateColumn, endOfDate(to)));
  return filters;
}

async function resolveIfmCompany(ifmCompanyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.ifmCompanyId, ifmCompanyId)).limit(1);
  return company ?? null;
}

async function ensureActiveEmployee(employeeId: string) {
  const [employee] = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.status, "active")))
    .limit(1);
  return employee ?? null;
}

async function ensureCompanyJob(companyId: string, jobId: string) {
  const [job] = await db
    .select({ id: recruitmentJobs.id })
    .from(recruitmentJobs)
    .where(and(eq(recruitmentJobs.id, jobId), eq(recruitmentJobs.companyId, companyId)))
    .limit(1);
  return job ?? null;
}

async function ensureBoundRecruitmentJob(id: string) {
  const [row] = await db
    .select({ job: recruitmentJobs, companyId: recruitmentJobs.companyId, ifmCompanyId: companies.ifmCompanyId })
    .from(recruitmentJobs)
    .innerJoin(companies, eq(recruitmentJobs.companyId, companies.id))
    .where(and(eq(recruitmentJobs.id, id), isNotNull(companies.ifmCompanyId)))
    .limit(1);
  return row ?? null;
}

async function ensureBoundRecruitmentCandidate(id: string) {
  const [row] = await db
    .select({ candidate: recruitmentCandidates, companyId: recruitmentCandidates.companyId, ifmCompanyId: companies.ifmCompanyId })
    .from(recruitmentCandidates)
    .innerJoin(companies, eq(recruitmentCandidates.companyId, companies.id))
    .where(and(eq(recruitmentCandidates.id, id), isNotNull(companies.ifmCompanyId)))
    .limit(1);
  return row ?? null;
}

async function ensureBoundRecruitmentPosting(id: string) {
  const [row] = await db
    .select({ posting: recruitmentPostings, companyId: recruitmentPostings.companyId, ifmCompanyId: companies.ifmCompanyId })
    .from(recruitmentPostings)
    .innerJoin(companies, eq(recruitmentPostings.companyId, companies.id))
    .where(and(eq(recruitmentPostings.id, id), isNotNull(companies.ifmCompanyId)))
    .limit(1);
  return row ?? null;
}

async function ensureBoundRecruitmentGroupOwner(id: string) {
  const [row] = await db
    .select({ groupOwner: recruitmentGroupOwners, companyId: recruitmentGroupOwners.companyId, ifmCompanyId: companies.ifmCompanyId })
    .from(recruitmentGroupOwners)
    .innerJoin(companies, eq(recruitmentGroupOwners.companyId, companies.id))
    .where(and(eq(recruitmentGroupOwners.id, id), isNotNull(companies.ifmCompanyId)))
    .limit(1);
  return row ?? null;
}

async function ensureBoundRecruitmentCampaign(id: string) {
  const [row] = await db
    .select({ campaign: recruitmentCampaigns, companyId: recruitmentCampaigns.companyId, ifmCompanyId: companies.ifmCompanyId })
    .from(recruitmentCampaigns)
    .innerJoin(companies, eq(recruitmentCampaigns.companyId, companies.id))
    .where(and(eq(recruitmentCampaigns.id, id), isNotNull(companies.ifmCompanyId)))
    .limit(1);
  return row ?? null;
}

async function ensureBoundRecruitmentInterview(id: string) {
  const [row] = await db
    .select({ interview: recruitmentInterviews, companyId: recruitmentInterviews.companyId, ifmCompanyId: companies.ifmCompanyId })
    .from(recruitmentInterviews)
    .innerJoin(companies, eq(recruitmentInterviews.companyId, companies.id))
    .where(and(eq(recruitmentInterviews.id, id), isNotNull(companies.ifmCompanyId)))
    .limit(1);
  return row ?? null;
}

function serializeJob(row: typeof recruitmentJobs.$inferSelect, names: IfmNameMaps = {}) {
  return {
    id: row.id,
    company_id: row.companyId,
    title: row.title,
    headcount: row.headcount,
    salary_min: row.salaryMin,
    salary_max: row.salaryMax,
    job_content: row.jobContent,
    requirements: row.requirements,
    status: row.status,
    priority: row.priority,
    owner_id: row.ownerId,
    owner_name: row.ownerId ? names.employeeNames?.get(row.ownerId) ?? null : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function serializeJobsWithNames(rows: (typeof recruitmentJobs.$inferSelect)[]) {
  const employeeNames = await getEmployeeNameMap(rows.map((row) => row.ownerId));
  return rows.map((row) => serializeJob(row, { employeeNames }));
}

type IfmNameMaps = {
  employeeNames?: Map<string, string | null>;
  ifmUserNames?: Map<string, string | null>;
  jobTitles?: Map<string, string | null>;
  companyNames?: Map<string, string | null>;
  candidateNames?: Map<string, string | null>;
  companyIfmIds?: Map<string, string | null>;
};

function uniqueIds(ids: (string | null | undefined)[]) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

async function getEmployeeNameMap(ids: (string | null | undefined)[]) {
  const employeeIds = uniqueIds(ids);
  if (employeeIds.length === 0) return new Map<string, string | null>();

  const rows = await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, employeeIds));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function getIfmUserNameMap(ids: (string | null | undefined)[]) {
  const ifmUserIds = uniqueIds(ids);
  if (ifmUserIds.length === 0) return new Map<string, string | null>();

  const rows = await db
    .select({ ifmUserId: recruitmentIfmUserBindings.ifmUserId, ifmDisplayName: recruitmentIfmUserBindings.ifmDisplayName })
    .from(recruitmentIfmUserBindings)
    .where(inArray(recruitmentIfmUserBindings.ifmUserId, ifmUserIds));
  return new Map(rows.map((row) => [row.ifmUserId, row.ifmDisplayName || row.ifmUserId]));
}

function getIssuedByName(row: typeof recruitmentKpiTargets.$inferSelect, names: IfmNameMaps) {
  if (row.issuedBySource === "ifm" && row.issuedByIfmUser) {
    return names.ifmUserNames?.get(row.issuedByIfmUser) ?? row.issuedByIfmUser;
  }

  return row.issuedByEmployeeId ? names.employeeNames?.get(row.issuedByEmployeeId) ?? null : null;
}

async function getJobTitleMap(ids: (string | null | undefined)[]) {
  const jobIds = uniqueIds(ids);
  if (jobIds.length === 0) return new Map<string, string | null>();

  const rows = await db.select({ id: recruitmentJobs.id, title: recruitmentJobs.title }).from(recruitmentJobs).where(inArray(recruitmentJobs.id, jobIds));
  return new Map(rows.map((row) => [row.id, row.title]));
}

async function getCompanyNameMap(ids: (string | null | undefined)[]) {
  const companyIds = uniqueIds(ids);
  if (companyIds.length === 0) return new Map<string, string | null>();

  const rows = await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function getCandidateNameMap(ids: (string | null | undefined)[]) {
  const candidateIds = uniqueIds(ids);
  if (candidateIds.length === 0) return new Map<string, string | null>();

  const rows = await db
    .select({ id: recruitmentCandidates.id, name: recruitmentCandidates.name })
    .from(recruitmentCandidates)
    .where(inArray(recruitmentCandidates.id, candidateIds));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function getCompanyIfmIdMap(ids: (string | null | undefined)[]) {
  const companyIds = uniqueIds(ids);
  if (companyIds.length === 0) return new Map<string, string | null>();

  const rows = await db
    .select({ id: companies.id, ifmCompanyId: companies.ifmCompanyId })
    .from(companies)
    .where(inArray(companies.id, companyIds));
  return new Map(rows.map((row) => [row.id, row.ifmCompanyId]));
}

function serializeCampaign(row: typeof recruitmentCampaigns.$inferSelect, names: IfmNameMaps = {}) {
  return {
    id: row.id,
    company_id: row.companyId,
    company_name: names.companyNames?.get(row.companyId) ?? null,
    name: row.name,
    type: row.type,
    status: row.status,
    location: row.location,
    cost: row.cost == null ? null : Number(row.cost),
    planned_date: row.plannedDate,
    planned_start: row.plannedStart,
    planned_end: row.plannedEnd,
    actual_date: row.actualDate,
    owner_id: row.ownerId,
    owner_name: names.employeeNames?.get(row.ownerId) ?? null,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function serializeCampaignsWithNames(rows: (typeof recruitmentCampaigns.$inferSelect)[]) {
  const [employeeNames, companyNames] = await Promise.all([
    getEmployeeNameMap(rows.map((row) => row.ownerId)),
    getCompanyNameMap(rows.map((row) => row.companyId))
  ]);
  return rows.map((row) => serializeCampaign(row, { employeeNames, companyNames }));
}

function serializeInterview(row: typeof recruitmentInterviews.$inferSelect, names: IfmNameMaps = {}) {
  return {
    id: row.id,
    company_id: row.companyId,
    company_name: names.companyNames?.get(row.companyId) ?? null,
    ifm_company_id: names.companyIfmIds?.get(row.companyId) ?? null,
    candidate_id: row.candidateId,
    candidate_name: names.candidateNames?.get(row.candidateId) ?? null,
    scheduled_at: row.scheduledAt,
    interviewer_id: row.interviewerId,
    interviewer_name: row.interviewerId ? names.employeeNames?.get(row.interviewerId) ?? null : null,
    mode: row.mode,
    status: row.status,
    result: row.result,
    rating: row.rating,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function serializeInterviewsWithNames(rows: (typeof recruitmentInterviews.$inferSelect)[]) {
  const [employeeNames, candidateNames, companyNames, companyIfmIds] = await Promise.all([
    getEmployeeNameMap(rows.map((row) => row.interviewerId)),
    getCandidateNameMap(rows.map((row) => row.candidateId)),
    getCompanyNameMap(rows.map((row) => row.companyId)),
    getCompanyIfmIdMap(rows.map((row) => row.companyId))
  ]);
  return rows.map((row) => serializeInterview(row, { employeeNames, candidateNames, companyNames, companyIfmIds }));
}

function serializePosting(row: typeof recruitmentPostings.$inferSelect, names: IfmNameMaps = {}) {
  return {
    id: row.id,
    company_id: row.companyId,
    job_id: row.jobId,
    job_title: names.jobTitles?.get(row.jobId) ?? null,
    platform: row.platform,
    share_url: row.shareUrl,
    published_on: row.publishedOn,
    status: row.status,
    inquiry_count: row.inquiryCount,
    owner_id: row.ownerId,
    owner_name: names.employeeNames?.get(row.ownerId) ?? null,
    invite_clerk_name: row.inviteClerkId ? names.employeeNames?.get(row.inviteClerkId) ?? null : null,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function serializePostingsWithNames(rows: (typeof recruitmentPostings.$inferSelect)[]) {
  const [employeeNames, jobTitles] = await Promise.all([
    getEmployeeNameMap(rows.flatMap((row) => [row.ownerId, row.inviteClerkId])),
    getJobTitleMap(rows.map((row) => row.jobId))
  ]);
  return rows.map((row) => serializePosting(row, { employeeNames, jobTitles }));
}

function serializeCandidate(row: typeof recruitmentCandidates.$inferSelect, names: IfmNameMaps = {}) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    phone: row.phone,
    source_type: row.sourceType,
    intended_job_id: row.intendedJobId,
    intended_job_title: row.intendedJobId ? names.jobTitles?.get(row.intendedJobId) ?? null : null,
    status: row.status,
    nationality: row.nationality,
    ethnicity: row.ethnicity,
    age_band: row.ageBand,
    experience_level: row.experienceLevel,
    assigned_clerk_id: row.assignedClerkId,
    assigned_clerk_name: row.assignedClerkId ? names.employeeNames?.get(row.assignedClerkId) ?? null : null,
    last_contacted_at: row.lastContactedAt,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function serializeCandidatesWithNames(rows: (typeof recruitmentCandidates.$inferSelect)[]) {
  const [employeeNames, jobTitles] = await Promise.all([
    getEmployeeNameMap(rows.map((row) => row.assignedClerkId)),
    getJobTitleMap(rows.map((row) => row.intendedJobId))
  ]);
  return rows.map((row) => serializeCandidate(row, { employeeNames, jobTitles }));
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

function serializeGroupOwner(row: typeof recruitmentGroupOwners.$inferSelect, names: IfmNameMaps = {}) {
  return {
    id: row.id,
    company_id: row.companyId,
    platform: row.platform,
    group_name: row.groupName,
    owner_name: row.ownerName,
    owner_contact: row.ownerContact,
    group_url: row.groupUrl,
    member_count: row.memberCount,
    found_by: row.foundBy,
    found_by_name: names.employeeNames?.get(row.foundBy) ?? null,
    found_on: row.foundOn,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function serializeGroupOwnersWithNames(rows: (typeof recruitmentGroupOwners.$inferSelect)[]) {
  const employeeNames = await getEmployeeNameMap(rows.map((row) => row.foundBy));
  return rows.map((row) => serializeGroupOwner(row, { employeeNames }));
}

function serializeKpiTarget(row: typeof recruitmentKpiTargets.$inferSelect, actual?: number, names: IfmNameMaps = {}, date?: string) {
  const completionRate = actual === undefined || row.targetPerDay === 0 ? null : actual / row.targetPerDay;
  const baseDate = date ?? todayString();
  const window = kpiPeriodWindow(row.period, baseDate);
  return {
    id: row.id,
    company_id: row.companyId,
    company_name: names.companyNames?.get(row.companyId) ?? null,
    assignee_employee_id: row.assigneeEmployeeId,
    assignee_name: names.employeeNames?.get(row.assigneeEmployeeId) ?? null,
    metric: row.metric,
    platform: row.platform,
    // v1.6: period 周期粒度；target_per_day 字段名保留兼容，语义=每周期目标数(=target_count)
    period: row.period,
    target_count: row.targetPerDay,
    period_start: window.start,
    period_end: window.end,
    period_days_left: kpiPeriodDaysLeft(row.period, baseDate),
    target_per_day: row.targetPerDay,
    effective_from: row.effectiveFrom,
    effective_to: row.effectiveTo,
    issued_by_source: row.issuedBySource,
    issued_by_ifm_user: row.issuedByIfmUser,
    issued_by_employee_id: row.issuedByEmployeeId,
    issued_by_name: getIssuedByName(row, names),
    note: row.note,
    active: row.active,
    actual,
    completion_rate: completionRate,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

async function getKpiTargetNameMaps(rows: (typeof recruitmentKpiTargets.$inferSelect)[]) {
  const [employeeNames, companyNames, ifmUserNames] = await Promise.all([
    getEmployeeNameMap(rows.flatMap((row) => [row.assigneeEmployeeId, row.issuedByEmployeeId])),
    getCompanyNameMap(rows.map((row) => row.companyId)),
    getIfmUserNameMap(rows.map((row) => row.issuedByIfmUser))
  ]);
  return { employeeNames, companyNames, ifmUserNames };
}

async function serializeKpiTargetsWithNames(rows: (typeof recruitmentKpiTargets.$inferSelect)[]) {
  const names = await getKpiTargetNameMaps(rows);
  return rows.map((row) => serializeKpiTarget(row, undefined, names));
}

async function serializeKpiTargetsWithActual(rows: (typeof recruitmentKpiTargets.$inferSelect)[], date: string) {
  const names = await getKpiTargetNameMaps(rows);
  return Promise.all(
    rows.map(async (row) => {
      const actual = await computeKpiActualForPeriod(row, date);
      return serializeKpiTarget(row, actual, names, date);
    })
  );
}

async function listByCompany<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  table: any,
  companyColumn: any,
  orderColumn: any,
  serialize: (row: T) => unknown,
  key: string,
  enrich?: (rows: T[]) => Promise<unknown[]>
) {
  const { ifmCompanyId } = parseWithSchema(ifmCompanyParamsSchema, request.params);
  const query = parseWithSchema(paginationQuerySchema, request.query);
  const company = await resolveIfmCompany(ifmCompanyId);
  if (!company) return sendNotFound(reply);
  const rows = await db
    .select()
    .from(table)
    .where(eq(companyColumn, company.id))
    .orderBy(desc(orderColumn))
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0);
  const typedRows = rows as T[];
  const resources = enrich ? await enrich(typedRows) : typedRows.map((row) => serialize(row));
  return { [key]: resources, limit: query.limit ?? 50, offset: query.offset ?? 0 };
}

export async function registerExternalIfmRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", bridgeAuthenticate);

  app.get("/external/ifm/overview", async (request) => {
    const query = parseWithSchema(rangeQuerySchema, request.query);
    const boundCompanies = await db.select().from(companies).where(isNotNull(companies.ifmCompanyId)).orderBy(asc(companies.name));

    const overview = await Promise.all(
      boundCompanies.map(async (company) => {
        const [jobsOpen, postings, contacts, newGroupOwners, funnelRows] = await Promise.all([
          db.select({ total: count() }).from(recruitmentJobs).where(and(eq(recruitmentJobs.companyId, company.id), eq(recruitmentJobs.status, "open"))),
          db
            .select({ total: count() })
            .from(recruitmentPostings)
            .where(and(eq(recruitmentPostings.companyId, company.id), ...rangeFilters(query.from, query.to, recruitmentPostings.publishedOn))),
          db
            .select({ total: count() })
            .from(recruitmentFollowups)
            .where(and(eq(recruitmentFollowups.companyId, company.id), ...timestampRangeFilters(query.from, query.to, recruitmentFollowups.contactedAt))),
          db
            .select({ total: count() })
            .from(recruitmentGroupOwners)
            .where(and(eq(recruitmentGroupOwners.companyId, company.id), ...rangeFilters(query.from, query.to, recruitmentGroupOwners.foundOn))),
          db
            .select({ status: recruitmentCandidates.status, total: count() })
            .from(recruitmentCandidates)
            .where(eq(recruitmentCandidates.companyId, company.id))
            .groupBy(recruitmentCandidates.status)
        ]);
        const candidateFunnel = Object.fromEntries(funnelRows.map((row) => [row.status, row.total]));

        return {
          ifmCompanyId: company.ifmCompanyId,
          bhCompanyId: company.id,
          name: company.name,
          jobsOpen: jobsOpen[0]?.total ?? 0,
          postings: postings[0]?.total ?? 0,
          contacts: contacts[0]?.total ?? 0,
          newGroupOwners: newGroupOwners[0]?.total ?? 0,
          candidateFunnel
        };
      })
    );

    return { overview };
  });

  app.get("/external/ifm/companies/:ifmCompanyId/dashboard", async (request, reply) => {
    const { ifmCompanyId } = parseWithSchema(ifmCompanyParamsSchema, request.params);
    const query = parseWithSchema(rangeQuerySchema, request.query);
    const company = await resolveIfmCompany(ifmCompanyId);
    if (!company) return sendNotFound(reply);
    const completionDate = query.to ?? todayString();

    const [postingsByPlatformByDay, contactsByDay, groupOwnersByPlatformByDay, kpiTargets] = await Promise.all([
      db
        .select({ day: recruitmentPostings.publishedOn, platform: recruitmentPostings.platform, total: count() })
        .from(recruitmentPostings)
        .where(and(eq(recruitmentPostings.companyId, company.id), ...rangeFilters(query.from, query.to, recruitmentPostings.publishedOn)))
        .groupBy(recruitmentPostings.publishedOn, recruitmentPostings.platform)
        .orderBy(asc(recruitmentPostings.publishedOn), asc(recruitmentPostings.platform)),
      db
        .select({ day: sql<string>`date(${recruitmentFollowups.contactedAt})`, total: count() })
        .from(recruitmentFollowups)
        .where(and(eq(recruitmentFollowups.companyId, company.id), ...timestampRangeFilters(query.from, query.to, recruitmentFollowups.contactedAt)))
        .groupBy(sql`date(${recruitmentFollowups.contactedAt})`)
        .orderBy(sql`date(${recruitmentFollowups.contactedAt})`),
      db
        .select({ day: recruitmentGroupOwners.foundOn, platform: recruitmentGroupOwners.platform, total: count() })
        .from(recruitmentGroupOwners)
        .where(and(eq(recruitmentGroupOwners.companyId, company.id), ...rangeFilters(query.from, query.to, recruitmentGroupOwners.foundOn)))
        .groupBy(recruitmentGroupOwners.foundOn, recruitmentGroupOwners.platform)
        .orderBy(asc(recruitmentGroupOwners.foundOn), asc(recruitmentGroupOwners.platform)),
      db
        .select()
        .from(recruitmentKpiTargets)
        .where(and(eq(recruitmentKpiTargets.companyId, company.id), eq(recruitmentKpiTargets.active, true)))
        .orderBy(desc(recruitmentKpiTargets.createdAt))
    ]);

    return {
      company: { ifmCompanyId: company.ifmCompanyId, bhCompanyId: company.id, name: company.name },
      postingsByPlatformByDay,
      contactsByDay,
      groupOwnersByPlatformByDay,
      kpiTargets: await serializeKpiTargetsWithActual(kpiTargets, completionDate),
      completionDate
    };
  });

  app.get("/external/ifm/companies/:ifmCompanyId/jobs", async (request, reply) =>
    listByCompany(request, reply, recruitmentJobs, recruitmentJobs.companyId, recruitmentJobs.createdAt, serializeJob, "jobs", serializeJobsWithNames)
  );
  app.get("/external/ifm/companies/:ifmCompanyId/postings", async (request, reply) =>
    listByCompany(
      request,
      reply,
      recruitmentPostings,
      recruitmentPostings.companyId,
      recruitmentPostings.createdAt,
      serializePosting,
      "postings",
      serializePostingsWithNames
    )
  );
  app.get("/external/ifm/companies/:ifmCompanyId/candidates", async (request, reply) =>
    listByCompany(
      request,
      reply,
      recruitmentCandidates,
      recruitmentCandidates.companyId,
      recruitmentCandidates.createdAt,
      serializeCandidate,
      "candidates",
      serializeCandidatesWithNames
    )
  );
  app.get("/external/ifm/companies/:ifmCompanyId/group-owners", async (request, reply) =>
    listByCompany(
      request,
      reply,
      recruitmentGroupOwners,
      recruitmentGroupOwners.companyId,
      recruitmentGroupOwners.createdAt,
      serializeGroupOwner,
      "groupOwners",
      serializeGroupOwnersWithNames
    )
  );
  app.get("/external/ifm/companies/:ifmCompanyId/kpi-targets", async (request, reply) =>
    listByCompany(
      request,
      reply,
      recruitmentKpiTargets,
      recruitmentKpiTargets.companyId,
      recruitmentKpiTargets.createdAt,
      serializeKpiTarget,
      "kpiTargets",
      (rows) => serializeKpiTargetsWithActual(rows, todayString())
    )
  );

  app.get("/external/ifm/assignees", async () => {
    const assignees = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.status, "active"))
      .orderBy(asc(employees.name));
    return { assignees };
  });

  app.get("/external/ifm/my-kpi", async (request, reply) => {
    const actor = getActor(request);
    if (!actor.employeeId) return reply.code(403).send({ error: "forbidden" });
    const query = parseWithSchema(myKpiQuerySchema, request.query);
    const date = query.date ?? todayString();
    const rows = await db
      .select()
      .from(recruitmentKpiTargets)
      .where(
        and(
          eq(recruitmentKpiTargets.assigneeEmployeeId, actor.employeeId),
          eq(recruitmentKpiTargets.active, true),
          lte(recruitmentKpiTargets.effectiveFrom, date),
          or(isNull(recruitmentKpiTargets.effectiveTo), gte(recruitmentKpiTargets.effectiveTo, date))
        )
      )
      .orderBy(desc(recruitmentKpiTargets.createdAt));
    const kpiTargets = await serializeKpiTargetsWithActual(rows, date);
    return { date, kpiTargets };
  });

  app.post("/external/ifm/companies-sync", async (request, reply) => {
    const body = parseWithSchema(companiesSyncSchema, request.body);
    const ids = body.companies.map((company) => company.id);
    await db.transaction(async (tx) => {
      for (const company of body.companies) {
        await tx
          .insert(ifmCompaniesCache)
          .values({ ifmCompanyId: company.id, name: company.name, active: company.active ?? true, syncedAt: new Date() })
          .onConflictDoUpdate({
            target: ifmCompaniesCache.ifmCompanyId,
            set: { name: company.name, active: company.active ?? true, syncedAt: new Date() }
          });
      }
      await tx
        .update(ifmCompaniesCache)
        .set({ active: false, syncedAt: new Date() })
        .where(ids.length ? notInArray(ifmCompaniesCache.ifmCompanyId, ids) : sql`true`);
    });
    return reply.code(201).send({ synced: body.companies.length });
  });

  app.post("/external/ifm/kpi-targets", async (request, reply) => {
    if (!requireManager(request, reply)) return;
    const body = parseWithSchema(kpiCreateSchema, request.body);
    const [company, assignee] = await Promise.all([resolveIfmCompany(body.ifmCompanyId), ensureActiveEmployee(body.assigneeEmployeeId)]);
    if (!company) return sendNotFound(reply);
    if (!assignee) return reply.code(400).send({ error: "invalid_assignee" });
    const actor = getActor(request);
    const [target] = await db
      .insert(recruitmentKpiTargets)
      .values({
        companyId: company.id,
        assigneeEmployeeId: body.assigneeEmployeeId,
        metric: body.metric,
        platform: body.platform,
        period: body.period,
        targetPerDay: body.targetPerDay,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo,
        active: body.active,
        note: body.note,
        issuedBySource: "ifm",
        issuedByIfmUser: actor.ifmUserId,
        issuedByEmployeeId: actor.employeeId
      })
      .returning();
    const [resource] = await serializeKpiTargetsWithNames([mustReturn(target)]);
    return reply.code(201).send({ kpiTarget: resource });
  });

  app.patch("/external/ifm/kpi-targets/:id", async (request, reply) => {
    if (!requireManager(request, reply)) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(kpiPatchSchema, request.body);
    const [existing] = await db.select().from(recruitmentKpiTargets).where(eq(recruitmentKpiTargets.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    const update: Partial<typeof recruitmentKpiTargets.$inferInsert> = { updatedAt: new Date() };
    if (body.period !== undefined) update.period = body.period;
    if (body.targetPerDay !== undefined) update.targetPerDay = body.targetPerDay;
    if (hasOwn(body, "effectiveTo")) update.effectiveTo = body.effectiveTo;
    if (body.active !== undefined) update.active = body.active;
    if (hasOwn(body, "note")) update.note = body.note;
    if (hasOwn(body, "platform")) update.platform = body.platform;
    const [target] = await db.update(recruitmentKpiTargets).set(update).where(eq(recruitmentKpiTargets.id, id)).returning();
    const [resource] = await serializeKpiTargetsWithNames([mustReturn(target)]);
    return { kpiTarget: resource };
  });

  app.post("/external/ifm/jobs", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const body = parseWithSchema(jobCreateSchema, request.body);
    const company = await resolveIfmCompany(body.ifmCompanyId);
    if (!company) return sendNotFound(reply);
    const [job] = await db
      .insert(recruitmentJobs)
      .values({
        companyId: company.id,
        title: body.title,
        headcount: body.headcount,
        salaryMin: body.salaryMin,
        salaryMax: body.salaryMax,
        jobContent: body.jobContent,
        requirements: body.requirements,
        status: body.status,
        priority: body.priority,
        ownerId: employeeId
      })
      .returning();
    const [resource] = await serializeJobsWithNames([mustReturn(job)]);
    return reply.code(201).send({ job: resource });
  });

  app.patch("/external/ifm/jobs/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(jobPatchSchema, request.body);
    const existing = await ensureBoundRecruitmentJob(id);
    if (!existing) return sendNotFound(reply);
    const update: Partial<typeof recruitmentJobs.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) update.title = body.title;
    if (body.headcount !== undefined) update.headcount = body.headcount;
    if (hasOwn(body, "salaryMin")) update.salaryMin = body.salaryMin;
    if (hasOwn(body, "salaryMax")) update.salaryMax = body.salaryMax;
    if (hasOwn(body, "jobContent")) update.jobContent = body.jobContent;
    if (hasOwn(body, "requirements")) update.requirements = body.requirements;
    if (body.status !== undefined) update.status = body.status;
    if (body.priority !== undefined) update.priority = body.priority;
    const [job] = await db.update(recruitmentJobs).set(update).where(eq(recruitmentJobs.id, id)).returning();
    const [resource] = await serializeJobsWithNames([mustReturn(job)]);
    return { job: resource };
  });

  app.post("/external/ifm/postings", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const body = parseWithSchema(postingCreateSchema, request.body);
    const company = await resolveIfmCompany(body.ifmCompanyId);
    if (!company) return sendNotFound(reply);
    if (!(await ensureCompanyJob(company.id, body.jobId))) return sendNotFound(reply);
    const [posting] = await db
      .insert(recruitmentPostings)
      .values({
        companyId: company.id,
        jobId: body.jobId,
        platform: body.platform,
        publishedOn: body.publishedOn,
        shareUrl: body.shareUrl,
        notes: body.notes,
        ownerId: employeeId
      })
      .returning();
    const [resource] = await serializePostingsWithNames([mustReturn(posting)]);
    return reply.code(201).send({ posting: resource });
  });

  app.patch("/external/ifm/postings/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(postingPatchSchema, request.body);
    const existing = await ensureBoundRecruitmentPosting(id);
    if (!existing) return sendNotFound(reply);
    const update: Partial<typeof recruitmentPostings.$inferInsert> = { updatedAt: new Date() };
    if (body.platform !== undefined) update.platform = body.platform;
    if (body.publishedOn !== undefined) update.publishedOn = body.publishedOn;
    if (hasOwn(body, "shareUrl")) update.shareUrl = body.shareUrl;
    if (hasOwn(body, "notes")) update.notes = body.notes;
    if (body.status !== undefined) update.status = body.status;
    if (body.inquiryCount !== undefined) update.inquiryCount = body.inquiryCount;
    const [posting] = await db.update(recruitmentPostings).set(update).where(eq(recruitmentPostings.id, id)).returning();
    const [resource] = await serializePostingsWithNames([mustReturn(posting)]);
    return { posting: resource };
  });

  app.delete("/external/ifm/postings/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const existing = await ensureBoundRecruitmentPosting(id);
    if (!existing) return sendNotFound(reply);
    await db.delete(recruitmentPostings).where(eq(recruitmentPostings.id, id));
    return reply.code(204).send();
  });

  app.post("/external/ifm/candidates", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const body = parseWithSchema(candidateCreateSchema, request.body);
    const company = await resolveIfmCompany(body.ifmCompanyId);
    if (!company) return sendNotFound(reply);
    if (body.intendedJobId && !(await ensureCompanyJob(company.id, body.intendedJobId))) return sendNotFound(reply);
    const [candidate] = await db
      .insert(recruitmentCandidates)
      .values({
        companyId: company.id,
        name: body.name,
        phone: body.phone,
        sourceType: body.sourceType,
        intendedJobId: body.intendedJobId,
        assignedClerkId: employeeId,
        notes: body.notes
      })
      .returning();
    const [resource] = await serializeCandidatesWithNames([mustReturn(candidate)]);
    return reply.code(201).send({ candidate: resource });
  });

  app.patch("/external/ifm/candidates/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(candidatePatchSchema, request.body);
    const existing = await ensureBoundRecruitmentCandidate(id);
    if (!existing) return sendNotFound(reply);
    if (body.intendedJobId && !(await ensureCompanyJob(existing.companyId, body.intendedJobId))) return sendNotFound(reply);
    const update: Partial<typeof recruitmentCandidates.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.phone !== undefined) update.phone = body.phone;
    if (hasOwn(body, "nationality")) update.nationality = body.nationality;
    if (hasOwn(body, "notes")) update.notes = body.notes;
    if (body.status !== undefined) update.status = body.status;
    if (hasOwn(body, "intendedJobId")) update.intendedJobId = body.intendedJobId;
    if (hasOwn(body, "ethnicity")) update.ethnicity = body.ethnicity;
    if (hasOwn(body, "ageBand")) update.ageBand = body.ageBand;
    if (hasOwn(body, "experienceLevel")) update.experienceLevel = body.experienceLevel;
    const [candidate] = await db.update(recruitmentCandidates).set(update).where(eq(recruitmentCandidates.id, id)).returning();
    const [resource] = await serializeCandidatesWithNames([mustReturn(candidate)]);
    return { candidate: resource };
  });

  app.get("/external/ifm/candidates/:id/followups", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(paginationQuerySchema, request.query);
    const existing = await ensureBoundRecruitmentCandidate(id);
    if (!existing) return sendNotFound(reply);
    const rows = await db
      .select()
      .from(recruitmentFollowups)
      .where(eq(recruitmentFollowups.candidateId, id))
      .orderBy(desc(recruitmentFollowups.contactedAt))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
    const employeeNames = await getEmployeeNameMap(rows.map((row) => row.byEmployeeId));
    const followups = rows.map((row) => ({
      id: row.id,
      type: row.type,
      note: row.note,
      contacted_at: row.contactedAt,
      by_employee_id: row.byEmployeeId,
      by_employee_name: employeeNames.get(row.byEmployeeId) ?? null,
      created_at: row.createdAt
    }));
    return { followups, limit: query.limit ?? 50, offset: query.offset ?? 0 };
  });

  app.post("/external/ifm/candidates/:id/followups", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(followupCreateSchema, request.body);
    const [candidate] = await db
      .select({
        id: recruitmentCandidates.id,
        companyId: recruitmentCandidates.companyId,
        ifmCompanyId: companies.ifmCompanyId
      })
      .from(recruitmentCandidates)
      .innerJoin(companies, eq(recruitmentCandidates.companyId, companies.id))
      .where(and(eq(recruitmentCandidates.id, id), isNotNull(companies.ifmCompanyId)))
      .limit(1);
    if (!candidate) return sendNotFound(reply);
    const contactedAt = body.contactedAt ? new Date(body.contactedAt) : new Date();
    const [followup] = await db
      .insert(recruitmentFollowups)
      .values({
        companyId: candidate.companyId,
        candidateId: id,
        byEmployeeId: employeeId,
        type: mapFollowupType(body.type),
        note: body.note,
        contactedAt
      })
      .returning();
    await db.update(recruitmentCandidates).set({ lastContactedAt: contactedAt, updatedAt: new Date() }).where(eq(recruitmentCandidates.id, id));
    const resource = serializeFollowup(mustReturn(followup));
    return reply.code(201).send({ followup: resource });
  });

  app.post("/external/ifm/group-owners", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const body = parseWithSchema(groupOwnerCreateSchema, request.body);
    const company = await resolveIfmCompany(body.ifmCompanyId);
    if (!company) return sendNotFound(reply);
    const [groupOwner] = await db
      .insert(recruitmentGroupOwners)
      .values({
        companyId: company.id,
        platform: body.platform,
        groupName: body.groupName,
        ownerName: body.ownerName,
        ownerContact: body.ownerContact,
        groupUrl: body.groupUrl,
        memberCount: body.memberCount,
        foundOn: body.foundOn ?? todayString(),
        foundBy: employeeId,
        notes: body.notes
      })
      .returning();
    const [resource] = await serializeGroupOwnersWithNames([mustReturn(groupOwner)]);
    return reply.code(201).send({ groupOwner: resource });
  });

  app.patch("/external/ifm/group-owners/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(groupOwnerPatchSchema, request.body);
    const existing = await ensureBoundRecruitmentGroupOwner(id);
    if (!existing) return sendNotFound(reply);
    const update: Partial<typeof recruitmentGroupOwners.$inferInsert> = { updatedAt: new Date() };
    if (body.platform !== undefined) update.platform = body.platform;
    if (body.groupName !== undefined) update.groupName = body.groupName;
    if (hasOwn(body, "ownerName")) update.ownerName = body.ownerName;
    if (hasOwn(body, "ownerContact")) update.ownerContact = body.ownerContact;
    if (hasOwn(body, "groupUrl")) update.groupUrl = body.groupUrl;
    if (hasOwn(body, "memberCount")) update.memberCount = body.memberCount;
    if (body.foundOn !== undefined) update.foundOn = body.foundOn;
    if (hasOwn(body, "notes")) update.notes = body.notes;
    const [groupOwner] = await db.update(recruitmentGroupOwners).set(update).where(eq(recruitmentGroupOwners.id, id)).returning();
    const [resource] = await serializeGroupOwnersWithNames([mustReturn(groupOwner)]);
    return { groupOwner: resource };
  });

  app.delete("/external/ifm/group-owners/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const existing = await ensureBoundRecruitmentGroupOwner(id);
    if (!existing) return sendNotFound(reply);
    await db.delete(recruitmentGroupOwners).where(eq(recruitmentGroupOwners.id, id));
    return reply.code(204).send();
  });

  app.get("/external/ifm/companies/:ifmCompanyId/campaigns", async (request, reply) =>
    listByCompany(
      request,
      reply,
      recruitmentCampaigns,
      recruitmentCampaigns.companyId,
      recruitmentCampaigns.createdAt,
      serializeCampaign,
      "campaigns",
      serializeCampaignsWithNames
    )
  );

  app.post("/external/ifm/campaigns", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const body = parseWithSchema(campaignCreateSchema, request.body);
    const company = await resolveIfmCompany(body.ifmCompanyId);
    if (!company) return sendNotFound(reply);
    const [campaign] = await db
      .insert(recruitmentCampaigns)
      .values({
        companyId: company.id,
        name: body.name,
        type: body.type,
        location: body.location,
        plannedDate: body.plannedDate,
        plannedStart: body.plannedStart,
        plannedEnd: body.plannedEnd,
        cost: body.cost == null ? null : String(body.cost),
        notes: body.notes,
        ownerId: employeeId
      })
      .returning();
    const [resource] = await serializeCampaignsWithNames([mustReturn(campaign)]);
    return reply.code(201).send({ campaign: resource });
  });

  app.patch("/external/ifm/campaigns/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(campaignPatchSchema, request.body);
    const existing = await ensureBoundRecruitmentCampaign(id);
    if (!existing) return sendNotFound(reply);
    const update: Partial<typeof recruitmentCampaigns.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.type !== undefined) update.type = body.type;
    if (body.location !== undefined) update.location = body.location;
    if (body.plannedDate !== undefined) update.plannedDate = body.plannedDate;
    if (body.plannedStart !== undefined) update.plannedStart = body.plannedStart;
    if (body.plannedEnd !== undefined) update.plannedEnd = body.plannedEnd;
    if (hasOwn(body, "cost")) update.cost = body.cost == null ? null : String(body.cost);
    if (hasOwn(body, "notes")) update.notes = body.notes;
    if (body.status !== undefined) update.status = body.status;
    if (hasOwn(body, "actualDate")) update.actualDate = body.actualDate;
    const [campaign] = await db.update(recruitmentCampaigns).set(update).where(eq(recruitmentCampaigns.id, id)).returning();
    const [resource] = await serializeCampaignsWithNames([mustReturn(campaign)]);
    return { campaign: resource };
  });

  app.get("/external/ifm/companies/:ifmCompanyId/interviews", async (request, reply) =>
    listByCompany(
      request,
      reply,
      recruitmentInterviews,
      recruitmentInterviews.companyId,
      recruitmentInterviews.scheduledAt,
      serializeInterview,
      "interviews",
      serializeInterviewsWithNames
    )
  );

  app.get("/external/ifm/interviews", async (request) => {
    const query = parseWithSchema(interviewListQuerySchema, request.query);
    const from = query.from ?? todayString();
    const filters: SQL[] = [
      isNotNull(companies.ifmCompanyId),
      gte(recruitmentInterviews.scheduledAt, new Date(`${from}T00:00:00.000`))
    ];
    if (query.to) filters.push(lte(recruitmentInterviews.scheduledAt, endOfDate(query.to)));
    const rows = await db
      .select({ interview: recruitmentInterviews })
      .from(recruitmentInterviews)
      .innerJoin(companies, eq(recruitmentInterviews.companyId, companies.id))
      .where(and(...filters))
      .orderBy(asc(recruitmentInterviews.scheduledAt))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
    const interviews = await serializeInterviewsWithNames(rows.map((row) => row.interview));
    return { interviews, limit: query.limit ?? 50, offset: query.offset ?? 0 };
  });

  app.post("/external/ifm/interviews", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const body = parseWithSchema(interviewCreateSchema, request.body);
    const candidateRow = await ensureBoundRecruitmentCandidate(body.candidateId);
    if (!candidateRow) return sendNotFound(reply);
    const interviewerId = body.interviewerId ?? employeeId;
    if (!(await ensureActiveEmployee(interviewerId))) return sendNotFound(reply);
    const [interview] = await db
      .insert(recruitmentInterviews)
      .values({
        companyId: candidateRow.companyId,
        candidateId: body.candidateId,
        scheduledAt: new Date(body.scheduledAt),
        interviewerId,
        mode: body.mode,
        notes: body.notes
      })
      .returning();
    // BR-031: 与内部路由 /recruitment/interviews 保持一致——约面试后把候选人推到 interview_scheduled，
    // 否则 bh 自己建的面试会推进、IFM 经桥建的不会，两条路径行为分叉
    await db
      .update(recruitmentCandidates)
      .set({ status: "interview_scheduled", updatedAt: new Date() })
      .where(eq(recruitmentCandidates.id, body.candidateId));
    const [resource] = await serializeInterviewsWithNames([mustReturn(interview)]);
    return reply.code(201).send({ interview: resource });
  });

  app.patch("/external/ifm/interviews/:id", async (request, reply) => {
    const employeeId = requireOperatorEmployee(request, reply);
    if (!employeeId) return;
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(interviewPatchSchema, request.body);
    const existing = await ensureBoundRecruitmentInterview(id);
    if (!existing) return sendNotFound(reply);
    if (body.interviewerId && !(await ensureActiveEmployee(body.interviewerId))) return sendNotFound(reply);
    const update: Partial<typeof recruitmentInterviews.$inferInsert> = { updatedAt: new Date() };
    if (body.scheduledAt !== undefined) update.scheduledAt = new Date(body.scheduledAt);
    if (body.mode !== undefined) update.mode = body.mode;
    if (hasOwn(body, "interviewerId")) update.interviewerId = body.interviewerId;
    if (body.status !== undefined) update.status = body.status;
    if (body.result !== undefined) update.result = body.result;
    if (hasOwn(body, "rating")) update.rating = body.rating;
    if (hasOwn(body, "notes")) update.notes = body.notes;
    const [interview] = await db.update(recruitmentInterviews).set(update).where(eq(recruitmentInterviews.id, id)).returning();
    const [resource] = await serializeInterviewsWithNames([mustReturn(interview)]);
    return { interview: resource };
  });

  app.get("/external/ifm/operator-comparison", async (request, reply) => {
    const query = parseWithSchema(comparisonQuerySchema, request.query);
    const to = query.to ?? todayString();
    const from = query.from ?? shiftDate(to, -6);
    if (from > to) return reply.code(400).send({ error: "invalid_range" });
    if (enumerateDays(from, to).length > 62) return reply.code(400).send({ error: "range_too_large" });
    return buildOperatorComparison(from, to);
  });
}

export function operatorComparisonRange(from?: string, to?: string) {
  const rangeTo = to ?? todayString();
  const rangeFrom = from ?? shiftDate(rangeTo, -6);
  if (rangeFrom > rangeTo) return null;
  if (enumerateDays(rangeFrom, rangeTo).length > 62) return null;
  return { from: rangeFrom, to: rangeTo };
}

export async function buildOperatorComparison(from: string, to: string) {
  {
    const operators = await db
      .select({
        employeeId: recruitmentIfmUserBindings.employeeId,
        ifmDisplayName: recruitmentIfmUserBindings.ifmDisplayName,
        name: employees.name
      })
      .from(recruitmentIfmUserBindings)
      .innerJoin(employees, eq(recruitmentIfmUserBindings.employeeId, employees.id))
      .where(and(eq(recruitmentIfmUserBindings.bridgeRole, "operator"), eq(recruitmentIfmUserBindings.active, true)));
    const opIds = operators.map((op) => op.employeeId).filter((id): id is string => Boolean(id));
    if (opIds.length === 0) return { from, to, operators: [] };

    const fromStart = new Date(`${from}T00:00:00.000`);
    const toEnd = endOfDate(to);

    const postingRows = await db
      .select({
        employeeId: recruitmentPostings.ownerId,
        day: recruitmentPostings.publishedOn,
        platform: recruitmentPostings.platform,
        total: count()
      })
      .from(recruitmentPostings)
      .where(and(inArray(recruitmentPostings.ownerId, opIds), gte(recruitmentPostings.publishedOn, from), lte(recruitmentPostings.publishedOn, to)))
      .groupBy(recruitmentPostings.ownerId, recruitmentPostings.publishedOn, recruitmentPostings.platform);

    const followupRows = await db
      .select({
        employeeId: recruitmentFollowups.byEmployeeId,
        day: sql<string>`date(${recruitmentFollowups.contactedAt})::text`,
        total: count()
      })
      .from(recruitmentFollowups)
      .where(
        and(
          inArray(recruitmentFollowups.byEmployeeId, opIds),
          sql`date(${recruitmentFollowups.contactedAt}) >= ${from}`,
          sql`date(${recruitmentFollowups.contactedAt}) <= ${to}`
        )
      )
      .groupBy(recruitmentFollowups.byEmployeeId, sql`date(${recruitmentFollowups.contactedAt})`);

    const groupOwnerRows = await db
      .select({ employeeId: recruitmentGroupOwners.foundBy, day: recruitmentGroupOwners.foundOn, total: count() })
      .from(recruitmentGroupOwners)
      .where(and(inArray(recruitmentGroupOwners.foundBy, opIds), gte(recruitmentGroupOwners.foundOn, from), lte(recruitmentGroupOwners.foundOn, to)))
      .groupBy(recruitmentGroupOwners.foundBy, recruitmentGroupOwners.foundOn);

    const interviewRows = await db
      .select({
        interviewerId: recruitmentInterviews.interviewerId,
        candidateId: recruitmentInterviews.candidateId,
        status: recruitmentInterviews.status,
        result: recruitmentInterviews.result,
        createdAt: recruitmentInterviews.createdAt,
        scheduledAt: recruitmentInterviews.scheduledAt
      })
      .from(recruitmentInterviews)
      .where(
        and(
          inArray(recruitmentInterviews.interviewerId, opIds),
          or(
            and(gte(recruitmentInterviews.createdAt, fromStart), lte(recruitmentInterviews.createdAt, toEnd)),
            and(gte(recruitmentInterviews.scheduledAt, fromStart), lte(recruitmentInterviews.scheduledAt, toEnd))
          )
        )
      );

    const candidateRows = await db
      .select({ id: recruitmentCandidates.id, assignedClerkId: recruitmentCandidates.assignedClerkId, status: recruitmentCandidates.status })
      .from(recruitmentCandidates)
      .where(
        and(
          inArray(recruitmentCandidates.assignedClerkId, opIds),
          gte(recruitmentCandidates.createdAt, fromStart),
          lte(recruitmentCandidates.createdAt, toEnd)
        )
      );

    const interviewedCandidateIds = new Set<string>();
    const candidateIds = candidateRows.map((row) => row.id);
    if (candidateIds.length > 0) {
      const rows = await db
        .selectDistinct({ candidateId: recruitmentInterviews.candidateId })
        .from(recruitmentInterviews)
        .where(inArray(recruitmentInterviews.candidateId, candidateIds));
      rows.forEach((row) => interviewedCandidateIds.add(row.candidateId));
    }

    const targets = await db
      .select()
      .from(recruitmentKpiTargets)
      .where(
        and(
          inArray(recruitmentKpiTargets.assigneeEmployeeId, opIds),
          eq(recruitmentKpiTargets.active, true),
          lte(recruitmentKpiTargets.effectiveFrom, to),
          or(isNull(recruitmentKpiTargets.effectiveTo), gte(recruitmentKpiTargets.effectiveTo, from))
        )
      );

    const postingByDay = new Map<string, number>();
    const postingByDayPlatform = new Map<string, number>();
    for (const row of postingRows) {
      const dayKey = `${row.employeeId}|${row.day}`;
      postingByDay.set(dayKey, (postingByDay.get(dayKey) ?? 0) + row.total);
      postingByDayPlatform.set(`${dayKey}|${row.platform}`, row.total);
    }
    const followupByDay = new Map(followupRows.map((row) => [`${row.employeeId}|${row.day}`, row.total]));
    const groupOwnerByDay = new Map(groupOwnerRows.map((row) => [`${row.employeeId}|${row.day}`, row.total]));

    const result = operators
      .filter((op) => op.employeeId)
      .map((op) => {
        const id = op.employeeId as string;
        const myPostingDays = postingRows.filter((row) => row.employeeId === id);
        const myFollowupDays = followupRows.filter((row) => row.employeeId === id);
        const myGroupOwnerDays = groupOwnerRows.filter((row) => row.employeeId === id);
        const myInterviews = interviewRows.filter((row) => row.interviewerId === id);
        const myCandidates = candidateRows.filter((row) => row.assignedClerkId === id);

        const postings = myPostingDays.reduce((sum, row) => sum + row.total, 0);
        const contacts = myFollowupDays.reduce((sum, row) => sum + row.total, 0);
        const newGroupOwners = myGroupOwnerDays.reduce((sum, row) => sum + row.total, 0);
        const interviewsCreated = myInterviews.filter(
          (row) => row.createdAt >= fromStart && row.createdAt <= toEnd
        ).length;

        // v1.6: 按 target.period 分周期判定（daily=逐天,与旧口径一致）；
        // 跨查询边界/效期的不完整周期,目标按覆盖天数占比折算,避免半个周期被判不达标
        let targetDays = 0;
        let metDays = 0;
        let completionSum = 0;
        const dayActual = (day: string, target: (typeof targets)[number]) => {
          if (target.metric === "daily_posts") {
            return target.platform
              ? postingByDayPlatform.get(`${id}|${day}|${target.platform}`) ?? 0
              : postingByDay.get(`${id}|${day}`) ?? 0;
          }
          if (target.metric === "daily_contacts") return followupByDay.get(`${id}|${day}`) ?? 0;
          return groupOwnerByDay.get(`${id}|${day}`) ?? 0;
        };
        for (const target of targets.filter((t) => t.assigneeEmployeeId === id)) {
          for (const window of enumerateKpiPeriodWindows(target.period, from, to)) {
            const overlapStart = [window.start, from, target.effectiveFrom].reduce((a, b) => (a > b ? a : b));
            const overlapEndCandidates = [window.end, to, ...(target.effectiveTo ? [target.effectiveTo] : [])];
            const overlapEnd = overlapEndCandidates.reduce((a, b) => (a < b ? a : b));
            if (overlapStart > overlapEnd) continue;
            let actual = 0;
            for (const day of enumerateDays(overlapStart, overlapEnd)) actual += dayActual(day, target);
            const periodLen = enumerateDays(window.start, window.end).length;
            const overlapLen = enumerateDays(overlapStart, overlapEnd).length;
            const expected = target.targetPerDay * (overlapLen / periodLen);
            targetDays += 1;
            if (actual >= expected) metDays += 1;
            completionSum += expected > 0 ? actual / expected : 1;
          }
        }

        const reachedInterview = myCandidates.filter(
          (row) =>
            interviewedCandidateIds.has(row.id) ||
            row.status === "interview_scheduled" ||
            row.status === "interviewed" ||
            row.status === "offered"
        ).length;
        const scheduledInRange = myInterviews.filter((row) => row.scheduledAt >= fromStart && row.scheduledAt <= toEnd);
        const done = scheduledInRange.filter((row) => row.status === "done").length;
        const noShow = scheduledInRange.filter((row) => row.status === "no_show").length;
        const cancelled = scheduledInRange.filter((row) => row.status === "cancelled").length;
        const pass = scheduledInRange.filter((row) => row.result === "pass").length;
        const fail = scheduledInRange.filter((row) => row.result === "fail").length;
        const offered = myCandidates.filter((row) => row.status === "offered").length;

        const activeDaySet = new Set<string>();
        myPostingDays.forEach((row) => activeDaySet.add(row.day));
        myFollowupDays.forEach((row) => activeDaySet.add(row.day));
        myGroupOwnerDays.forEach((row) => activeDaySet.add(row.day));
        myInterviews.forEach((row) => {
          if (row.createdAt >= fromStart && row.createdAt <= toEnd) {
            activeDaySet.add(row.createdAt.toISOString().slice(0, 10));
          }
        });

        return {
          employee_id: id,
          name: op.name,
          ifm_display_name: op.ifmDisplayName,
          volume: {
            postings,
            contacts,
            new_group_owners: newGroupOwners,
            candidates_added: myCandidates.length,
            interviews_created: interviewsCreated
          },
          kpi: {
            target_days: targetDays,
            met_days: metDays,
            met_ratio: ratio(metDays, targetDays),
            avg_completion_rate: targetDays > 0 ? Number((completionSum / targetDays).toFixed(4)) : null
          },
          funnel: {
            candidates_added: myCandidates.length,
            reached_interview: reachedInterview,
            interview_rate: ratio(reachedInterview, myCandidates.length),
            interviews_concluded: { done, no_show: noShow, cancelled },
            show_rate: ratio(done, done + noShow + cancelled),
            results: { pass, fail },
            pass_rate: ratio(pass, pass + fail),
            offered,
            offer_rate: ratio(offered, myCandidates.length)
          },
          active_days: activeDaySet.size
        };
      });

    return { from, to, operators: result };
  }
}
