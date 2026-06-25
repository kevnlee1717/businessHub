import {
  type DocumentCategoryCreateInput,
  type DocumentCategoryUpdateInput
} from "@bh/shared";
import { api } from "./client";

export type DocumentMeta = {
  id: string;
  storage_path: string;
  filename: string;
  mime: string;
  size: number;
  uploaded_by?: string | null;
  subject_type: string;
  subject_id?: string | null;
  client_id?: string | null;
  category_id?: string | null;
  tags: string[];
  uploaded_at: string;
};

export type DocumentGroup = {
  category_id: string | null;
  documents: DocumentMeta[];
};

export type DocumentCategory = {
  id: string;
  name: string;
  name_en?: string | null;
  parent_id?: string | null;
  is_system: boolean;
  active: boolean;
  created_at: string;
};

export type DocumentSearchParams = {
  client_id?: string | null | undefined;
  subject_type?: string | null | undefined;
  subject_id?: string | null | undefined;
  category_id?: string | null | undefined;
  tag?: string | null | undefined;
  filename?: string | null | undefined;
  date_from?: string | null | undefined;
  date_to?: string | null | undefined;
};

export type UploadDocumentInput = {
  file: File;
  subject_type?: string | null | undefined;
  subject_id?: string | null | undefined;
  client_id?: string | null | undefined;
  category_id?: string | null | undefined;
  tags?: string[];
};

function appendIfPresent(formData: FormData, key: string, value?: string | null) {
  const trimmed = value?.trim();

  if (trimmed) {
    formData.append(key, trimmed);
  }
}

function queryString(params: DocumentSearchParams) {
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

export function searchDocuments(params: DocumentSearchParams = {}): Promise<{ documents: DocumentMeta[] }> {
  return api<{ documents: DocumentMeta[] }>(`/documents${queryString(params)}`);
}

export async function uploadDocument(input: UploadDocumentInput): Promise<{ document: DocumentMeta }> {
  const formData = new FormData();

  appendIfPresent(formData, "subject_type", input.subject_type);
  appendIfPresent(formData, "subject_id", input.subject_id);
  appendIfPresent(formData, "client_id", input.client_id);
  appendIfPresent(formData, "category_id", input.category_id);
  for (const tag of input.tags ?? []) {
    appendIfPresent(formData, "tags", tag);
  }
  formData.append("file", input.file);

  const response = await fetch("/api/documents", {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : response.statusText;
    throw new Error(message);
  }

  return data as { document: DocumentMeta };
}

export function getClientDocuments(clientId: string): Promise<{ groups: DocumentGroup[] }> {
  return api<{ groups: DocumentGroup[] }>(`/clients/${clientId}/documents`);
}

export function listDocumentCategories(): Promise<{ categories: DocumentCategory[] }> {
  return api<{ categories: DocumentCategory[] }>("/document-categories");
}

export function createDocumentCategory(
  body: DocumentCategoryCreateInput
): Promise<{ category: DocumentCategory }> {
  return api<{ category: DocumentCategory }>("/document-categories", {
    method: "POST",
    body
  });
}

export function updateDocumentCategory(
  id: string,
  body: DocumentCategoryUpdateInput
): Promise<{ category: DocumentCategory }> {
  return api<{ category: DocumentCategory }>(`/document-categories/${id}`, {
    method: "PATCH",
    body
  });
}

export function fileUrl(storage_path: string) {
  return `/${storage_path}`;
}
