import {
  type IcaStats,
  type BusinessType,
  type CaseCreateInput,
  type CaseSubmissionCreateInput,
  type CaseSubmissionResult,
  type CaseSubmissionUpdateInput,
  type CaseStatus,
  type CaseStepDocCreateInput,
  type CaseStepDocStatus,
  type CaseStepDocUpdateInput,
  type CaseStepStatus,
  type CaseStepUpdateInput,
  type CaseUpdateInput,
  type ClientCreateInput,
  type ClientUpdateInput,
  type FollowUpCreateInput,
  type Gender,
  type GuarantorCreateInput,
  type GuarantorUpdateInput,
  type RequiredDocItemInput,
  type Role,
  type StepReviewAction,
  type StepReviewMessageInput,
  type StepReviewRequestInput,
  type StepReviewStatus,
  type TemplateStepCreateInput,
  type TemplateStepUpdateInput,
  type WorkflowTemplateCreateInput,
  type WorkflowTemplateUpdateInput
} from "@bh/shared";
import { api } from "./client";

export type Client = {
  id: string;
  name: string;
  name_en?: string | null;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowTemplate = {
  id: string;
  business_type: BusinessType;
  name: string;
  created_at: string;
};

export type TemplateStep = {
  id: string;
  template_id: string;
  step_order: number;
  name: string;
  name_en?: string | null;
  description?: string | null;
  required_documents: RequiredDocItemInput[];
  collections: { collection_item_id: string; required?: boolean }[];
  default_assignee_role?: Role | null;
  created_at: string;
};

export type Case = {
  id: string;
  business_type: BusinessType;
  parent_case_id?: string | null;
  client_id?: string | null;
  current_step?: number | null;
  status: CaseStatus;
  billing_id?: string | null;
  package_id?: string | null;
  fee_scheme_version_id?: string | null;
  guarantor_id?: string | null;
  guarantor_name?: string | null;
  guarantor_relation?: string | null;
  guarantor_contact?: string | null;
  signed_at?: string | null;
  created_at: string;
  updated_at: string;
  latest_result?: "pending" | "approved" | "rejected" | null;
  latest_rejected_at?: string | null;
  latest_submission_at?: string | null;
  first_submission_at?: string | null;
  last_submission_at?: string | null;
};

export type CaseOrderBy = "signed_at" | "created_at";
export type SortOrder = "asc" | "desc";

export type CaseStats = {
  year: number;
  business_type: BusinessType | null;
  months: { month: number; count: number }[];
  total: number;
  available_years: number[];
  summary: {
    year_totals: { year: number; count: number }[];
    result_counts: { approved: number; pending: number; rejected: number };
  };
};

export type Guarantor = {
  id: string;
  name: string;
  nric?: string | null;
  gender?: Gender | null;
  age?: number | null;
  id_card_document_id?: string | null;
  is_client_own?: boolean;
  note?: string | null;
  sponsored_count: number;
  stats?: { total: number; approved: number; rejected: number; successRate: number | null; firstAt: string | null; lastAt: string | null };
  created_at: string;
  updated_at: string;
};

export type UploadedDocument = {
  id: string;
  filename: string;
  storage_path?: string;
  mime?: string | null;
  size?: number | null;
};

export type SubmissionFile = {
  id: string;
  filename: string;
  storage_path: string;
  mime?: string | null;
};

export type CaseSubmission = {
  id: string;
  case_id: string;
  submitted_at?: string | null;
  result: CaseSubmissionResult;
  rejected_at?: string | null;
  note?: string | null;
  screenshot_document?: SubmissionFile | null;
  appeal_document?: SubmissionFile | null;
  attachment_documents?: SubmissionFile[];
  created_at: string;
};

export type CaseStepDoc = {
  id: string;
  case_step_id: string;
  doc_name: string;
  doc_name_en?: string | null;
  is_required: boolean;
  status: CaseStepDocStatus;
  category_id?: string | null;
  document_id?: string | null;
  document_ids: string[];
  files?: { id: string; filename: string; storage_path: string }[];
  created_at?: string;
  updated_at?: string;
};

export type CaseStep = {
  id: string;
  case_id: string;
  step_order: number;
  name: string;
  name_en?: string | null;
  description?: string | null;
  assignee_id?: string | null;
  status: CaseStepStatus;
  reviewer_id?: string | null;
  review_status: StepReviewStatus;
  meta?: Record<string, unknown> | null;
  completed_at?: string | null;
  documents: CaseStepDoc[];
  reviews?: StepReview[];
  created_at?: string;
  updated_at?: string;
};

export type StepReview = {
  id: string;
  case_step_id: string;
  author_id?: string | null;
  action: StepReviewAction;
  content?: string | null;
  document_ids: string[];
  files: { id: string; filename: string; storage_path: string }[];
  created_at: string;
};

export type FollowUp = {
  id: string;
  case_step_id: string;
  author_id?: string | null;
  content: string;
  content_zh?: string | null;
  content_en?: string | null;
  source_lang?: "zh" | "en" | null;
  created_at: string;
};

type PaginationParams = {
  page?: number | undefined;
  page_size?: number | undefined;
};

type PaginatedResponse = {
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

function paginationQuery(params: PaginationParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listClients(params: PaginationParams = {}): Promise<{ clients: Client[] } & PaginatedResponse> {
  return api<{ clients: Client[] } & PaginatedResponse>(`/clients${paginationQuery(params)}`);
}

export function createClient(body: ClientCreateInput): Promise<{ client: Client }> {
  return api<{ client: Client }>("/clients", {
    method: "POST",
    body
  });
}

export function updateClient(id: string, body: ClientUpdateInput): Promise<{ client: Client }> {
  return api<{ client: Client }>(`/clients/${id}`, {
    method: "PATCH",
    body
  });
}

export function listGuarantors(
  params: PaginationParams = {}
): Promise<{ guarantors: Guarantor[] } & PaginatedResponse> {
  return api<{ guarantors: Guarantor[] } & PaginatedResponse>(`/guarantors${paginationQuery(params)}`);
}

export function createGuarantor(body: GuarantorCreateInput): Promise<{ guarantor: Guarantor }> {
  return api<{ guarantor: Guarantor }>("/guarantors", {
    method: "POST",
    body
  });
}

export function updateGuarantor(id: string, body: GuarantorUpdateInput): Promise<{ guarantor: Guarantor }> {
  return api<{ guarantor: Guarantor }>(`/guarantors/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteGuarantor(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/guarantors/${id}`, {
    method: "DELETE"
  });
}

export async function uploadGuarantorIdCard(
  id: string,
  file: File
): Promise<{ guarantor: Guarantor; document: UploadedDocument }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/guarantors/${id}/id-card`, {
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

  return data as { guarantor: Guarantor; document: UploadedDocument };
}

export function getGuarantor(id: string): Promise<{
  guarantor: Guarantor & {
    cases: {
      id: string;
      business_type: BusinessType;
      client_id?: string | null;
      parent_case_id?: string | null;
      current_step?: number | null;
      status: CaseStatus;
      created_at: string;
      updated_at: string;
      latest_result?: "pending" | "approved" | "rejected" | null;
      client_name?: string | null;
    }[];
  };
}> {
  return api<{
    guarantor: Guarantor & {
      cases: {
        id: string;
        business_type: BusinessType;
        client_id?: string | null;
        parent_case_id?: string | null;
        current_step?: number | null;
        status: CaseStatus;
        created_at: string;
        updated_at: string;
        latest_result?: "pending" | "approved" | "rejected" | null;
        client_name?: string | null;
      }[];
    };
  }>(`/guarantors/${id}`);
}

export function listTemplates(
  business_type?: BusinessType,
  params: PaginationParams = {}
): Promise<{ templates: WorkflowTemplate[] } & PaginatedResponse> {
  const searchParams = new URLSearchParams();

  if (business_type) {
    searchParams.set("business_type", business_type);
  }

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }

  const query = searchParams.toString();
  return api<{ templates: WorkflowTemplate[] } & PaginatedResponse>(
    `/workflow-templates${query ? `?${query}` : ""}`
  );
}

export function getTemplate(id: string): Promise<{ template: WorkflowTemplate; steps: TemplateStep[] }> {
  return api<{ template: WorkflowTemplate; steps: TemplateStep[] }>(`/workflow-templates/${id}`);
}

export function createTemplate(
  body: WorkflowTemplateCreateInput
): Promise<{ template: WorkflowTemplate }> {
  return api<{ template: WorkflowTemplate }>("/workflow-templates", {
    method: "POST",
    body
  });
}

export function updateTemplate(
  id: string,
  body: WorkflowTemplateUpdateInput
): Promise<{ template: WorkflowTemplate }> {
  return api<{ template: WorkflowTemplate }>(`/workflow-templates/${id}`, {
    method: "PATCH",
    body
  });
}

export function createTemplateStep(
  templateId: string,
  body: TemplateStepCreateInput
): Promise<{ step: TemplateStep }> {
  return api<{ step: TemplateStep }>(`/workflow-templates/${templateId}/steps`, {
    method: "POST",
    body
  });
}

export function updateTemplateStep(
  stepId: string,
  body: TemplateStepUpdateInput
): Promise<{ step: TemplateStep }> {
  return api<{ step: TemplateStep }>(`/template-steps/${stepId}`, {
    method: "PATCH",
    body
  });
}

export function deleteTemplateStep(stepId: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/template-steps/${stepId}`, {
    method: "DELETE"
  });
}

export function listCases(params: {
  business_type?: BusinessType | undefined;
  status?: CaseStatus | undefined;
  status_in?: string | undefined;
  client_id?: string | undefined;
  parent_case_id?: string | undefined;
  signed_month?: string | undefined;
  order_by?: CaseOrderBy | undefined;
  order?: SortOrder | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
} = {}): Promise<{ cases: Case[]; total?: number; page?: number; page_size?: number }> {
  const searchParams = new URLSearchParams();

  if (params.business_type) {
    searchParams.set("business_type", params.business_type);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  if (params.status_in) {
    searchParams.set("status_in", params.status_in);
  }

  if (params.client_id) {
    searchParams.set("client_id", params.client_id);
  }

  if (params.parent_case_id) {
    searchParams.set("parent_case_id", params.parent_case_id);
  }

  if (params.signed_month) {
    searchParams.set("signed_month", params.signed_month);
  }

  if (params.order_by) {
    searchParams.set("order_by", params.order_by);
  }

  if (params.order) {
    searchParams.set("order", params.order);
  }

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }

  const query = searchParams.toString();
  return api<{ cases: Case[]; total?: number; page?: number; page_size?: number }>(
    `/cases${query ? `?${query}` : ""}`
  );
}

export function getCaseStats(params: {
  year?: number | undefined;
  business_type?: BusinessType | undefined;
} = {}): Promise<CaseStats> {
  const searchParams = new URLSearchParams();

  if (params.year) {
    searchParams.set("year", String(params.year));
  }

  if (params.business_type) {
    searchParams.set("business_type", params.business_type);
  }

  const query = searchParams.toString();
  return api<CaseStats>(`/cases/stats${query ? `?${query}` : ""}`);
}

export function getCase(id: string): Promise<{
  case: Case;
  steps: CaseStep[];
  children: Case[];
  guarantor: Guarantor | null;
  submissions: CaseSubmission[];
}> {
  return api<{
    case: Case;
    steps: CaseStep[];
    children: Case[];
    guarantor: Guarantor | null;
    submissions: CaseSubmission[];
  }>(`/cases/${id}`);
}

export function createCase(body: CaseCreateInput): Promise<{ case: Case }> {
  return api<{ case: Case }>("/cases", {
    method: "POST",
    body
  });
}

export function updateCase(id: string, body: CaseUpdateInput): Promise<{ case: Case }> {
  return api<{ case: Case }>(`/cases/${id}`, {
    method: "PATCH",
    body
  });
}

export function updateCaseStep(stepId: string, body: CaseStepUpdateInput): Promise<{ step: CaseStep }> {
  return api<{ step: CaseStep }>(`/case-steps/${stepId}`, {
    method: "PATCH",
    body
  });
}

export function requestStepReview(
  stepId: string,
  body: StepReviewRequestInput
): Promise<{ step: CaseStep; review: StepReview }> {
  return api<{ step: CaseStep; review: StepReview }>(`/case-steps/${stepId}/review/request`, {
    method: "POST",
    body
  });
}

export async function postStepReviewMessage(
  stepId: string,
  body: StepReviewMessageInput & { files?: File[] }
): Promise<{ step: CaseStep; review: StepReview }> {
  const formData = new FormData();
  formData.append("action", body.action);
  if (body.content) {
    formData.append("content", body.content);
  }
  for (const file of body.files ?? []) {
    formData.append("file", file);
  }

  const response = await fetch(`/api/case-steps/${stepId}/review/messages`, {
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

  return data as { step: CaseStep; review: StepReview };
}

export function createSubmission(
  caseId: string,
  body: CaseSubmissionCreateInput
): Promise<{ submission: CaseSubmission }> {
  return api<{ submission: CaseSubmission }>(`/cases/${caseId}/submissions`, {
    method: "POST",
    body
  });
}

export function updateSubmission(
  id: string,
  body: CaseSubmissionUpdateInput
): Promise<{ submission: CaseSubmission }> {
  return api<{ submission: CaseSubmission }>(`/case-submissions/${id}`, {
    method: "PATCH",
    body
  });
}

export async function uploadSubmissionFiles(
  submissionId: string,
  files: { screenshot?: File | null; appeal?: File | null; attachments?: File[] }
): Promise<{ submission: CaseSubmission }> {
  const formData = new FormData();
  if (files.screenshot) {
    formData.append("screenshot", files.screenshot);
  }
  if (files.appeal) {
    formData.append("appeal", files.appeal);
  }
  for (const file of files.attachments ?? []) {
    formData.append("attachment", file);
  }

  const response = await fetch(`/api/case-submissions/${submissionId}/files`, {
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

  return data as { submission: CaseSubmission };
}

export function createGuarantorPayout(
  caseId: string,
  billingId: string
): Promise<{ ok: true; created: boolean }> {
  return api<{ ok: true; created: boolean }>(`/cases/${caseId}/guarantor-payout`, {
    method: "POST",
    body: { billing_id: billingId }
  });
}

export function createCaseStepDoc(
  stepId: string,
  body: CaseStepDocCreateInput
): Promise<{ document: CaseStepDoc }> {
  return api<{ document: CaseStepDoc }>(`/case-steps/${stepId}/documents`, {
    method: "POST",
    body
  });
}

export function updateCaseStepDoc(
  docId: string,
  body: CaseStepDocUpdateInput
): Promise<CaseStepDoc> {
  return api<CaseStepDoc>(`/case-step-documents/${docId}`, {
    method: "PATCH",
    body
  });
}

export function deleteCaseStepDoc(docId: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/case-step-documents/${docId}`, {
    method: "DELETE"
  });
}

export async function uploadCaseStepDoc(
  docId: string,
  files: File[]
): Promise<{ case_step_document: CaseStepDoc; documents: UploadedDocument[] }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("file", file);
  }

  const response = await fetch(`/api/case-step-documents/${docId}/upload`, {
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

  return data as { case_step_document: CaseStepDoc; documents: UploadedDocument[] };
}

export function removeCaseStepDocFile(docId: string, documentId: string): Promise<{ document: CaseStepDoc }> {
  return api<{ document: CaseStepDoc }>(`/case-step-documents/${docId}/files/${documentId}`, {
    method: "DELETE"
  });
}

export function listFollowUps(stepId: string): Promise<{ followUps: FollowUp[] }> {
  return api<{ followUps: FollowUp[] }>(`/case-steps/${stepId}/follow-ups`);
}

export function createFollowUp(stepId: string, content: string): Promise<{ followUp: FollowUp }> {
  const body: FollowUpCreateInput = { content };

  return api<{ followUp: FollowUp }>(`/case-steps/${stepId}/follow-ups`, {
    method: "POST",
    body
  });
}

export function getIcaStats(): Promise<IcaStats> {
  return api<IcaStats>("/cases/ica-stats");
}

export type GuarantorSummary = {
  guarantorCount: number;
  sponsoredTotal: number;
  approved: number;
  rejected: number;
  successRate: number | null;
};

export function getGuarantorSummary(): Promise<{ summary: GuarantorSummary }> {
  return api<{ summary: GuarantorSummary }>("/guarantors/stats");
}
