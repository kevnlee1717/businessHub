import { z } from "zod";
import { permissionEffects } from "../enums";
import { permissions } from "../permissions";

export const updateEmployeePermissionsSchema = z.object({
  positionId: z.string().uuid(),
  companyIds: z.array(z.string().uuid()),
  overrides: z.array(
    z.object({
      permission: z.enum(permissions),
      effect: z.enum(permissionEffects)
    })
  )
});

export type UpdateEmployeePermissionsInput = z.infer<typeof updateEmployeePermissionsSchema>;
