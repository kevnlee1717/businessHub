import { z } from "zod";
import { currencies } from "../enums";

const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const numberLike = z.union([z.string(), z.number()]).nullable().optional();

// 非月租资料的标签。
export const rentDocTags = ["租约", "押金", "交税证明", "其他"] as const;
export type RentDocTag = (typeof rentDocTags)[number];

export const rentLocationCreateSchema = z.object({
  name: z.string().trim().min(1),
  address: nullableOptionalText,
  lat: numberLike,
  lng: numberLike,
  landlord_name: nullableOptionalText,
  lease_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  lease_months: z.number().int().nonnegative().nullable().optional(),
  monthly_rent: numberLike,
  deposit: numberLike,
  currency: z.enum(currencies).optional(),
  note: nullableOptionalText,
  sort_order: z.number().int().optional()
});

export const rentLocationUpdateSchema = rentLocationCreateSchema.partial();

// rent_files 行的可编辑字段(上传走 multipart,这里用于编辑/校验)。
export const rentFileMetaSchema = z.object({
  location_id: z.string().uuid(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable()
    .optional(),
  doc_tag: z.enum(rentDocTags).nullable().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  note: nullableOptionalText
});

export type RentLocationCreateInput = z.infer<typeof rentLocationCreateSchema>;
export type RentLocationUpdateInput = z.infer<typeof rentLocationUpdateSchema>;
export type RentFileMetaInput = z.infer<typeof rentFileMetaSchema>;
