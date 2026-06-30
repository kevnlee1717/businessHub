import {
  type CollectionItemCreateInput,
  type CollectionItemUpdateInput,
  type SchemeLineRecurrence
} from "@bh/shared";
import { api } from "./client";

type PaginationParams = {
  page?: number | undefined;
  page_size?: number | undefined;
};

type PaginationMeta = {
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

export type CollectionItem = {
  id: string;
  code: string;
  name: string;
  name_en?: string | null;
  default_recurrence?: SchemeLineRecurrence | null;
  active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
};

export function getCollectionItems(
  params: PaginationParams = {}
): Promise<{ collection_items: CollectionItem[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }

  const query = searchParams.toString();
  return api<{ collection_items: CollectionItem[] } & PaginationMeta>(
    `/collection-items${query ? `?${query}` : ""}`
  );
}

export function createCollectionItem(
  body: CollectionItemCreateInput
): Promise<{ collection_item: CollectionItem }> {
  return api<{ collection_item: CollectionItem }>("/collection-items", {
    method: "POST",
    body
  });
}

export function updateCollectionItem(
  id: string,
  body: CollectionItemUpdateInput
): Promise<{ collection_item: CollectionItem }> {
  return api<{ collection_item: CollectionItem }>(`/collection-items/${id}`, {
    method: "PATCH",
    body
  });
}
