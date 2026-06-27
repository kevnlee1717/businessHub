import { z } from "zod";
import { schemeLineRecurrences } from "../enums";

const nullableOptionalText = z.string().trim().min(1).nullable().optional();

export const collectionItemCreateSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  name_en: nullableOptionalText,
  default_recurrence: z.enum(schemeLineRecurrences).nullable().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

export const collectionItemUpdateSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  name_en: nullableOptionalText,
  default_recurrence: z.enum(schemeLineRecurrences).nullable().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

export type CollectionItemCreateInput = z.infer<typeof collectionItemCreateSchema>;
export type CollectionItemUpdateInput = z.infer<typeof collectionItemUpdateSchema>;
