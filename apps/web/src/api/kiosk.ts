import { type FranchiseInterestLevel, type FranchisePropertyType, type FranchiseService } from "@bh/shared";
import { api } from "./client";

export type KioskSlide = {
  id: string;
  title: string;
  url: string;
  thumb_url: string | null;
  sort_order: number;
};

export type KioskProperty = {
  id: string;
  name: string;
  address?: string | null;
  property_type: FranchisePropertyType;
};

export type KioskEmployee = {
  id: string;
  name: string;
};

export type KioskVisitPayload = {
  property_id: string;
  by_employee_id: string;
  visited_at: string;
  interest_level: FranchiseInterestLevel;
  note: string | null;
  services_pitched: FranchiseService[];
  survey: {
    interested_services: FranchiseService[];
    details: Record<string, unknown>;
  };
};

export const kioskKeys = {
  slides: ["kiosk", "slides"] as const,
  properties: ["kiosk", "properties"] as const,
  employees: ["kiosk", "employees"] as const
};

export const listKioskSlides = () => api<{ slides: KioskSlide[] }>("/kiosk/slides");
export const listKioskProperties = () => api<{ properties: KioskProperty[] }>("/kiosk/properties");
export const listKioskEmployees = () => api<{ employees: KioskEmployee[] }>("/kiosk/employees");
export const createKioskVisit = (body: KioskVisitPayload) =>
  api<{ visit: { id: string } }>("/kiosk/visits", { method: "POST", body });
