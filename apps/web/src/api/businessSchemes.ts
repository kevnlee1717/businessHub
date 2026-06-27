import {
  type BusinessCreateInput,
  type BusinessStatus,
  type BusinessUpdateInput,
  type Currency,
  type DealInputsInput,
  type DealPartyCreateInput,
  type DealPartyUpdateInput,
  type SchemeLineBasis,
  type SchemeLineInputSchema,
  type SchemeLineKind,
  type SchemeLineRecurrence,
  type SchemeVersionCreateInput,
  type SchemeVersionStatus,
  type SchemeVersionUpdateInput
} from "@bh/shared";
import { api } from "./client";

export type VersionBrief = {
  id: string;
  label: string;
  status: SchemeVersionStatus;
  effective_from?: string | null;
  effective_to?: string | null;
  profit_rate?: string | null;
};

export type Business = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  name_en?: string | null;
  category?: string | null;
  status: BusinessStatus;
  currency?: Currency | null;
  default_version_id?: string | null;
  sort_order?: number | null;
  note?: string | null;
  created_at: string;
  default_version?: VersionBrief | null;
  profit_rate?: string | null;
  scheme_versions?: VersionBrief[];
};

export type DealParty = {
  id: string;
  code: string;
  name: string;
  name_en?: string | null;
  active: boolean;
  is_system: boolean;
  created_at: string;
};

export type SchemeLine = {
  id: string;
  version_id: string;
  sort_order?: number | null;
  kind: SchemeLineKind;
  basis: SchemeLineBasis;
  recurrence: SchemeLineRecurrence;
  party_id?: string | null;
  rate?: string | null;
  unit_label?: string | null;
  input_key?: string | null;
  milestone_split?: Record<string, number> | null;
  label: string;
  note?: string | null;
  created_at: string;
};

export type SchemeVersion = VersionBrief & {
  business_id: string;
  assumed_inputs?: Record<string, unknown> | null;
  note?: string | null;
  created_at: string;
  lines?: SchemeLine[];
};

export type RecurrenceTotals = {
  revenue: number;
  cost: number;
  commission: number;
  profit: number;
};

export type DealEconomics = {
  per_line: {
    scheme_line_id?: string | null;
    kind: SchemeLineKind;
    recurrence: SchemeLineRecurrence;
    party_id?: string | null;
    label?: string | null;
    amount_per_period: string;
    periods_count: number | null;
    amount_total_expected: string | null;
  }[];
  totals: {
    per_recurrence: Record<SchemeLineRecurrence, RecurrenceTotals>;
    expected: RecurrenceTotals;
    profit: number;
    profit_rate: number;
    has_open_ended: boolean;
  };
};

function queryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) {
      searchParams.set(key, trimmed);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listBusinesses(params: { company_id?: string | null } = {}): Promise<{ businesses: Business[] }> {
  return api<{ businesses: Business[] }>(`/businesses${queryString(params)}`);
}

export function getBusiness(id: string): Promise<{ business: Business }> {
  return api<{ business: Business }>(`/businesses/${id}`);
}

export function createBusiness(body: BusinessCreateInput): Promise<{ business: Business }> {
  return api<{ business: Business }>("/businesses", {
    method: "POST",
    body
  });
}

export function updateBusiness(id: string, body: BusinessUpdateInput): Promise<{ business: Business }> {
  return api<{ business: Business }>(`/businesses/${id}`, {
    method: "PATCH",
    body
  });
}

export function listSchemeVersions(businessId: string): Promise<{ scheme_versions: SchemeVersion[] }> {
  return api<{ scheme_versions: SchemeVersion[] }>(`/businesses/${businessId}/scheme-versions`);
}

export function createSchemeVersion(
  businessId: string,
  body: SchemeVersionCreateInput
): Promise<{ scheme_version: SchemeVersion }> {
  return api<{ scheme_version: SchemeVersion }>(`/businesses/${businessId}/scheme-versions`, {
    method: "POST",
    body
  });
}

export function getSchemeVersion(id: string): Promise<{ scheme_version: SchemeVersion }> {
  return api<{ scheme_version: SchemeVersion }>(`/scheme-versions/${id}`);
}

export function updateSchemeVersion(
  id: string,
  body: SchemeVersionUpdateInput
): Promise<{ scheme_version: SchemeVersion }> {
  return api<{ scheme_version: SchemeVersion }>(`/scheme-versions/${id}`, {
    method: "PATCH",
    body
  });
}

export function createSchemeLine(
  versionId: string,
  body: SchemeLineInputSchema
): Promise<{ scheme_line: SchemeLine }> {
  return api<{ scheme_line: SchemeLine }>(`/scheme-versions/${versionId}/lines`, {
    method: "POST",
    body
  });
}

export function updateSchemeLine(
  id: string,
  body: Partial<SchemeLineInputSchema>
): Promise<{ scheme_line: SchemeLine }> {
  return api<{ scheme_line: SchemeLine }>(`/scheme-lines/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteSchemeLine(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/scheme-lines/${id}`, {
    method: "DELETE"
  });
}

export function previewSchemeVersion(id: string, body: DealInputsInput): Promise<{ economics: DealEconomics }> {
  return api<{ economics: DealEconomics }>(`/scheme-versions/${id}/preview`, {
    method: "POST",
    body
  });
}

export function listDealParties(): Promise<{ deal_parties: DealParty[] }> {
  return api<{ deal_parties: DealParty[] }>("/deal-parties");
}

export function createDealParty(body: DealPartyCreateInput): Promise<{ deal_party: DealParty }> {
  return api<{ deal_party: DealParty }>("/deal-parties", {
    method: "POST",
    body
  });
}

export function updateDealParty(id: string, body: DealPartyUpdateInput): Promise<{ deal_party: DealParty }> {
  return api<{ deal_party: DealParty }>(`/deal-parties/${id}`, {
    method: "PATCH",
    body
  });
}
