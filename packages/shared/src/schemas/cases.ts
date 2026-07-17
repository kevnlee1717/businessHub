import { z } from "zod";
import { businessTypes, caseStatuses, caseStepStatuses, caseSubmissionResults, genders, roles } from "../enums";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  nationality: nullableOptionalText,
  phone: optionalText,
  email: optionalText,
  note: nullableOptionalText
});

export const clientUpdateSchema = clientCreateSchema.partial();

export const requiredDocItemSchema = z.object({
  name: z.string().trim().min(1),
  name_en: z.string().trim().min(1).optional(),
  category_id: z.string().uuid().nullable().optional(),
  required: z.boolean().default(true)
});

export const stepCollectionItemSchema = z.object({
  collection_item_id: uuidField,
  required: z.boolean().optional()
});

export const workflowTemplateCreateSchema = z.object({
  business_type: z.enum(businessTypes),
  name: z.string().trim().min(1)
});

export const workflowTemplateUpdateSchema = workflowTemplateCreateSchema.partial();

export const templateStepCreateSchema = z.object({
  step_order: z.number().int().optional(),
  name: z.string().trim().min(1),
  name_en: optionalText,
  description: nullableOptionalText,
  required_documents: z.array(requiredDocItemSchema).optional(),
  collections: z.array(stepCollectionItemSchema).optional(),
  default_assignee_role: z.enum(roles).nullable().optional()
});

export const templateStepUpdateSchema = templateStepCreateSchema.partial();

export const caseCreateSchema = z.object({
  business_type: z.enum(businessTypes),
  parent_case_id: uuidField.nullable().optional(),
  client_id: uuidField.nullable().optional(),
  template_id: uuidField.optional(),
  billing_id: uuidField.nullable().optional(),
  package_id: uuidField.nullable().optional(),
  fee_scheme_version_id: uuidField.nullable().optional(),
  sales_id: uuidField.nullable().optional(),
  guarantor_name: optionalText,
  guarantor_relation: optionalText,
  guarantor_contact: optionalText,
  signed_at: dateField.nullable().optional()
});

export const caseUpdateSchema = z.object({
  client_id: uuidField.nullable().optional(),
  billing_id: uuidField.nullable().optional(),
  status: z.enum(caseStatuses).optional(),
  current_step: z.number().int().optional(),
  fee_scheme_version_id: uuidField.nullable().optional(),
  guarantor_id: uuidField.nullable().optional(),
  guarantor_name: optionalText,
  guarantor_relation: optionalText,
  guarantor_contact: optionalText,
  signed_at: dateField.nullable().optional()
});

export const caseStepUpdateSchema = z.object({
  name: optionalText,
  name_en: optionalText,
  description: nullableOptionalText,
  assignee_id: uuidField.nullable().optional(),
  status: z.enum(caseStepStatuses).optional(),
  force: z.boolean().optional(),
  step_order: z.number().int().optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const guarantorCreateSchema = z.object({
  name: z.string().trim().min(1),
  nric: optionalText,
  gender: z.enum(genders).nullable().optional(),
  age: z.number().int().min(0).nullable().optional(),
  is_client_own: z.boolean().optional(),
  note: nullableOptionalText
});

export const guarantorUpdateSchema = guarantorCreateSchema.partial();

export const caseSubmissionCreateSchema = z.object({
  submitted_at: z.string().datetime().optional(),
  note: nullableOptionalText
});

export const caseSubmissionUpdateSchema = z.object({
  result: z.enum(caseSubmissionResults).optional(),
  rejected_at: z.string().datetime().nullable().optional(),
  submitted_at: z.string().datetime().nullable().optional(),
  note: nullableOptionalText
});

export const caseStepDocCreateSchema = z.object({
  doc_name: z.string().trim().min(1),
  doc_name_en: optionalText,
  category_id: uuidField.nullable().optional(),
  is_required: z.boolean().optional()
});

export const caseStepDocUpdateSchema = z.object({
  doc_name: optionalText,
  doc_name_en: optionalText,
  category_id: uuidField.nullable().optional(),
  is_required: z.boolean().optional(),
  document_id: uuidField.nullable().optional(),
  document_ids: z.array(uuidField).nullable().optional()
});

export const stepReviewRequestSchema = z.object({
  reviewer_id: uuidField,
  content: nullableOptionalText
});

export const stepReviewMessageSchema = z.object({
  action: z.enum(["comment", "approve", "reject"]),
  content: nullableOptionalText
});

export const followUpCreateSchema = z.object({
  content: z.string().trim().min(1)
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type RequiredDocItemInput = z.infer<typeof requiredDocItemSchema>;
export type StepCollectionItemInput = z.infer<typeof stepCollectionItemSchema>;
export type WorkflowTemplateCreateInput = z.infer<typeof workflowTemplateCreateSchema>;
export type WorkflowTemplateUpdateInput = z.infer<typeof workflowTemplateUpdateSchema>;
export type TemplateStepCreateInput = z.infer<typeof templateStepCreateSchema>;
export type TemplateStepUpdateInput = z.infer<typeof templateStepUpdateSchema>;
export type CaseCreateInput = z.infer<typeof caseCreateSchema>;
export type CaseUpdateInput = z.infer<typeof caseUpdateSchema>;
export type CaseStepUpdateInput = z.infer<typeof caseStepUpdateSchema>;
export type GuarantorCreateInput = z.infer<typeof guarantorCreateSchema>;
export type GuarantorUpdateInput = z.infer<typeof guarantorUpdateSchema>;
export type CaseSubmissionCreateInput = z.infer<typeof caseSubmissionCreateSchema>;
export type CaseSubmissionUpdateInput = z.infer<typeof caseSubmissionUpdateSchema>;
export type CaseStepDocCreateInput = z.infer<typeof caseStepDocCreateSchema>;
export type CaseStepDocUpdateInput = z.infer<typeof caseStepDocUpdateSchema>;
export type StepReviewRequestInput = z.infer<typeof stepReviewRequestSchema>;
export type StepReviewMessageInput = z.infer<typeof stepReviewMessageSchema>;
export type FollowUpCreateInput = z.infer<typeof followUpCreateSchema>;
