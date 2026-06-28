import { z } from "zod";
import {
  franchiseContractExpiries,
  franchiseDecisionMakers,
  franchiseFootfalls,
  franchiseInterestLevels,
  franchiseOrgTypes,
  franchisePriorities,
  franchisePropertyTypes,
  franchiseServices,
  franchiseSiteStatuses,
  franchiseTriStates
} from "../enums";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const optionalUuid = uuidField.optional();
const nullableOptionalUuid = uuidField.nullable().optional();
const booleanQuery = z.enum(["0", "1", "true", "false"]).optional();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeString = z.string().datetime();
const numericInput = z.union([z.number(), z.string().trim().min(1)]).nullable().optional();

const listQueryBaseSchema = z.object({
  q: optionalText,
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional()
});

export const franchiseOrgCreateSchema = z.object({
  company_id: uuidField,
  name: z.string().trim().min(1).max(200),
  type: z.enum(franchiseOrgTypes),
  note: nullableOptionalText
});
export const franchiseOrgUpdateSchema = franchiseOrgCreateSchema.omit({ company_id: true }).partial();
export const franchiseOrgListQuerySchema = listQueryBaseSchema.extend({
  type: z.enum(franchiseOrgTypes).optional()
});

const franchiseContactBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(120).nullable().optional(),
  phone: z.string().trim().min(1).max(64).nullable().optional(),
  org_id: nullableOptionalUuid,
  referred_by_contact_id: nullableOptionalUuid,
  next_visit_at: dateTimeString.nullable().optional(),
  owner_id: nullableOptionalUuid,
  note: nullableOptionalText
});
export const franchiseContactCreateSchema = franchiseContactBaseSchema.extend({ company_id: uuidField });
export const franchiseContactUpdateSchema = franchiseContactBaseSchema.partial();
export const franchiseContactListQuerySchema = listQueryBaseSchema.extend({
  org_type: z.enum(franchiseOrgTypes).optional(),
  due_before: dateTimeString.optional(),
  owner_id: optionalUuid
});

const franchisePropertyBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  property_type: z.enum(franchisePropertyTypes),
  address: nullableOptionalText,
  org_id: nullableOptionalUuid,
  is_vending_site: z.boolean().optional(),
  vending_note: nullableOptionalText,
  introduced_by_contact_id: nullableOptionalUuid,
  relationship_note: nullableOptionalText,
  priority: z.enum(franchisePriorities),
  footfall: z.enum(franchiseFootfalls).nullable().optional(),
  decision_maker: z.enum(franchiseDecisionMakers).nullable().optional(),
  has_public_space: z.enum(franchiseTriStates).nullable().optional(),
  status: z.enum(franchiseSiteStatuses).optional(),
  owner_id: nullableOptionalUuid
});
export const franchisePropertyCreateSchema = franchisePropertyBaseSchema.extend({ company_id: uuidField });
export const franchisePropertyUpdateSchema = franchisePropertyBaseSchema.partial();
export const franchisePropertyListQuerySchema = listQueryBaseSchema.extend({
  is_vending_site: booleanQuery,
  priority: z.enum(franchisePriorities).optional(),
  status: z.enum(franchiseSiteStatuses).optional(),
  owner_id: optionalUuid
});

export const franchisePropertySurveyCreateSchema = z.object({
  interested_services: z.array(z.enum(franchiseServices)).optional(),
  details: z.record(z.unknown()).nullable().optional()
});

export const franchisePropertyVisitCreateSchema = z.object({
  company_id: uuidField.optional(),
  property_id: uuidField.optional(),
  contact_id: nullableOptionalUuid,
  by_employee_id: uuidField,
  visited_at: dateTimeString,
  interest_level: z.enum(franchiseInterestLevels),
  services_pitched: z.array(z.enum(franchiseServices)).optional(),
  result: nullableOptionalText,
  note: nullableOptionalText,
  survey: franchisePropertySurveyCreateSchema.optional()
});
export const franchisePropertyVisitUpdateSchema = franchisePropertyVisitCreateSchema.omit({ company_id: true, property_id: true }).partial();
export const franchisePropertyVisitListQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  employee_id: optionalUuid
});
export const franchisePropertySurveyUpdateSchema = franchisePropertySurveyCreateSchema.partial();
export const franchisePropertySurveyListQuerySchema = z.object({
  visit_id: optionalUuid
});

const franchiseFnbSiteBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  org_id: nullableOptionalUuid,
  location: nullableOptionalText,
  has_aircon: z.boolean().nullable().optional(),
  introduced_by_contact_id: nullableOptionalUuid,
  relationship_note: nullableOptionalText,
  priority: z.enum(franchisePriorities),
  status: z.enum(franchiseSiteStatuses).optional(),
  owner_id: nullableOptionalUuid
});
export const franchiseFnbSiteCreateSchema = franchiseFnbSiteBaseSchema.extend({ company_id: uuidField });
export const franchiseFnbSiteUpdateSchema = franchiseFnbSiteBaseSchema.partial();
export const franchiseFnbSiteListQuerySchema = listQueryBaseSchema.extend({
  priority: z.enum(franchisePriorities).optional(),
  status: z.enum(franchiseSiteStatuses).optional(),
  owner_id: optionalUuid
});

export const franchiseFnbSurveyCreateSchema = z.object({
  rent_fixed: numericInput,
  rent_revenue_share_pct: numericInput,
  management_fee: numericInput,
  dishwash_fee: numericInput,
  contract_expiry: z.enum(franchiseContractExpiries).nullable().optional(),
  extra: z.record(z.unknown()).nullable().optional()
});

export const franchiseFnbVisitCreateSchema = z.object({
  company_id: uuidField.optional(),
  site_id: uuidField.optional(),
  contact_id: nullableOptionalUuid,
  by_employee_id: uuidField,
  visited_at: dateTimeString,
  interest_level: z.enum(franchiseInterestLevels),
  result: nullableOptionalText,
  note: nullableOptionalText,
  survey: franchiseFnbSurveyCreateSchema.optional()
});
export const franchiseFnbVisitUpdateSchema = franchiseFnbVisitCreateSchema.omit({ company_id: true, site_id: true }).partial();
export const franchiseFnbVisitListQuerySchema = franchisePropertyVisitListQuerySchema;
export const franchiseFnbSurveyUpdateSchema = franchiseFnbSurveyCreateSchema.partial();
export const franchiseFnbSurveyListQuerySchema = z.object({
  visit_id: optionalUuid
});

export const franchiseVisitListQuerySchema = franchisePropertyVisitListQuerySchema;
export const franchiseKpiQuerySchema = franchisePropertyVisitListQuerySchema.extend({
  due_days: z.coerce.number().int().min(1).max(90).optional()
});

export type FranchiseOrgCreateInput = z.infer<typeof franchiseOrgCreateSchema>;
export type FranchiseOrgUpdateInput = z.infer<typeof franchiseOrgUpdateSchema>;
export type FranchiseContactCreateInput = z.infer<typeof franchiseContactCreateSchema>;
export type FranchiseContactUpdateInput = z.infer<typeof franchiseContactUpdateSchema>;
export type FranchisePropertyCreateInput = z.infer<typeof franchisePropertyCreateSchema>;
export type FranchisePropertyUpdateInput = z.infer<typeof franchisePropertyUpdateSchema>;
export type FranchisePropertyVisitCreateInput = z.infer<typeof franchisePropertyVisitCreateSchema>;
export type FranchisePropertyVisitUpdateInput = z.infer<typeof franchisePropertyVisitUpdateSchema>;
export type FranchiseFnbSiteCreateInput = z.infer<typeof franchiseFnbSiteCreateSchema>;
export type FranchiseFnbSiteUpdateInput = z.infer<typeof franchiseFnbSiteUpdateSchema>;
export type FranchiseFnbVisitCreateInput = z.infer<typeof franchiseFnbVisitCreateSchema>;
export type FranchiseFnbVisitUpdateInput = z.infer<typeof franchiseFnbVisitUpdateSchema>;
