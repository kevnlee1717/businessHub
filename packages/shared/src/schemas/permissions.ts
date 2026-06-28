import { z } from "zod";
import { dataScopes, permissionEffects, roles } from "../enums";
import { permissions } from "../permissions";

export const updateEmployeePermissionsSchema = z.object({
  role: z.enum(roles),
  dataScope: z.enum(dataScopes),
  companyIds: z.array(z.string().uuid()),
  overrides: z.array(
    z.object({
      permission: z.enum(permissions),
      effect: z.enum(permissionEffects)
    })
  )
});

export type UpdateEmployeePermissionsInput = z.infer<typeof updateEmployeePermissionsSchema>;
