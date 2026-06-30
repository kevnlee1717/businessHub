import {
  type CompanyExpenseCreateInput,
  type CompanyExpenseUpdateInput,
  type ContractCreateInput,
  type ContractUpdateInput,
  type ContractVersionUpdateInput,
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
  page?: number | undefined;
  page_size?: number | undefined;
};

export type UploadDocumentInput = {
  file: File;
  subject_type?: string | null | undefined;
  subject_id?: string | null | undefined;
  client_id?: string | null | undefined;
  category_id?: string | null | undefined;
  tags?: string[];
};

export type CompanyExpense = {
  id: string;
  company_id: string;
  type: string;
  amount: string;
  currency: string;
  period?: string | null;
  paid_at?: string | null;
  note?: string | null;
  document_id?: string | null;
  created_at: string;
};

export type ExpenseSummary = {
  total: string;
  by_period: { period: string | null; total: string }[];
  by_type: { type: string; total: string }[];
};

export type Contract = {
  id: string;
  subject_type: string;
  subject_id?: string | null;
  title: string;
  party_info?: string | null;
  status: string;
  current_version_no: number;
  created_at: string;
  updated_at: string;
};

export type ContractVersion = {
  id: string;
  contract_id: string;
  version_no: number;
  document_id?: string | null;
  status: string;
  note?: string | null;
  created_by?: string | null;
  created_at: string;
};

export type CompanyExpenseListParams = {
  company_id?: string | null | undefined;
  period?: string | null | undefined;
  type?: string | null | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

export type ContractListParams = {
  subject_type?: string | null | undefined;
  subject_id?: string | null | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

export type PaginationMeta = {
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

export type UploadContractVersionInput = {
  file: File;
  note?: string | null | undefined;
  status?: string | null | undefined;
};

function appendIfPresent(formData: FormData, key: string, value?: string | null) {
  const trimmed = value?.trim();

  if (trimmed) {
    formData.append(key, trimmed);
  }
}

function queryString(params: object) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "number") {
      searchParams.set(key, String(value));
      return;
    }

    const trimmed = typeof value === "string" ? value.trim() : "";

    if (trimmed) {
      searchParams.set(key, trimmed);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function searchDocuments(
  params: DocumentSearchParams = {}
): Promise<{ documents: DocumentMeta[] } & PaginationMeta> {
  return api<{ documents: DocumentMeta[] } & PaginationMeta>(`/documents${queryString(params)}`);
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

export function getClientDocuments(
  clientId: string,
  params: { page?: number | undefined; page_size?: number | undefined } = {}
): Promise<{ groups: DocumentGroup[] } & PaginationMeta> {
  return api<{ groups: DocumentGroup[] } & PaginationMeta>(
    `/clients/${clientId}/documents${queryString(params)}`
  );
}

export function listDocumentCategories(
  params: { page?: number | undefined; page_size?: number | undefined } = {}
): Promise<{ categories: DocumentCategory[] } & PaginationMeta> {
  return api<{ categories: DocumentCategory[] } & PaginationMeta>(
    `/document-categories${queryString(params)}`
  );
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

export function listCompanyExpenses(
  params: CompanyExpenseListParams = {}
): Promise<{ expenses: CompanyExpense[] } & PaginationMeta> {
  return api<{ expenses: CompanyExpense[] } & PaginationMeta>(`/company-expenses${queryString(params)}`);
}

export function createCompanyExpense(
  body: CompanyExpenseCreateInput
): Promise<{ expense: CompanyExpense }> {
  return api<{ expense: CompanyExpense }>("/company-expenses", {
    method: "POST",
    body
  });
}

export function updateCompanyExpense(
  id: string,
  body: CompanyExpenseUpdateInput
): Promise<{ expense: CompanyExpense }> {
  return api<{ expense: CompanyExpense }>(`/company-expenses/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteCompanyExpense(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/company-expenses/${id}`, {
    method: "DELETE"
  });
}

export function getExpenseSummary(companyId: string): Promise<ExpenseSummary> {
  return api<ExpenseSummary>(`/companies/${companyId}/expenses/summary`);
}

export function listContracts(params: ContractListParams = {}): Promise<{ contracts: Contract[] } & PaginationMeta> {
  return api<{ contracts: Contract[] } & PaginationMeta>(`/contracts${queryString(params)}`);
}

export function getContract(id: string): Promise<{ contract: Contract; versions: ContractVersion[] }> {
  return api<{ contract: Contract; versions: ContractVersion[] }>(`/contracts/${id}`);
}

export function createContract(body: ContractCreateInput): Promise<{ contract: Contract }> {
  return api<{ contract: Contract }>("/contracts", {
    method: "POST",
    body
  });
}

export function updateContract(id: string, body: ContractUpdateInput): Promise<{ contract: Contract }> {
  return api<{ contract: Contract }>(`/contracts/${id}`, {
    method: "PATCH",
    body
  });
}

export async function uploadContractVersion(
  contractId: string,
  input: UploadContractVersionInput
): Promise<{ version: ContractVersion; document: DocumentMeta }> {
  const formData = new FormData();

  appendIfPresent(formData, "note", input.note);
  appendIfPresent(formData, "status", input.status);
  formData.append("file", input.file);

  const response = await fetch(`/api/contracts/${contractId}/versions`, {
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

  return data as { version: ContractVersion; document: DocumentMeta };
}

export function updateContractVersion(
  versionId: string,
  body: ContractVersionUpdateInput
): Promise<{ version: ContractVersion }> {
  return api<{ version: ContractVersion }>(`/contract-versions/${versionId}`, {
    method: "PATCH",
    body
  });
}

export function fileUrl(storage_path: string) {
  return `/${storage_path}`;
}
