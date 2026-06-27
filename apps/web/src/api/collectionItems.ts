import {
  type CollectionItemCreateInput,
  type CollectionItemUpdateInput,
  type SchemeLineRecurrence
} from "@bh/shared";
import { api } from "./client";

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

export function getCollectionItems(): Promise<{ collection_items: CollectionItem[] }> {
  return api<{ collection_items: CollectionItem[] }>("/collection-items");
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
