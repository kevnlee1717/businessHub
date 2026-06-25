import { z } from "zod";
import { businessTypes, roles } from "../enums";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();

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

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type RequiredDocItemInput = z.infer<typeof requiredDocItemSchema>;
export type WorkflowTemplateCreateInput = z.infer<typeof workflowTemplateCreateSchema>;
export type WorkflowTemplateUpdateInput = z.infer<typeof workflowTemplateUpdateSchema>;
export type TemplateStepCreateInput = z.infer<typeof templateStepCreateSchema>;
export type TemplateStepUpdateInput = z.infer<typeof templateStepUpdateSchema>;
