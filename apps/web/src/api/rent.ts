import { type RentLocationCreateInput, type RentLocationUpdateInput } from "@bh/shared";
import { api } from "./client";

export type RentLocation = {
  id: string;
  name: string;
  address?: string | null;
  lat?: string | null;
  lng?: string | null;
  landlord_name?: string | null;
  lease_start?: string | null;
  lease_months?: number | null;
  monthly_rent?: string | null;
  deposit?: string | null;
  currency: string;
  note?: string | null;
  sort_order: number;
  created_at: string;
  file_count: number;
};

export type RentFile = {
  id: string;
  period?: string | null;
  doc_tag?: string | null;
  paid_at?: string | null;
  note?: string | null;
  document_id: string;
  filename: string;
  storage_path: string;
  mime: string;
  uploaded_at: string;
};

export type UploadRentFileInput = {
  file: File;
  location_id: string;
  period?: string | null;
  doc_tag?: string | null;
  paid_at?: string | null;
  note?: string | null;
};

export function listRentLocations(): Promise<{ locations: RentLocation[] }> {
  return api<{ locations: RentLocation[] }>("/rent/locations");
}

export function createRentLocation(body: RentLocationCreateInput): Promise<{ location: RentLocation }> {
  return api<{ location: RentLocation }>("/rent/locations", { method: "POST", body });
}

export function updateRentLocation(id: string, body: RentLocationUpdateInput): Promise<{ location: RentLocation }> {
  return api<{ location: RentLocation }>(`/rent/locations/${id}`, { method: "PATCH", body });
}

export function deleteRentLocation(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/rent/locations/${id}`, { method: "DELETE" });
}

export function listRentFiles(locationId: string): Promise<{ files: RentFile[] }> {
  return api<{ files: RentFile[] }>(`/rent/locations/${locationId}/files`);
}

export function deleteRentFile(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/rent/files/${id}`, { method: "DELETE" });
}

function appendIfPresent(formData: FormData, key: string, value?: string | null) {
  const trimmed = value?.trim();
  if (trimmed) {
    formData.append(key, trimmed);
  }
}

export async function uploadRentFile(input: UploadRentFileInput): Promise<{ file: RentFile }> {
  const formData = new FormData();
  appendIfPresent(formData, "location_id", input.location_id);
  appendIfPresent(formData, "period", input.period);
  appendIfPresent(formData, "doc_tag", input.doc_tag);
  appendIfPresent(formData, "paid_at", input.paid_at);
  appendIfPresent(formData, "note", input.note);
  formData.append("file", input.file);

  const response = await fetch("/api/rent/files", { method: "POST", body: formData, credentials: "include" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : response.statusText;
    throw new Error(message);
  }
  return data as { file: RentFile };
}
