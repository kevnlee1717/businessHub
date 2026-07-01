import { z } from "zod";
import { franchiseInterestLevels, franchiseServices } from "../enums";

const uuidField = z.string().uuid();
const dateTimeString = z.string().datetime();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();

export const kioskVisitCreateSchema = z.object({
  property_id: uuidField,
  by_employee_id: uuidField,
  visited_at: dateTimeString,
  interest_level: z.enum(franchiseInterestLevels).nullable().optional(),
  note: nullableOptionalText,
  services_pitched: z.array(z.enum(franchiseServices)).optional(),
  survey: z.object({
    interested_services: z.array(z.enum(franchiseServices)).optional(),
    details: z.record(z.unknown()).nullable().optional()
  }).optional()
});

export type KioskVisitCreateInput = z.infer<typeof kioskVisitCreateSchema>;
