import {
  type FranchiseContractExpiry,
  type FranchiseDecisionMaker,
  type FranchiseFootfall,
  type FranchiseInterestLevel,
  type FranchiseOrgType,
  type FranchisePriority,
  type FranchisePropertyType,
  type FranchiseService,
  type FranchiseSiteStatus,
  type FranchiseTriState
} from "@bh/shared";
import { api } from "./client";

export const franchiseKeys = {
  all: ["franchise"] as const,
  kpi: (params?: unknown) => ["franchise", "kpi", params] as const,
  orgs: (params?: unknown) => ["franchise", "orgs", params] as const,
  contacts: (params?: unknown) => ["franchise", "contacts", params] as const,
  properties: (params?: unknown) => ["franchise", "properties", params] as const,
  propertyVisits: (id: string, params?: unknown) => ["franchise", "properties", id, "visits", params] as const,
  fnbSites: (params?: unknown) => ["franchise", "fnb-sites", params] as const,
  fnbVisits: (id: string, params?: unknown) => ["franchise", "fnb-sites", id, "visits", params] as const,
  visits: (params?: unknown) => ["franchise", "visits", params] as const
};

export type FranchiseOrg = {
  id: string;
  company_id: string;
  name: string;
  type: FranchiseOrgType;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseContact = {
  id: string;
  company_id: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  org_id?: string | null;
  org?: FranchiseOrg | null;
  referred_by_contact_id?: string | null;
  next_visit_at?: string | null;
  owner_id?: string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseProperty = {
  id: string;
  company_id: string;
  name: string;
  property_type: FranchisePropertyType;
  address?: string | null;
  org_id?: string | null;
  is_vending_site: boolean;
  vending_note?: string | null;
  introduced_by_contact_id?: string | null;
  relationship_note?: string | null;
  priority: FranchisePriority;
  footfall?: FranchiseFootfall | null;
  decision_maker?: FranchiseDecisionMaker | null;
  has_public_space?: FranchiseTriState | null;
  status: FranchiseSiteStatus;
  owner_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type FranchisePropertySurvey = {
  id: string;
  company_id: string;
  visit_id: string;
  interested_services?: FranchiseService[] | null;
  details?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseFnbSurvey = {
  id: string;
  company_id: string;
  visit_id: string;
  rent_fixed?: string | null;
  rent_revenue_share_pct?: string | null;
  management_fee?: string | null;
  dishwash_fee?: string | null;
  contract_expiry?: FranchiseContractExpiry | null;
  extra?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type FranchisePropertyVisit = {
  id: string;
  type: "property";
  company_id: string;
  property_id: string;
  contact_id?: string | null;
  by_employee_id: string;
  visited_at: string;
  interest_level: FranchiseInterestLevel;
  services_pitched?: FranchiseService[] | null;
  result?: string | null;
  note?: string | null;
  survey?: FranchisePropertySurvey | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseFnbSite = {
  id: string;
  company_id: string;
  name: string;
  org_id?: string | null;
  location?: string | null;
  has_aircon?: boolean | null;
  introduced_by_contact_id?: string | null;
  relationship_note?: string | null;
  priority: FranchisePriority;
  status: FranchiseSiteStatus;
  owner_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseFnbVisit = {
  id: string;
  type: "fnb";
  company_id: string;
  site_id: string;
  contact_id?: string | null;
  by_employee_id: string;
  visited_at: string;
  interest_level: FranchiseInterestLevel;
  result?: string | null;
  note?: string | null;
  survey?: FranchiseFnbSurvey | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseVisit = FranchisePropertyVisit | FranchiseFnbVisit;

export type FranchiseKpi = {
  visit_volume: { employee_id: string; employee_name?: string | null; count: number }[];
  site_coverage: {
    total: number;
    property_total: number;
    fnb_total: number;
    visited: number;
    pending: number;
    vending_sites: number;
    vending_ratio: number;
  };
  survey_collection: {
    total: number;
    by_employee: { employee_id: string; employee_name?: string | null; count: number }[];
  };
  interest_funnel: {
    high_interest_sites: number;
    won_sites: number;
  };
  due_contacts: FranchiseContact[];
};

function qs(params: Record<string, unknown> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const out = search.toString();
  return out ? `?${out}` : "";
}

export const listFranchiseOrgs = (params: Record<string, unknown> = {}) =>
  api<{ orgs: FranchiseOrg[] }>(`/franchise/orgs${qs(params)}`);
export const createFranchiseOrg = (body: unknown) =>
  api<{ org: FranchiseOrg }>("/franchise/orgs", { method: "POST", body });
export const updateFranchiseOrg = (id: string, body: unknown) =>
  api<{ org: FranchiseOrg }>(`/franchise/orgs/${id}`, { method: "PATCH", body });
export const deleteFranchiseOrg = (id: string) => api<null>(`/franchise/orgs/${id}`, { method: "DELETE" });

export const listFranchiseContacts = (params: Record<string, unknown> = {}) =>
  api<{ contacts: FranchiseContact[] }>(`/franchise/contacts${qs(params)}`);
export const createFranchiseContact = (body: unknown) =>
  api<{ contact: FranchiseContact }>("/franchise/contacts", { method: "POST", body });
export const updateFranchiseContact = (id: string, body: unknown) =>
  api<{ contact: FranchiseContact }>(`/franchise/contacts/${id}`, { method: "PATCH", body });
export const deleteFranchiseContact = (id: string) => api<null>(`/franchise/contacts/${id}`, { method: "DELETE" });

export const listFranchiseProperties = (params: Record<string, unknown> = {}) =>
  api<{ properties: FranchiseProperty[] }>(`/franchise/properties${qs(params)}`);
export const createFranchiseProperty = (body: unknown) =>
  api<{ property: FranchiseProperty }>("/franchise/properties", { method: "POST", body });
export const updateFranchiseProperty = (id: string, body: unknown) =>
  api<{ property: FranchiseProperty }>(`/franchise/properties/${id}`, { method: "PATCH", body });
export const deleteFranchiseProperty = (id: string) => api<null>(`/franchise/properties/${id}`, { method: "DELETE" });

export const listFranchisePropertyVisits = (propertyId: string, params: Record<string, unknown> = {}) =>
  api<{ visits: FranchisePropertyVisit[] }>(`/franchise/properties/${propertyId}/visits${qs(params)}`);
export const createFranchisePropertyVisit = (propertyId: string, body: unknown) =>
  api<{ visit: FranchisePropertyVisit }>(`/franchise/properties/${propertyId}/visits`, { method: "POST", body });

export const listFranchiseFnbSites = (params: Record<string, unknown> = {}) =>
  api<{ sites: FranchiseFnbSite[]; fnb_sites?: FranchiseFnbSite[] }>(`/franchise/fnb-sites${qs(params)}`);
export const createFranchiseFnbSite = (body: unknown) =>
  api<{ site: FranchiseFnbSite }>("/franchise/fnb-sites", { method: "POST", body });
export const updateFranchiseFnbSite = (id: string, body: unknown) =>
  api<{ site: FranchiseFnbSite }>(`/franchise/fnb-sites/${id}`, { method: "PATCH", body });
export const deleteFranchiseFnbSite = (id: string) => api<null>(`/franchise/fnb-sites/${id}`, { method: "DELETE" });

export const listFranchiseFnbVisits = (siteId: string, params: Record<string, unknown> = {}) =>
  api<{ visits: FranchiseFnbVisit[] }>(`/franchise/fnb-sites/${siteId}/visits${qs(params)}`);
export const createFranchiseFnbVisit = (siteId: string, body: unknown) =>
  api<{ visit: FranchiseFnbVisit }>(`/franchise/fnb-sites/${siteId}/visits`, { method: "POST", body });

export const listFranchiseVisits = (params: Record<string, unknown> = {}) =>
  api<{ visits: FranchiseVisit[] }>(`/franchise/visits${qs(params)}`);
export const getFranchiseKpi = (params: Record<string, unknown> = {}) =>
  api<{ kpi: FranchiseKpi }>(`/franchise/kpi${qs(params)}`);
