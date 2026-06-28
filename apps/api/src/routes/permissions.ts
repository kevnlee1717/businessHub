import {
  db,
  employeeCompanyAccess,
  employeePermissionOverrides,
  employees
} from "@bh/db";
import { updateEmployeePermissionsSchema } from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

async function getEmployeePermissions(employeeId: string, executor: DbExecutor = db) {
  const [employee] = await executor
    .select({
      role: employees.role,
      dataScope: employees.dataScope
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    return null;
  }

  const companyRows = await executor
    .select({ companyId: employeeCompanyAccess.companyId })
    .from(employeeCompanyAccess)
    .where(eq(employeeCompanyAccess.employeeId, employeeId));
  const overrideRows = await executor
    .select({
      permission: employeePermissionOverrides.permission,
      effect: employeePermissionOverrides.effect
    })
    .from(employeePermissionOverrides)
    .where(eq(employeePermissionOverrides.employeeId, employeeId));

  return {
    role: employee.role,
    dataScope: employee.dataScope,
    companyIds: companyRows.map((row) => row.companyId),
    overrides: overrideRows
  };
}

export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/employees/:id/permissions", { preHandler: requirePerm("settings.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const permissions = await getEmployeePermissions(id);

    if (!permissions) {
      return sendNotFound(reply);
    }

    return permissions;
  });

  app.put("/employees/:id/permissions", { preHandler: requirePerm("settings.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(updateEmployeePermissionsSchema, request.body);
    const currentPermissions = await getEmployeePermissions(id);

    if (!currentPermissions) {
      return sendNotFound(reply);
    }

    if (
      (currentPermissions.role === "owner" || body.role === "owner" || body.dataScope === "all") &&
      request.user.role !== "owner"
    ) {
      return reply.code(403).send({ error: "forbidden_owner_only" });
    }

    const updated = await db.transaction(async (tx) => {
      const [employee] = await tx
        .update(employees)
        .set({
          role: body.role,
          dataScope: body.dataScope,
          updatedAt: new Date()
        })
        .where(eq(employees.id, id))
        .returning({ id: employees.id });

      if (!employee) {
        return null;
      }

      await tx.delete(employeeCompanyAccess).where(eq(employeeCompanyAccess.employeeId, id));

      const companyIds = [...new Set(body.companyIds)];

      if (companyIds.length > 0) {
        await tx.insert(employeeCompanyAccess).values(
          companyIds.map((companyId) => ({
            employeeId: id,
            companyId
          }))
        );
      }

      await tx.delete(employeePermissionOverrides).where(eq(employeePermissionOverrides.employeeId, id));

      const overridesByPermission = new Map(body.overrides.map((override) => [override.permission, override]));
      const overrides = [...overridesByPermission.values()];

      if (overrides.length > 0) {
        await tx.insert(employeePermissionOverrides).values(
          overrides.map((override) => ({
            employeeId: id,
            permission: override.permission,
            effect: override.effect
          }))
        );
      }

      return getEmployeePermissions(id, tx);
    });

    if (!updated) {
      return sendNotFound(reply);
    }

    return updated;
  });
}
