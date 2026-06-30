import { ApiError, UnauthorizedError } from "./client";

export const epPriceFileSlots = ["price_list", "unit_price", "faq"] as const;
export type EpPriceFileSlot = (typeof epPriceFileSlots)[number];

export type EpPriceFile = {
  slot: EpPriceFileSlot;
  filename: string | null;
  storage_path: string | null;
  url: string | null;
  updated_at: string | null;
  updated_by: string | null;
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

export async function listEpPriceFiles(): Promise<{ files: EpPriceFile[] }> {
  const response = await fetch("/api/ep-price-files", {
    credentials: "include"
  });
  const data = await parseResponse(response);

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.statusText), response.status);
  }

  return data as { files: EpPriceFile[] };
}

export async function uploadEpPriceFile(
  slot: EpPriceFileSlot,
  file: File
): Promise<{ file: EpPriceFile }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/ep-price-files/${slot}`, {
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

  return data as { file: EpPriceFile };
}
