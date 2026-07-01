import {
  type PackageMilestoneInput,
  type ServiceCategory,
  type ServiceItemCreateInput,
  type ServiceItemUpdateInput,
  type ServicePackageCreateInput,
  type ServicePackageUpdateInput
} from "@bh/shared";
import { api } from "./client";

export type ServiceItem = {
  id: string;
  code: string;
  name: string;
  name_en: string;
  category: ServiceCategory;
  default_price_sgd: string;
  is_core: boolean;
  billable: boolean;
  active: boolean;
  sort_order: number;
};

export type PackageMilestone = {
  id: string;
  package_id: string;
  seq: number;
  label: string;
  label_en: string;
  amount_sgd: string;
  bind_step_order?: number | null;
  refundable_note?: string | null;
};

export type ServicePackage = {
  id: string;
  code: string;
  name: string;
  name_en: string;
  base_price_sgd: string;
  tagline?: string | null;
  is_recommended: boolean;
  active: boolean;
  sort_order: number;
};

export type ServicePackageWithDetails = ServicePackage & {
  items: string[];
  milestones: PackageMilestone[];
};

export function listPackages(): Promise<{ packages: ServicePackageWithDetails[] }> {
  return api<{ packages: ServicePackageWithDetails[] }>("/ep-packages/packages");
}

export function listServiceItems(): Promise<{ service_items: ServiceItem[] }> {
  return api<{ service_items: ServiceItem[] }>("/ep-packages/service-items");
}

export function createServiceItem(body: ServiceItemCreateInput): Promise<{ service_item: ServiceItem }> {
  return api<{ service_item: ServiceItem }>("/ep-packages/service-items", { method: "POST", body });
}

export function updateServiceItem(
  id: string,
  body: ServiceItemUpdateInput
): Promise<{ service_item: ServiceItem }> {
  return api<{ service_item: ServiceItem }>(`/ep-packages/service-items/${id}`, { method: "PATCH", body });
}

export function createPackage(body: ServicePackageCreateInput): Promise<{ package: ServicePackage }> {
  return api<{ package: ServicePackage }>("/ep-packages/packages", { method: "POST", body });
}

export function updatePackage(
  id: string,
  body: ServicePackageUpdateInput
): Promise<{ package: ServicePackage }> {
  return api<{ package: ServicePackage }>(`/ep-packages/packages/${id}`, { method: "PATCH", body });
}

export function setPackageItems(id: string, serviceItemIds: string[]): Promise<{ package_id: string; items: string[] }> {
  return api<{ package_id: string; items: string[] }>(`/ep-packages/packages/${id}/items`, {
    method: "PUT",
    body: serviceItemIds
  });
}

export function setPackageMilestones(
  id: string,
  milestones: PackageMilestoneInput[]
): Promise<{ package_id: string; milestones: PackageMilestone[] }> {
  return api<{ package_id: string; milestones: PackageMilestone[] }>(`/ep-packages/packages/${id}/milestones`, {
    method: "PUT",
    body: milestones
  });
}
