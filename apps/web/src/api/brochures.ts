import {
  type BrochureCategoryCreateInput,
  type BrochureCategoryUpdateInput,
  type BrochureCreateInput,
  type BrochureIndustryCreateInput,
  type BrochureIndustryUpdateInput,
  type BrochureUpdateInput
} from "@bh/shared";
import { ApiError, UnauthorizedError, api } from "./client";

export const brochureKeys = {
  all: ["brochures"] as const,
  industries: () => ["brochures", "industries"] as const,
  categories: () => ["brochures", "categories"] as const,
  list: (params?: unknown) => ["brochures", "list", params] as const,
  versions: (id: string) => ["brochures", id, "versions"] as const
};

export type BrochureDictionary = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type BrochureVersion = {
  id: string;
  brochure_id: string;
  version_no: number;
  note?: string | null;
  filename: string;
  storage_path: string;
  url: string | null;
  mime?: string | null;
  size?: number | null;
  uploaded_by?: string | null;
  uploaded_at: string;
};

export type Brochure = {
  id: string;
  name: string;
  industry_id?: string | null;
  category_id?: string | null;
  notes?: string | null;
  current_version_id?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  industry_name?: string | null;
  category_name?: string | null;
  current_version?: BrochureVersion | null;
  current_version_no?: number | null;
  current_filename?: string | null;
  current_uploaded_at?: string | null;
  current_mime?: string | null;
  current_storage_path?: string | null;
  current_url?: string | null;
};

export type BrochureListParams = {
  industry_id?: string | null | undefined;
  category_id?: string | null | undefined;
  q?: string | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

export type BrochureUploadInput = BrochureCreateInput & {
  file: File;
};

export type BrochureVersionUploadInput = {
  file: File;
  note?: string | null | undefined;
  set_current?: boolean | undefined;
};

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

function errorMessage(data: unknown, fallback: string) {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

function qs(params: Record<string, unknown> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const out = search.toString();
  return out ? `?${out}` : "";
}

function appendFormValue(formData: FormData, key: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  formData.append(key, String(value));
}

async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  const data = await parseResponse(response);

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.statusText), response.status);
  }

  return data as T;
}

export const listBrochureIndustries = () => api<{ industries: BrochureDictionary[] }>("/brochure-industries");
export const createBrochureIndustry = (body: BrochureIndustryCreateInput) =>
  api<{ industry: BrochureDictionary }>("/brochure-industries", { method: "POST", body });
export const updateBrochureIndustry = (id: string, body: BrochureIndustryUpdateInput) =>
  api<{ industry: BrochureDictionary }>(`/brochure-industries/${id}`, { method: "PATCH", body });
export const deleteBrochureIndustry = (id: string) => api<{ ok: true }>(`/brochure-industries/${id}`, { method: "DELETE" });

export const listBrochureCategories = () => api<{ categories: BrochureDictionary[] }>("/brochure-categories");
export const createBrochureCategory = (body: BrochureCategoryCreateInput) =>
  api<{ category: BrochureDictionary }>("/brochure-categories", { method: "POST", body });
export const updateBrochureCategory = (id: string, body: BrochureCategoryUpdateInput) =>
  api<{ category: BrochureDictionary }>(`/brochure-categories/${id}`, { method: "PATCH", body });
export const deleteBrochureCategory = (id: string) => api<{ ok: true }>(`/brochure-categories/${id}`, { method: "DELETE" });

export const listBrochures = (params: BrochureListParams = {}) =>
  api<{ brochures: Brochure[]; total?: number; page?: number; page_size?: number }>(`/brochures${qs(params)}`);
export const updateBrochure = (id: string, body: BrochureUpdateInput) =>
  api<{ brochure: Brochure }>(`/brochures/${id}`, { method: "PATCH", body });
export const deleteBrochure = (id: string) => api<{ ok: true }>(`/brochures/${id}`, { method: "DELETE" });

export function createBrochure(input: BrochureUploadInput) {
  const formData = new FormData();
  appendFormValue(formData, "name", input.name);
  appendFormValue(formData, "industry_id", input.industry_id);
  appendFormValue(formData, "category_id", input.category_id);
  appendFormValue(formData, "notes", input.notes);
  appendFormValue(formData, "sort_order", input.sort_order);
  formData.append("file", input.file);
  return postFormData<{ brochure: Brochure }>("/brochures", formData);
}

export const listBrochureVersions = (brochureId: string) =>
  api<{ versions: BrochureVersion[] }>(`/brochures/${brochureId}/versions`);

export function uploadBrochureVersion(brochureId: string, input: BrochureVersionUploadInput) {
  const formData = new FormData();
  appendFormValue(formData, "note", input.note);
  appendFormValue(formData, "set_current", input.set_current);
  formData.append("file", input.file);
  return postFormData<{ version: BrochureVersion }>(`/brochures/${brochureId}/versions`, formData);
}

export const setBrochureCurrentVersion = (brochureId: string, versionId: string) =>
  api<{ brochure: Brochure; current_version: BrochureVersion }>(`/brochures/${brochureId}/current`, {
    method: "PATCH",
    body: { version_id: versionId }
  });

export const deleteBrochureVersion = (brochureId: string, versionId: string) =>
  api<{ ok: true; current_version_id: string | null }>(`/brochures/${brochureId}/versions/${versionId}`, { method: "DELETE" });
