import {
  db,
  employeeCompanyAccess,
  employeePermissionOverrides,
  employees,
  positions
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
      positionId: employees.positionId,
      dataScope: positions.dataScope,
      positionIsSystem: positions.isSystem
    })
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id))
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
    positionId: employee.positionId,
    dataScope: employee.dataScope ?? "self",
    positionIsSystem: employee.positionIsSystem ?? false,
    companyIds: companyRows.map((row) => row.companyId),
    overrides: overrideRows
  };
}

async function employeeHasSystemPosition(employeeId: string, executor: DbExecutor = db): Promise<boolean> {
  const [employee] = await executor
    .select({ isSystem: positions.isSystem })
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  return employee?.isSystem ?? false;
}

export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/employees/:id/permissions", { preHandler: requirePerm("settings.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const permissions = await getEmployeePermissions(id);

    if (!permissions) {
      return sendNotFound(reply);
    }

    return {
      positionId: permissions.positionId,
      dataScope: permissions.dataScope,
      companyIds: permissions.companyIds,
      overrides: permissions.overrides
    };
  });

  app.put("/employees/:id/permissions", { preHandler: requirePerm("settings.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(updateEmployeePermissionsSchema, request.body);
    const currentPermissions = await getEmployeePermissions(id);

    if (!currentPermissions) {
      return sendNotFound(reply);
    }

    const requesterIsSystem = await employeeHasSystemPosition(request.user.id);
    const [nextPosition] = await db
      .select({ id: positions.id, isSystem: positions.isSystem })
      .from(positions)
      .where(eq(positions.id, body.positionId))
      .limit(1);

    if (!nextPosition) {
      return reply.code(400).send({ error: "position_not_found" });
    }

    if ((currentPermissions.positionIsSystem || nextPosition.isSystem) && !requesterIsSystem) {
      return reply.code(403).send({ error: "forbidden_owner_only" });
    }

    const updated = await db.transaction(async (tx) => {
      const [employee] = await tx
        .update(employees)
        .set({
          positionId: body.positionId,
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

    return {
      positionId: updated.positionId,
      dataScope: updated.dataScope,
      companyIds: updated.companyIds,
      overrides: updated.overrides
    };
  });
}
