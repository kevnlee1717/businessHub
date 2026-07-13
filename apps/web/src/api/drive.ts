import { ApiError, UnauthorizedError, api } from "./client";

export const driveKeys = {
  all: ["drive"] as const,
  tree: () => ["drive", "tree"] as const
};

export type DriveNode = {
  id: string;
  parent_id: string | null;
  kind: "folder" | "file";
  name: string;
  storage_path: string | null;
  mime: string | null;
  size: number | null;
  sort_order: number;
  url: string | null;
  updated_at: string;
  created_at: string;
};

export type DrivePatchInput = {
  name?: string;
  parent_id?: string | null;
  sort_order?: number;
};

export type DriveFolderUploadResult = {
  created_folders: number;
  created_files: number;
  top_folders: unknown[];
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

export const getDriveTree = () => api<{ nodes: DriveNode[] }>("/drive/tree");

export const createFolder = (body: { parent_id: string | null; name: string }) =>
  api<{ node: DriveNode }>("/drive/folders", { method: "POST", body });

export function uploadFiles(input: { parent_id: string | null; files: File[] }) {
  const formData = new FormData();
  appendParentId(formData, input.parent_id);
  input.files.forEach((file) => formData.append("file", file));
  return postFormData<{ nodes: DriveNode[] }>("/drive/files", formData);
}

export function uploadFolder(input: { parent_id: string | null; files: File[] }) {
  const formData = new FormData();
  formData.append("parent_id", input.parent_id ?? "");
  input.files.forEach((file) => {
    const relativePath = "webkitRelativePath" in file && typeof file.webkitRelativePath === "string" ? file.webkitRelativePath : "";
    formData.append(relativePath || file.name, file);
  });
  return postFormData<DriveFolderUploadResult>("/drive/upload-folder", formData);
}

export const patchNode = (id: string, body: DrivePatchInput) =>
  api<{ node: DriveNode }>(`/drive/nodes/${id}`, { method: "PATCH", body });

export function replaceFile(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return postFormData<{ node: DriveNode }>(`/drive/nodes/${id}/replace`, formData);
}

export const deleteNode = (id: string) => api<{ ok: true }>(`/drive/nodes/${id}`, { method: "DELETE" });

export const driveDownloadUrl = (id: string) => `/api/drive/nodes/${id}/download`;
