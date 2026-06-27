import { z } from "zod";

const uuidField = z.string().uuid();
const optionalDateField = z.union([z.literal(""), z.string().date()]).optional().transform((value) => value || undefined);
const optionalUuidField = z.union([z.literal(""), uuidField]).optional().transform((value) => value || undefined);

export const reportQuerySchema = z.object({
  company_id: optionalUuidField,
  from: optionalDateField,
  to: optionalDateField
});

export const gstQuerySchema = reportQuerySchema.extend({
  rate: z.union([z.literal(""), z.coerce.number().positive()]).optional().transform((value): number => {
    return value === "" || value === undefined ? 0.09 : value;
  })
});

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
export type GstQueryInput = z.infer<typeof gstQuerySchema>;
