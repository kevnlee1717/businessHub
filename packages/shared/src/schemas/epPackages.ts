import { z } from "zod";
import { commissionBases, commissionTargets, serviceCategories } from "../enums";

const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const numericField = z.union([z.string(), z.number()]);
const uuidField = z.string().uuid();

export const serviceItemCreateSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  name_en: z.string().trim().min(1),
  category: z.enum(serviceCategories),
  default_price_sgd: numericField,
  is_core: z.boolean(),
  billable: z.boolean(),
  active: z.boolean().optional(),
  sort_order: z.number().int()
});

export const serviceItemUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  name_en: z.string().trim().min(1).optional(),
  category: z.enum(serviceCategories).optional(),
  default_price_sgd: numericField.optional(),
  is_core: z.boolean().optional(),
  billable: z.boolean().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

export const servicePackageCreateSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  name_en: z.string().trim().min(1),
  base_price_sgd: numericField,
  tagline: nullableOptionalText,
  is_recommended: z.boolean().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int()
});

export const servicePackageUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  name_en: z.string().trim().min(1).optional(),
  base_price_sgd: numericField.optional(),
  tagline: nullableOptionalText,
  is_recommended: z.boolean().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

export const packageItemIdsSchema = z.array(uuidField);

export const packageMilestoneSchema = z.object({
  seq: z.number().int(),
  label: z.string().trim().min(1),
  label_en: z.string().trim().min(1),
  amount_sgd: numericField,
  bind_step_order: z.number().int().nullable().optional(),
  refundable_note: nullableOptionalText
});

export const packageMilestonesReplaceSchema = z.array(packageMilestoneSchema);

export const packageCommissionSchema = z.object({
  target: z.enum(commissionTargets),
  basis: z.enum(commissionBases),
  value: numericField,
  default_party_id: uuidField.nullable().optional(),
  note: nullableOptionalText
});

export const packageCommissionsReplaceSchema = z.array(packageCommissionSchema);

export const caseCommissionSchema = z.object({
  target: z.enum(commissionTargets),
  party_id: uuidField.nullable().optional(),
  external_party_id: uuidField.nullable().optional(),
  basis: z.enum(commissionBases),
  value: numericField,
  note: nullableOptionalText
});

export const caseCommissionsReplaceSchema = z.array(caseCommissionSchema);

export type ServiceItemCreateInput = z.infer<typeof serviceItemCreateSchema>;
export type ServiceItemUpdateInput = z.infer<typeof serviceItemUpdateSchema>;
export type ServicePackageCreateInput = z.infer<typeof servicePackageCreateSchema>;
export type ServicePackageUpdateInput = z.infer<typeof servicePackageUpdateSchema>;
export type PackageMilestoneInput = z.infer<typeof packageMilestoneSchema>;
export type PackageCommissionInput = z.infer<typeof packageCommissionSchema>;
export type CaseCommissionInput = z.infer<typeof caseCommissionSchema>;
