import { z } from "zod";

const uuidField = z.string().uuid();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const nonNegativeNumber = z.coerce.number().nonnegative();

export const fnbFoodCourtFixedFeesSchema = z.object({
  cleaning: nonNegativeNumber.default(0),
  maintenance: nonNegativeNumber.default(0),
  pos: nonNegativeNumber.default(0),
  subscription: nonNegativeNumber.default(0),
  bank: nonNegativeNumber.default(0),
  legal: nonNegativeNumber.default(0),
  other: nonNegativeNumber.default(0)
});

const fnbFoodCourtBaseSchema = z.object({
  name: z.string().trim().min(1),
  stall: nullableOptionalText,
  brand: nullableOptionalText,
  notes: nullableOptionalText,
  rent_pct: nonNegativeNumber.default(24.5),
  min_rent: nonNegativeNumber.default(0),
  adv_pct: nonNegativeNumber.default(0.7),
  adv_mode: z.enum(["pct", "fixed"]).default("pct"),
  mdr_pct: nonNegativeNumber.default(1.5),
  mdr_mode: z.enum(["pct", "fixed"]).default("pct"),
  fixed_fees: fnbFoodCourtFixedFeesSchema.nullable().default({
    cleaning: 0,
    maintenance: 0,
    pos: 0,
    subscription: 0,
    bank: 0,
    legal: 0,
    other: 0
  }),
  entrance_monthly: nonNegativeNumber.default(0),
  mgmt_pct: nonNegativeNumber.default(3),
  food_pct: nonNegativeNumber.default(35),
  gst_pct: nonNegativeNumber.default(9),
  include_gst: z.boolean().default(true),
  salary: nonNegativeNumber.default(8000),
  investor_floor: nonNegativeNumber.default(2800),
  investor_share_pct: nonNegativeNumber.default(51),
  couple_floor: nonNegativeNumber.default(3000),
  couple_repay_cap: nonNegativeNumber.default(4167),
  profit_target: nonNegativeNumber.default(5600),
  excess_mgmt_pct: nonNegativeNumber.default(50),
  excess_couple_pct: nonNegativeNumber.default(25),
  tiers: z.array(nonNegativeNumber).default([25000, 30000, 35000, 40000, 45000, 50000])
});

export const fnbFoodCourtCreateSchema = fnbFoodCourtBaseSchema;
export const fnbFoodCourtUpdateSchema = fnbFoodCourtBaseSchema.partial();

export const fnbFoodCourtIdParams = z.object({
  id: uuidField
});

export type FnbFoodCourtFixedFeesInput = z.infer<typeof fnbFoodCourtFixedFeesSchema>;
export type FnbFoodCourtCreateInput = z.infer<typeof fnbFoodCourtCreateSchema>;
export type FnbFoodCourtUpdateInput = z.infer<typeof fnbFoodCourtUpdateSchema>;
export type FnbFoodCourtIdParams = z.infer<typeof fnbFoodCourtIdParams>;
