import { type IpadSlideUpdateInput } from "@bh/shared";
import { ApiError, UnauthorizedError, api } from "./client";

export const ipadSlideKeys = {
  all: ["ipad-slides"] as const,
  list: () => ["ipad-slides", "list"] as const
};

export type IpadSlide = {
  id: string;
  company_id: string;
  title: string;
  filename: string;
  storage_path: string;
  url: string;
  mime?: string | null;
  size?: number | null;
  sort_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type IpadSlideUploadInput = {
  title: string;
  file: File;
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

export const listIpadSlides = () => api<{ slides: IpadSlide[] }>("/ipad-slides");

export function uploadIpadSlide(input: IpadSlideUploadInput) {
  const formData = new FormData();
  formData.append("title", input.title);
  formData.append("file", input.file);
  return postFormData<{ slide: IpadSlide }>("/ipad-slides", formData);
}

export const updateIpadSlide = (id: string, body: IpadSlideUpdateInput) =>
  api<{ slide: IpadSlide }>(`/ipad-slides/${id}`, { method: "PATCH", body });

export const deleteIpadSlide = (id: string) =>
  api<{ ok: true }>(`/ipad-slides/${id}`, { method: "DELETE" });
