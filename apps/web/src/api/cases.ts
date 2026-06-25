import {
  type BusinessType,
  type ClientCreateInput,
  type ClientUpdateInput,
  type RequiredDocItemInput,
  type Role,
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
  default_assignee_role?: Role | null;
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
