import { ApiError, UnauthorizedError, api } from "./client";
import { type DriveFolderUploadResult, type DriveNode, type DrivePatchInput } from "./drive";

export const caseFilesKeys = {
  all: ["caseFiles"] as const,
  tree: (caseId: string) => ["caseFiles", caseId, "tree"] as const
};

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function errorMessage(data: unknown, fallback: string) {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

function appendParentId(formData: FormData, parentId: string | null) {
  if (parentId) {
    formData.append("parent_id", parentId);
  }
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

export const ensureCaseFilesRoot = (caseId: string) =>
  api<{ drive_folder_id: string }>(`/cases/${caseId}/files/ensure-root`, { method: "POST" });

export const getCaseFilesTree = (caseId: string) => api<{ nodes: DriveNode[] }>(`/cases/${caseId}/files/tree`);

export const createCaseFolder = (caseId: string, body: { parent_id: string | null; name: string }) =>
  api<{ node: DriveNode }>(`/cases/${caseId}/files/folders`, { method: "POST", body });

export function uploadCaseFiles(caseId: string, input: { parent_id: string | null; files: File[] }) {
  const formData = new FormData();
  appendParentId(formData, input.parent_id);
  input.files.forEach((file) => formData.append("file", file));
  return postFormData<{ nodes: DriveNode[] }>(`/cases/${caseId}/files/upload`, formData);
}

export function uploadCaseFolder(caseId: string, input: { parent_id: string | null; files: File[] }) {
  const formData = new FormData();
  appendParentId(formData, input.parent_id);
  input.files.forEach((file) => {
    const relativePath = "webkitRelativePath" in file && typeof file.webkitRelativePath === "string" ? file.webkitRelativePath : "";
    formData.append(relativePath || file.name, file);
  });
  return postFormData<DriveFolderUploadResult>(`/cases/${caseId}/files/upload-folder`, formData);
}

export const patchCaseFileNode = (caseId: string, nodeId: string, body: DrivePatchInput) =>
  api<{ node: DriveNode }>(`/cases/${caseId}/files/nodes/${nodeId}`, { method: "PATCH", body });

export function replaceCaseFile(caseId: string, nodeId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return postFormData<{ node: DriveNode }>(`/cases/${caseId}/files/nodes/${nodeId}/replace`, formData);
}

export const deleteCaseFileNode = (caseId: string, nodeId: string) =>
  api<{ ok: true }>(`/cases/${caseId}/files/nodes/${nodeId}`, { method: "DELETE" });

export const caseFileDownloadUrl = (caseId: string, nodeId: string) => `/api/cases/${caseId}/files/nodes/${nodeId}/download`;
