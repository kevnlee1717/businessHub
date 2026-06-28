import { db, employees, companies, employeePermissionOverrides, employeeCompanyAccess } from "@bh/db";
import { computeEffectivePermissions, type DataScope, type Permission } from "@bh/shared";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

export type AuthContext = {
  permissions: Permission[];
  dataScope: DataScope;
  companyIds: string[] | "all";
};

export async function loadAuthContext(request: FastifyRequest): Promise<AuthContext> {
  const cached = (request as any).__authCtx as AuthContext | undefined;

  if (cached) {
    return cached;
  }

  const [employee] = await db
    .select({
      role: employees.role,
      dataScope: employees.dataScope
    })
    .from(employees)
    .where(eq(employees.id, request.user.id))
    .limit(1);

  if (!employee) {
    const emptyContext: AuthContext = {
      permissions: [],
      dataScope: "self",
      companyIds: []
    };
    (request as any).__authCtx = emptyContext;
    return emptyContext;
  }

  const overrides = await db
    .select({
      permission: employeePermissionOverrides.permission,
      effect: employeePermissionOverrides.effect
    })
    .from(employeePermissionOverrides)
    .where(eq(employeePermissionOverrides.employeeId, request.user.id));

  const permissions = computeEffectivePermissions(employee.role, overrides);
  const companyIds =
    employee.role === "owner" || employee.dataScope === "all"
      ? "all"
      : (
          await db
            .select({ companyId: employeeCompanyAccess.companyId })
            .from(employeeCompanyAccess)
            .where(eq(employeeCompanyAccess.employeeId, request.user.id))
        ).map((row) => row.companyId);

  const context: AuthContext = {
    permissions,
    dataScope: employee.dataScope,
    companyIds
  };

  (request as any).__authCtx = context;
  return context;
}

export async function getAccessibleCompanyIds(request: FastifyRequest): Promise<string[] | "all"> {
  return (await loadAuthContext(request)).companyIds;
}
