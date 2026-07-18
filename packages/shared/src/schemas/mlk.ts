import { z } from "zod";

const uuidField = z.string().uuid();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const nullableOptionalUuid = uuidField.nullable().optional();
const nonNegativeNumber = z.coerce.number().nonnegative();
const moneyNumber = nonNegativeNumber;
const signedMoneyNumber = z.coerce.number();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableOptionalDateTime = z.coerce.date().nullable().optional();

export const mlkIdParams = z.object({
  id: uuidField
});

export const mlkFolderIdParams = z.object({
  folderId: uuidField
});

export const mlkInvestorBaseSchema = z.object({
  name: z.string().trim().min(1),
  company_name: nullableOptionalText,
  uen: nullableOptionalText,
  id_no: nullableOptionalText,
  phone: nullableOptionalText,
  wechat: nullableOptionalText,
  address: nullableOptionalText,
  service_tier: z.enum(["tier1", "tier2"]).default("tier1"),
  pr_status: z.enum(["none", "applied", "granted"]).default("none"),
  kyc_status: z.enum(["pending", "done"]).default("pending"),
  drive_folder_id: nullableOptionalUuid,
  notes: nullableOptionalText
});

export const mlkInvestorCreateSchema = mlkInvestorBaseSchema;
export const mlkInvestorUpdateSchema = mlkInvestorBaseSchema.partial();

export const mlkCoupleBaseSchema = z.object({
  operator_company: nullableOptionalText,
  operator_uen: nullableOptionalText,
  husband_name: z.string().trim().min(1),
  husband_id_no: nullableOptionalText,
  husband_passport: nullableOptionalText,
  wife_name: z.string().trim().min(1),
  wife_id_no: nullableOptionalText,
  wife_passport: nullableOptionalText,
  phone: nullableOptionalText,
  wechat: nullableOptionalText,
  husband_ep: z.enum(["none", "applied", "granted"]).default("none"),
  wife_ep: z.enum(["none", "applied", "granted"]).default("none"),
  pr_status: z.enum(["none", "applied", "granted"]).default("none"),
  mentor_id: nullableOptionalUuid,
  status: z.enum(["candidate", "active", "exited"]).default("candidate"),
  joined_at: nullableOptionalDateTime,
  exited_at: nullableOptionalDateTime,
  drive_folder_id: nullableOptionalUuid,
  notes: nullableOptionalText
});

export const mlkCoupleCreateSchema = mlkCoupleBaseSchema;
export const mlkCoupleUpdateSchema = mlkCoupleBaseSchema.partial();

export const mlkManagerBaseSchema = z.object({
  name: z.string().trim().min(1),
  phone: nullableOptionalText,
  wechat: nullableOptionalText,
  id_no: nullableOptionalText,
  brand_name: nullableOptionalText,
  branding: z.enum(["co_brand", "mrs_lu"]).nullable().optional(),
  status: z.enum(["candidate", "active", "exited"]).default("candidate"),
  joined_at: nullableOptionalDateTime,
  exited_at: nullableOptionalDateTime,
  mgmt_fee_rate: moneyNumber.default(3),
  excess_bonus_rate: moneyNumber.default(10),
  profit_threshold: moneyNumber.default(5600),
  drive_folder_id: nullableOptionalUuid,
  notes: nullableOptionalText
});

export const mlkManagerCreateSchema = mlkManagerBaseSchema;
export const mlkManagerUpdateSchema = mlkManagerBaseSchema.partial();

export const mlkCuisineBaseSchema = z.object({
  name: z.string().trim().min(1),
  manager_id: nullableOptionalUuid,
  notes: nullableOptionalText
});

export const mlkCuisineCreateSchema = mlkCuisineBaseSchema;
export const mlkCuisineUpdateSchema = mlkCuisineBaseSchema.partial();

export const mlkCuisineQuerySchema = z.object({
  managerId: uuidField.optional()
});

export const mlkStoreBaseSchema = z.object({
  name: z.string().trim().min(1),
  stall: nullableOptionalText,
  cuisine_id: nullableOptionalUuid,
  address: nullableOptionalText,
  spv_name: nullableOptionalText,
  spv_uen: nullableOptionalText,
  investor_id: nullableOptionalUuid,
  couple_id: nullableOptionalUuid,
  food_court_id: nullableOptionalUuid,
  kitchen_store_id: nullableOptionalText,
  status: z.enum(["intent", "selected", "incorporated", "lease_signed", "renovation", "open", "closed"]).default("intent"),
  intent_signed_at: nullableOptionalDateTime,
  selected_at: nullableOptionalDateTime,
  incorporated_at: nullableOptionalDateTime,
  lease_signed_at: nullableOptionalDateTime,
  renovation_at: nullableOptionalDateTime,
  opened_at: nullableOptionalDateTime,
  closed_at: nullableOptionalDateTime,
  fc_deposit_amount: moneyNumber.nullable().optional(),
  drive_folder_id: nullableOptionalUuid,
  notes: nullableOptionalText
});

export const mlkStoreCreateSchema = mlkStoreBaseSchema;
export const mlkStoreUpdateSchema = mlkStoreBaseSchema.partial();

export const mlkPaymentBaseSchema = z.object({
  investor_id: uuidField,
  store_id: nullableOptionalUuid,
  kind: z.enum([
    "instalment1",
    "instalment2",
    "instalment3",
    "instalment4",
    "fc_deposit",
    "service_tier1",
    "service_tier2_first",
    "service_tier2_second"
  ]),
  amount_due: moneyNumber.default(0),
  amount_paid: moneyNumber.default(0),
  paid_at: nullableOptionalDateTime,
  status: z.enum(["pending", "paid", "refunded"]).default("pending"),
  notes: nullableOptionalText
});

export const mlkPaymentCreateSchema = mlkPaymentBaseSchema;
export const mlkPaymentUpdateSchema = mlkPaymentBaseSchema.partial();

export const mlkLedgerBaseSchema = z.object({
  couple_id: uuidField,
  store_id: nullableOptionalUuid,
  month: dateString,
  kind: z.enum(["advance_repay", "retention_hold", "retention_refund", "bond_paid", "bond_refund", "platform_fee", "mentor_income"]),
  amount: signedMoneyNumber,
  notes: nullableOptionalText
});

export const mlkLedgerCreateSchema = mlkLedgerBaseSchema;
export const mlkLedgerUpdateSchema = mlkLedgerBaseSchema.partial();

export const mlkRevenueQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional()
});

export const mlkRevenueCreateSchema = z.object({
  date: dateString,
  turnover: moneyNumber,
  source: z.enum(["kitchen", "manual"]).default("manual")
});

export const mlkSettlementCreateSchema = z.object({
  month: dateString,
  turnover: moneyNumber.default(0),
  net_profit: moneyNumber.default(0),
  investor_payout: moneyNumber.default(0),
  couple_payout: moneyNumber.default(0),
  mgmt_payout: moneyNumber.default(0),
  detail: z.unknown().nullable().optional()
});

export const mlkSettlementPreviewQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/)
});

export const mlkManagerSettlementBaseSchema = z.object({
  manager_id: uuidField,
  month: dateString,
  mgmt_fee: moneyNumber.default(0),
  material_share: moneyNumber.default(0),
  training_fee: moneyNumber.default(0),
  opening_surplus: moneyNumber.default(0),
  excess_bonus: moneyNumber.default(0),
  central_kitchen: moneyNumber.default(0),
  other: signedMoneyNumber.default(0),
  detail: z.unknown().nullable().optional(),
  notes: nullableOptionalText
});

export const mlkManagerSettlementCreateSchema = mlkManagerSettlementBaseSchema;
export const mlkManagerSettlementUpdateSchema = mlkManagerSettlementBaseSchema.partial();

export const mlkFolderCreateSchema = z.object({
  name: z.string().trim().min(1)
});

export type MlkInvestorCreateInput = z.infer<typeof mlkInvestorCreateSchema>;
export type MlkInvestorUpdateInput = z.infer<typeof mlkInvestorUpdateSchema>;
export type MlkCoupleCreateInput = z.infer<typeof mlkCoupleCreateSchema>;
export type MlkCoupleUpdateInput = z.infer<typeof mlkCoupleUpdateSchema>;
export type MlkManagerCreateInput = z.infer<typeof mlkManagerCreateSchema>;
export type MlkManagerUpdateInput = z.infer<typeof mlkManagerUpdateSchema>;
export type MlkCuisineCreateInput = z.infer<typeof mlkCuisineCreateSchema>;
export type MlkCuisineUpdateInput = z.infer<typeof mlkCuisineUpdateSchema>;
export type MlkStoreCreateInput = z.infer<typeof mlkStoreCreateSchema>;
export type MlkStoreUpdateInput = z.infer<typeof mlkStoreUpdateSchema>;
export type MlkPaymentCreateInput = z.infer<typeof mlkPaymentCreateSchema>;
export type MlkPaymentUpdateInput = z.infer<typeof mlkPaymentUpdateSchema>;
export type MlkLedgerCreateInput = z.infer<typeof mlkLedgerCreateSchema>;
export type MlkLedgerUpdateInput = z.infer<typeof mlkLedgerUpdateSchema>;
export type MlkRevenueCreateInput = z.infer<typeof mlkRevenueCreateSchema>;
export type MlkSettlementCreateInput = z.infer<typeof mlkSettlementCreateSchema>;
export type MlkManagerSettlementCreateInput = z.infer<typeof mlkManagerSettlementCreateSchema>;
export type MlkManagerSettlementUpdateInput = z.infer<typeof mlkManagerSettlementUpdateSchema>;
