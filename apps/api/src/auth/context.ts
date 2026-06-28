import {
  billing,
  cases,
  db,
  employees,
  employeeCompanyAccess,
  employeePermissionOverrides,
  positions,
  salesBusinessAssignments
} from "@bh/db";
import {
  allPermissions,
  computeEffectivePermissionsFromBase,
  type DataScope,
  type Permission
} from "@bh/shared";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
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
      positionPermissions: positions.permissions,
      positionDataScope: positions.dataScope,
      positionIsSystem: positions.isSystem
    })
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id))
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

  const basePermissions = employee.positionIsSystem
    ? allPermissions
    : (employee.positionPermissions ?? []).filter((permission): permission is Permission =>
        allPermissions.includes(permission as Permission)
      );
  const dataScope = employee.positionDataScope ?? "self";
  const permissions = computeEffectivePermissionsFromBase(basePermissions, overrides);
  const companyIds =
    employee.positionIsSystem || dataScope === "all"
      ? "all"
      : (
          await db
            .select({ companyId: employeeCompanyAccess.companyId })
            .from(employeeCompanyAccess)
            .where(eq(employeeCompanyAccess.employeeId, request.user.id))
        ).map((row) => row.companyId);

  const context: AuthContext = {
    permissions,
    dataScope,
    companyIds
  };

  (request as any).__authCtx = context;
  return context;
}

export async function getAccessibleCompanyIds(request: FastifyRequest): Promise<string[] | "all"> {
  return (await loadAuthContext(request)).companyIds;
}

export async function ctxCan(request: FastifyRequest, perm: Permission): Promise<boolean> {
  return (await loadAuthContext(request)).permissions.includes(perm);
}

export function companyFilter(companyIds: string[] | "all", column: any): SQL | undefined {
  if (companyIds === "all") {
    return undefined;
  }

  if (companyIds.length === 0) {
    return sql`false`;
  }

  return inArray(column, companyIds);
}

export async function getVisibleCaseIds(userId: string): Promise<string[]> {
  const assignedBusinesses = await db
    .select({ businessId: salesBusinessAssignments.businessId })
    .from(salesBusinessAssignments)
    .where(and(eq(salesBusinessAssignments.salesId, userId), eq(salesBusinessAssignments.active, true)));
  const assignedBusinessIds = assignedBusinesses.map((assignment) => assignment.businessId);
  const filters: SQL[] = [eq(billing.salesId, userId)];

  if (assignedBusinessIds.length > 0) {
    filters.push(inArray(billing.businessId, assignedBusinessIds));
  }

  const rows = await db
    .select({ id: cases.id })
    .from(cases)
    .leftJoin(billing, eq(cases.billingId, billing.id))
    .where(or(...filters));

  return rows.map((row) => row.id);
}
