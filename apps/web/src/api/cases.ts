import {
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
  guarantor_id?: string | null;
  guarantor_name?: string | null;
  guarantor_relation?: string | null;
  guarantor_contact?: string | null;
  created_at: string;
  updated_at: string;
};

export type Guarantor = {
  id: string;
  name: string;
  nric?: string | null;
  gender?: Gender | null;
  age?: number | null;
  id_card_document_id?: string | null;
  note?: string | null;
  sponsored_count: number;
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

export type CaseSubmission = {
  id: string;
  case_id: string;
  submitted_at?: string | null;
  result: CaseSubmissionResult;
  rejected_at?: string | null;
  note?: string | null;
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
  created_at: string;
};

export function listClients(): Promise<{ clients: Client[] }> {
  return api<{ clients: Client[] }>("/clients");
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

export function listGuarantors(): Promise<{ guarantors: Guarantor[] }> {
  return api<{ guarantors: Guarantor[] }>("/guarantors");
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

export function listTemplates(business_type?: BusinessType): Promise<{ templates: WorkflowTemplate[] }> {
  const searchParams = new URLSearchParams();

  if (business_type) {
    searchParams.set("business_type", business_type);
  }

  const query = searchParams.toString();
  return api<{ templates: WorkflowTemplate[] }>(`/workflow-templates${query ? `?${query}` : ""}`);
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
  client_id?: string | undefined;
  parent_case_id?: string | undefined;
} = {}): Promise<{ cases: Case[] }> {
  const searchParams = new URLSearchParams();

  if (params.business_type) {
    searchParams.set("business_type", params.business_type);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  if (params.client_id) {
    searchParams.set("client_id", params.client_id);
  }

  if (params.parent_case_id) {
    searchParams.set("parent_case_id", params.parent_case_id);
  }

  const query = searchParams.toString();
  return api<{ cases: Case[] }>(`/cases${query ? `?${query}` : ""}`);
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
