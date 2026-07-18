import { ApiError, UnauthorizedError, api } from "./client";

export const mlkKeys = {
  all: ["mlk"] as const,
  stores: () => ["mlk", "stores"] as const,
  store: (id: string) => ["mlk", "stores", id] as const,
  investors: () => ["mlk", "investors"] as const,
  investor: (id: string) => ["mlk", "investors", id] as const,
  couples: () => ["mlk", "couples"] as const,
  couple: (id: string) => ["mlk", "couples", id] as const,
  managers: () => ["mlk", "managers"] as const,
  manager: (id: string) => ["mlk", "managers", id] as const,
  cuisines: (managerId?: string | null) => ["mlk", "cuisines", managerId ?? null] as const,
  managerSettlements: (id: string) => ["mlk", "managers", id, "settlements"] as const,
  managerSettlementPreview: (id: string, month: string) => ["mlk", "managers", id, "settlements", "preview", month] as const,
  investorPayments: (id: string) => ["mlk", "investors", id, "payments"] as const,
  coupleLedger: (id: string) => ["mlk", "couples", id, "ledger"] as const,
  revenue: (storeId: string, from?: string, to?: string) => ["mlk", "stores", storeId, "revenue", from ?? null, to ?? null] as const,
  settlements: (storeId: string) => ["mlk", "stores", storeId, "settlements"] as const,
  files: (folderId: string) => ["mlk", "files", folderId] as const,
  fileTree: (rootId: string) => ["mlk", "files", rootId, "tree"] as const
};

export type MlkStatus = "intent" | "selected" | "incorporated" | "lease_signed" | "renovation" | "open" | "closed";
export type MlkPrStatus = "none" | "applied" | "granted";
export type MlkEpStatus = "none" | "applied" | "granted";
export type MlkCoupleStatus = "candidate" | "active" | "exited";
export type MlkManagerStatus = "candidate" | "active" | "exited";
export type MlkBranding = "co_brand" | "mrs_lu";
export type MlkServiceTier = "tier1" | "tier2";
export type MlkKycStatus = "pending" | "done";
export type MlkPaymentStatus = "pending" | "paid" | "refunded";
export type MlkPaymentKind =
  | "instalment1"
  | "instalment2"
  | "instalment3"
  | "instalment4"
  | "fc_deposit"
  | "service_tier1"
  | "service_tier2_first"
  | "service_tier2_second";
export type MlkLedgerKind =
  | "advance_repay"
  | "retention_hold"
  | "retention_refund"
  | "bond_paid"
  | "bond_refund"
  | "platform_fee"
  | "mentor_income";

export type MlkInvestorInput = {
  name: string;
  company_name?: string | null;
  uen?: string | null;
  id_no?: string | null;
  phone?: string | null;
  wechat?: string | null;
  address?: string | null;
  service_tier: MlkServiceTier;
  pr_status: MlkPrStatus;
  kyc_status: MlkKycStatus;
  drive_folder_id?: string | null;
  notes?: string | null;
};

export type MlkInvestor = MlkInvestorInput & {
  id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkCoupleInput = {
  operator_company?: string | null;
  operator_uen?: string | null;
  husband_name: string;
  husband_id_no?: string | null;
  husband_passport?: string | null;
  wife_name: string;
  wife_id_no?: string | null;
  wife_passport?: string | null;
  phone?: string | null;
  wechat?: string | null;
  husband_ep: MlkEpStatus;
  wife_ep: MlkEpStatus;
  pr_status: MlkPrStatus;
  mentor_id?: string | null;
  status: MlkCoupleStatus;
  joined_at?: string | null;
  exited_at?: string | null;
  drive_folder_id?: string | null;
  notes?: string | null;
};

export type MlkCouple = MlkCoupleInput & {
  id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkStoreInput = {
  name: string;
  stall?: string | null;
  cuisine_id?: string | null;
  address?: string | null;
  spv_name?: string | null;
  spv_uen?: string | null;
  investor_id?: string | null;
  couple_id?: string | null;
  food_court_id?: string | null;
  kitchen_store_id?: string | null;
  status: MlkStatus;
  intent_signed_at?: string | null;
  selected_at?: string | null;
  incorporated_at?: string | null;
  lease_signed_at?: string | null;
  renovation_at?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  fc_deposit_amount?: number | null;
  drive_folder_id?: string | null;
  notes?: string | null;
};

export type MlkStore = MlkStoreInput & {
  id: string;
  investor_name?: string | null;
  couple_name?: string | null;
  food_court_name?: string | null;
  cuisine_name?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  payments?: MlkPayment[];
  revenue_monthly?: { month: string; turnover: number }[];
  settlements?: MlkSettlement[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkManagerInput = {
  name: string;
  phone?: string | null;
  wechat?: string | null;
  id_no?: string | null;
  brand_name?: string | null;
  branding?: MlkBranding | null;
  status: MlkManagerStatus;
  joined_at?: string | null;
  exited_at?: string | null;
  mgmt_fee_rate: number;
  excess_bonus_rate: number;
  profit_threshold: number;
  drive_folder_id?: string | null;
  notes?: string | null;
};

export type MlkManager = MlkManagerInput & {
  id: string;
  cuisine_count?: number;
  store_count?: number;
  cuisines?: MlkCuisineWithStores[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkCuisineInput = {
  name: string;
  manager_id?: string | null;
  notes?: string | null;
};

export type MlkCuisine = MlkCuisineInput & {
  id: string;
  manager_name?: string | null;
  store_count?: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkCuisineWithStores = MlkCuisine & {
  stores: { id: string; name: string; status: MlkStatus }[];
};

export type MlkManagerSettlementInput = {
  manager_id: string;
  month: string;
  mgmt_fee: number;
  material_share: number;
  training_fee: number;
  opening_surplus: number;
  excess_bonus: number;
  central_kitchen: number;
  other: number;
  detail?: unknown;
  notes?: string | null;
};

export type MlkManagerSettlement = MlkManagerSettlementInput & {
  id: string;
  total: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkManagerSettlementPreviewRow = {
  storeId: string;
  storeName: string;
  cuisineName: string;
  turnover: number;
  turnoverSource: "settlement" | "revenue" | "none";
  mgmtFee: number;
  netProfit: number;
  excessBonus: number;
};

export type MlkManagerSettlementPreview = {
  month: string;
  mgmtFee: number;
  excessBonus: number;
  detail: MlkManagerSettlementPreviewRow[];
};

export type MlkPaymentInput = {
  investor_id: string;
  store_id?: string | null;
  kind: MlkPaymentKind;
  amount_due: number;
  amount_paid: number;
  paid_at?: string | null;
  status: MlkPaymentStatus;
  notes?: string | null;
};

export type MlkPayment = MlkPaymentInput & {
  id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkLedgerInput = {
  couple_id: string;
  store_id?: string | null;
  month: string;
  kind: MlkLedgerKind;
  amount: number;
  notes?: string | null;
};

export type MlkLedgerEntry = MlkLedgerInput & {
  id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkRevenueInput = {
  date: string;
  turnover: number;
  source?: "kitchen" | "manual";
};

export type MlkRevenue = Required<MlkRevenueInput> & {
  id: string;
  store_id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkSettlementInput = {
  month: string;
  turnover: number;
  net_profit: number;
  investor_payout: number;
  couple_payout: number;
  mgmt_payout: number;
  detail?: unknown;
};

export type MlkSettlement = MlkSettlementInput & {
  id: string;
  store_id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MlkFileNode = {
  id: string;
  parent_id: string | null;
  kind: "folder" | "file";
  name: string;
  storage_path: string | null;
  mime: string | null;
  size: number | null;
  sort_order: number;
  url?: string | null;
  updated_at: string;
  created_at: string;
};

export const mlkInvestorDefaults = (): MlkInvestorInput => ({
  name: "",
  company_name: null,
  uen: null,
  id_no: null,
  phone: null,
  wechat: null,
  address: null,
  service_tier: "tier1",
  pr_status: "none",
  kyc_status: "pending",
  drive_folder_id: null,
  notes: null
});

export const mlkCoupleDefaults = (): MlkCoupleInput => ({
  operator_company: null,
  operator_uen: null,
  husband_name: "",
  husband_id_no: null,
  husband_passport: null,
  wife_name: "",
  wife_id_no: null,
  wife_passport: null,
  phone: null,
  wechat: null,
  husband_ep: "none",
  wife_ep: "none",
  pr_status: "none",
  mentor_id: null,
  status: "candidate",
  joined_at: null,
  exited_at: null,
  drive_folder_id: null,
  notes: null
});

export const mlkStoreDefaults = (): MlkStoreInput => ({
  name: "",
  stall: null,
  cuisine_id: null,
  address: null,
  spv_name: null,
  spv_uen: null,
  investor_id: null,
  couple_id: null,
  food_court_id: null,
  kitchen_store_id: null,
  status: "intent",
  intent_signed_at: null,
  selected_at: null,
  incorporated_at: null,
  lease_signed_at: null,
  renovation_at: null,
  opened_at: null,
  closed_at: null,
  fc_deposit_amount: null,
  drive_folder_id: null,
  notes: null
});

export const mlkManagerDefaults = (): MlkManagerInput => ({
  name: "",
  phone: null,
  wechat: null,
  id_no: null,
  brand_name: null,
  branding: null,
  status: "candidate",
  joined_at: null,
  exited_at: null,
  mgmt_fee_rate: 3,
  excess_bonus_rate: 10,
  profit_threshold: 5600,
  drive_folder_id: null,
  notes: null
});

export const mlkCuisineDefaults = (): MlkCuisineInput => ({
  name: "",
  manager_id: null,
  notes: null
});

export const mlkManagerSettlementDefaults = (managerId: string, month: string): MlkManagerSettlementInput => ({
  manager_id: managerId,
  month,
  mgmt_fee: 0,
  material_share: 0,
  training_fee: 0,
  opening_surplus: 0,
  excess_bonus: 0,
  central_kitchen: 0,
  other: 0,
  detail: null,
  notes: null
});

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function errorMessage(data: unknown, fallback: string) {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

async function postFormData<T>(path: string, formData: FormData, method: "POST" | "PUT" = "POST"): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    body: formData,
    credentials: "include"
  });
  const data = await parseResponse(response);
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new ApiError(errorMessage(data, response.statusText), response.status);
  return data as T;
}

export const listMlkStores = () => api<{ stores: MlkStore[] }>("/mlk/stores");
export const getMlkStore = (id: string) => api<{ store: MlkStore }>(`/mlk/stores/${id}`);
export const createMlkStore = (body: MlkStoreInput) => api<{ store: MlkStore }>("/mlk/stores", { method: "POST", body });
export const updateMlkStore = (id: string, body: Partial<MlkStoreInput>) =>
  api<{ store: MlkStore }>(`/mlk/stores/${id}`, { method: "PATCH", body });
export const deleteMlkStore = (id: string) => api<{ ok: true }>(`/mlk/stores/${id}`, { method: "DELETE" });

export const listMlkInvestors = () => api<{ investors: MlkInvestor[] }>("/mlk/investors");
export const getMlkInvestor = (id: string) => api<{ investor: MlkInvestor }>(`/mlk/investors/${id}`);
export const createMlkInvestor = (body: MlkInvestorInput) => api<{ investor: MlkInvestor }>("/mlk/investors", { method: "POST", body });
export const updateMlkInvestor = (id: string, body: Partial<MlkInvestorInput>) =>
  api<{ investor: MlkInvestor }>(`/mlk/investors/${id}`, { method: "PATCH", body });
export const deleteMlkInvestor = (id: string) => api<{ ok: true }>(`/mlk/investors/${id}`, { method: "DELETE" });

export const listMlkCouples = () => api<{ couples: MlkCouple[] }>("/mlk/couples");
export const getMlkCouple = (id: string) => api<{ couple: MlkCouple }>(`/mlk/couples/${id}`);
export const createMlkCouple = (body: MlkCoupleInput) => api<{ couple: MlkCouple }>("/mlk/couples", { method: "POST", body });
export const updateMlkCouple = (id: string, body: Partial<MlkCoupleInput>) =>
  api<{ couple: MlkCouple }>(`/mlk/couples/${id}`, { method: "PATCH", body });
export const deleteMlkCouple = (id: string) => api<{ ok: true }>(`/mlk/couples/${id}`, { method: "DELETE" });

export const listMlkManagers = () => api<{ managers: MlkManager[] }>("/mlk/managers");
export const getMlkManager = (id: string) => api<{ manager: MlkManager }>(`/mlk/managers/${id}`);
export const createMlkManager = (body: MlkManagerInput) => api<{ manager: MlkManager }>("/mlk/managers", { method: "POST", body });
export const updateMlkManager = (id: string, body: Partial<MlkManagerInput>) =>
  api<{ manager: MlkManager }>(`/mlk/managers/${id}`, { method: "PATCH", body });
export const deleteMlkManager = (id: string) => api<{ ok: true }>(`/mlk/managers/${id}`, { method: "DELETE" });

export const listMlkCuisines = (query: { managerId?: string | null } = {}) => {
  const params = new URLSearchParams();
  if (query.managerId) params.set("managerId", query.managerId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return api<{ cuisines: MlkCuisine[] }>(`/mlk/cuisines${suffix}`);
};
export const createMlkCuisine = (body: MlkCuisineInput) => api<{ cuisine: MlkCuisine }>("/mlk/cuisines", { method: "POST", body });
export const updateMlkCuisine = (id: string, body: Partial<MlkCuisineInput>) =>
  api<{ cuisine: MlkCuisine }>(`/mlk/cuisines/${id}`, { method: "PATCH", body });
export const deleteMlkCuisine = (id: string) => api<{ ok: true }>(`/mlk/cuisines/${id}`, { method: "DELETE" });

export const listMlkManagerSettlements = (id: string) => api<{ settlements: MlkManagerSettlement[] }>(`/mlk/managers/${id}/settlements`);
export const previewMlkManagerSettlement = (id: string, month: string) =>
  api<MlkManagerSettlementPreview>(`/mlk/managers/${id}/settlements/preview?month=${encodeURIComponent(month)}`);
export const createMlkManagerSettlement = (body: MlkManagerSettlementInput) =>
  api<{ settlement: MlkManagerSettlement }>("/mlk/manager-settlements", { method: "POST", body });
export const updateMlkManagerSettlement = (id: string, body: Partial<MlkManagerSettlementInput>) =>
  api<{ settlement: MlkManagerSettlement }>(`/mlk/manager-settlements/${id}`, { method: "PATCH", body });
export const deleteMlkManagerSettlement = (id: string) => api<{ ok: true }>(`/mlk/manager-settlements/${id}`, { method: "DELETE" });

export const createMlkPayment = (body: MlkPaymentInput) => api<{ payment: MlkPayment }>("/mlk/payments", { method: "POST", body });
export const updateMlkPayment = (id: string, body: Partial<MlkPaymentInput>) =>
  api<{ payment: MlkPayment }>(`/mlk/payments/${id}`, { method: "PATCH", body });
export const deleteMlkPayment = (id: string) => api<{ ok: true }>(`/mlk/payments/${id}`, { method: "DELETE" });
export const listMlkInvestorPayments = (id: string) => api<{ payments: MlkPayment[] }>(`/mlk/investors/${id}/payments`);

export const listMlkCoupleLedger = (id: string) => api<{ ledger: MlkLedgerEntry[] }>(`/mlk/couples/${id}/ledger`);
export const createMlkLedgerEntry = (body: MlkLedgerInput) => api<{ ledger: MlkLedgerEntry }>("/mlk/ledger", { method: "POST", body });
export const updateMlkLedgerEntry = (id: string, body: Partial<MlkLedgerInput>) =>
  api<{ ledger: MlkLedgerEntry }>(`/mlk/ledger/${id}`, { method: "PATCH", body });
export const deleteMlkLedgerEntry = (id: string) => api<{ ok: true }>(`/mlk/ledger/${id}`, { method: "DELETE" });

export const listMlkRevenue = (storeId: string, query: { from?: string; to?: string } = {}) => {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return api<{ revenue: MlkRevenue[] }>(`/mlk/stores/${storeId}/revenue${suffix}`);
};
export const upsertMlkRevenue = (storeId: string, body: MlkRevenueInput) =>
  api<{ revenue: MlkRevenue }>(`/mlk/stores/${storeId}/revenue`, { method: "POST", body });

export const listMlkSettlements = (storeId: string) => api<{ settlements: MlkSettlement[] }>(`/mlk/stores/${storeId}/settlements`);
export const upsertMlkSettlement = (storeId: string, body: MlkSettlementInput) =>
  api<{ settlement: MlkSettlement }>(`/mlk/stores/${storeId}/settlements`, { method: "POST", body });
export const deleteMlkSettlement = (id: string) => api<{ ok: true }>(`/mlk/settlements/${id}`, { method: "DELETE" });

export const listMlkFiles = (folderId: string) => api<{ nodes: MlkFileNode[] }>(`/mlk/files/${folderId}`);
export const getMlkFilesTree = (rootId: string) => api<{ nodes: MlkFileNode[] }>(`/mlk/files/${rootId}/tree`);
export const createMlkFolder = (folderId: string, body: { name: string }) =>
  api<{ node: MlkFileNode }>(`/mlk/files/${folderId}/folder`, { method: "POST", body });
export function uploadMlkFile(folderId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return postFormData<{ node: MlkFileNode }>(`/mlk/files/${folderId}`, formData);
}
export const patchMlkFileNode = (rootId: string, id: string, body: { name?: string; parent_id?: string | null; sort_order?: number }) =>
  api<{ node: MlkFileNode }>(`/mlk/files/${rootId}/node/${id}`, { method: "PATCH", body });
export function replaceMlkFile(rootId: string, id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return postFormData<{ node: MlkFileNode }>(`/mlk/files/${rootId}/node/${id}/replace`, formData, "PUT");
}
export const deleteMlkFileNode = (id: string) => api<{ ok: true }>(`/mlk/files/node/${id}`, { method: "DELETE" });
export const mlkFileDownloadUrl = (id: string) => `/api/mlk/files/node/${id}/download`;
