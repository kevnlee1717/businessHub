import { z } from "zod";
import { businessTypes, caseStatuses, caseStepStatuses, roles } from "../enums";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  phone: optionalText,
  email: optionalText,
  note: nullableOptionalText
});

export const clientUpdateSchema = clientCreateSchema.partial();

export const requiredDocItemSchema = z.object({
  name: z.string().trim().min(1),
  name_en: z.string().trim().min(1).optional(),
  required: z.boolean().default(true)
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
  default_assignee_role: z.enum(roles).nullable().optional()
});

export const templateStepUpdateSchema = templateStepCreateSchema.partial();

export const caseCreateSchema = z.object({
  business_type: z.enum(businessTypes),
  client_id: uuidField.nullable().optional(),
  template_id: uuidField.optional(),
  billing_id: uuidField.nullable().optional(),
  guarantor_name: optionalText,
  guarantor_relation: optionalText,
  guarantor_contact: optionalText
});

export const caseUpdateSchema = z.object({
  client_id: uuidField.nullable().optional(),
  billing_id: uuidField.nullable().optional(),
  status: z.enum(caseStatuses).optional(),
  current_step: z.number().int().optional(),
  guarantor_name: optionalText,
  guarantor_relation: optionalText,
  guarantor_contact: optionalText
});

export const caseStepUpdateSchema = z.object({
  name: optionalText,
  name_en: optionalText,
  description: nullableOptionalText,
  assignee_id: uuidField.nullable().optional(),
  status: z.enum(caseStepStatuses).optional(),
  step_order: z.number().int().optional()
});

export const caseStepDocCreateSchema = z.object({
  doc_name: z.string().trim().min(1),
  doc_name_en: optionalText,
  is_required: z.boolean().optional()
});

export const caseStepDocUpdateSchema = z.object({
  doc_name: optionalText,
  doc_name_en: optionalText,
  is_required: z.boolean().optional(),
  document_id: uuidField.nullable().optional()
});

export const followUpCreateSchema = z.object({
  content: z.string().trim().min(1)
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type RequiredDocItemInput = z.infer<typeof requiredDocItemSchema>;
export type WorkflowTemplateCreateInput = z.infer<typeof workflowTemplateCreateSchema>;
export type WorkflowTemplateUpdateInput = z.infer<typeof workflowTemplateUpdateSchema>;
export type TemplateStepCreateInput = z.infer<typeof templateStepCreateSchema>;
export type TemplateStepUpdateInput = z.infer<typeof templateStepUpdateSchema>;
export type CaseCreateInput = z.infer<typeof caseCreateSchema>;
export type CaseUpdateInput = z.infer<typeof caseUpdateSchema>;
export type CaseStepUpdateInput = z.infer<typeof caseStepUpdateSchema>;
export type CaseStepDocCreateInput = z.infer<typeof caseStepDocCreateSchema>;
export type CaseStepDocUpdateInput = z.infer<typeof caseStepDocUpdateSchema>;
export type FollowUpCreateInput = z.infer<typeof followUpCreateSchema>;
