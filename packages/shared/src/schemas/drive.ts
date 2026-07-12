import { z } from "zod";

const uuidField = z.string().uuid();
const nullableUuid = z.preprocess((value) => (value === "" ? null : value), uuidField.nullable());

export const driveTreeQuery = z.object({}).nullish();

export const folderCreateSchema = z.object({
  parent_id: nullableUuid.optional().default(null),
  name: z.string().trim().min(1)
});

export const nodePatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    parent_id: nullableUuid.optional(),
    sort_order: z.coerce.number().int().optional()
  })
  .refine((value) => value.name !== undefined || value.parent_id !== undefined || value.sort_order !== undefined, {
    message: "At least one field is required"
  });

export const idParams = z.object({
  id: uuidField
});

export type DriveTreeQuery = z.infer<typeof driveTreeQuery>;
export type FolderCreateInput = z.infer<typeof folderCreateSchema>;
export type NodePatchInput = z.infer<typeof nodePatchSchema>;
export type IdParams = z.infer<typeof idParams>;
