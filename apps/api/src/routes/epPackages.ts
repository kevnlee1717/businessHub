import {
  db,
  packageCommissions,
  packageItems,
  packageMilestones,
  serviceItems,
  servicePackages
} from "@bh/db";
import {
  packageCommissionsReplaceSchema,
  packageItemIdsSchema,
  packageMilestonesReplaceSchema,
  serviceItemCreateSchema,
  serviceItemUpdateSchema,
  servicePackageCreateSchema,
  servicePackageUpdateSchema
} from "@bh/shared";
import { asc, eq, inArray } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function toRequiredNumeric(value: string | number): string {
  return String(value);
}

function toOptionalNumeric(value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function serializeServiceItem(row: typeof serviceItems.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    name_en: row.nameEn,
    category: row.category,
    default_price_sgd: row.defaultPriceSgd,
    is_core: row.isCore,
    billable: row.billable,
    active: row.active,
    sort_order: row.sortOrder
  };
}

function serializePackage(row: typeof servicePackages.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    name_en: row.nameEn,
    base_price_sgd: row.basePriceSgd,
    tagline: row.tagline,
    is_recommended: row.isRecommended,
    active: row.active,
    sort_order: row.sortOrder
  };
}

function serializePackageMilestone(row: typeof packageMilestones.$inferSelect) {
  return {
    id: row.id,
    package_id: row.packageId,
    seq: row.seq,
    label: row.label,
    label_en: row.labelEn,
    amount_sgd: row.amountSgd,
    bind_step_order: row.bindStepOrder,
    refundable_note: row.refundableNote
  };
}

function serializePackageCommission(row: typeof packageCommissions.$inferSelect) {
  return {
    id: row.id,
    package_id: row.packageId,
    target: row.target,
    basis: row.basis,
    value: row.value,
    default_party_id: row.defaultPartyId,
    note: row.note,
    created_at: row.createdAt
  };
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function hasUpdates(body: Record<string, unknown>) {
  return Object.keys(body).length > 0;
}

export async function registerEpPackageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/ep-packages/service-items", { preHandler: requirePerm("case.view") }, async () => {
    const rows = await db.select().from(serviceItems).orderBy(asc(serviceItems.sortOrder), asc(serviceItems.code));

    return { service_items: rows.map(serializeServiceItem) };
  });

  app.post("/ep-packages/service-items", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const body = parseWithSchema(serviceItemCreateSchema, request.body);
    const [item] = await db
      .insert(serviceItems)
      .values({
        code: body.code,
        name: body.name,
        nameEn: body.name_en,
        category: body.category,
        defaultPriceSgd: toRequiredNumeric(body.default_price_sgd),
        isCore: body.is_core,
        billable: body.billable,
        active: body.active,
        sortOrder: body.sort_order
      })
      .returning();

    if (!item) {
      throw new Error("service_item_create_failed");
    }

    return reply.code(201).send({ service_item: serializeServiceItem(item) });
  });

  app.patch("/ep-packages/service-items/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(serviceItemUpdateSchema, request.body);
    const [current] = await db.select().from(serviceItems).where(eq(serviceItems.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }

    if (!hasUpdates(body)) {
      return { service_item: serializeServiceItem(current) };
    }

    const [item] = await db
      .update(serviceItems)
      .set({
        name: body.name,
        nameEn: body.name_en,
        category: body.category,
        defaultPriceSgd: toOptionalNumeric(body.default_price_sgd),
        isCore: body.is_core,
        billable: body.billable,
        active: body.active,
        sortOrder: body.sort_order
      })
      .where(eq(serviceItems.id, id))
      .returning();

    if (!item) {
      throw new Error("service_item_update_failed");
    }

    return { service_item: serializeServiceItem(item) };
  });

  app.get("/ep-packages/packages", { preHandler: requirePerm("case.view") }, async () => {
    const [packages, items, milestones, commissions] = await Promise.all([
      db.select().from(servicePackages).orderBy(asc(servicePackages.sortOrder), asc(servicePackages.code)),
      db.select().from(packageItems).orderBy(asc(packageItems.id)),
      db
        .select()
        .from(packageMilestones)
        .orderBy(asc(packageMilestones.packageId), asc(packageMilestones.seq), asc(packageMilestones.id)),
      db
        .select()
        .from(packageCommissions)
        .orderBy(asc(packageCommissions.packageId), asc(packageCommissions.createdAt), asc(packageCommissions.id))
    ]);

    const itemIdsByPackage = new Map<string, string[]>();
    for (const item of items) {
      const packageItemIds = itemIdsByPackage.get(item.packageId) ?? [];
      packageItemIds.push(item.serviceItemId);
      itemIdsByPackage.set(item.packageId, packageItemIds);
    }

    const milestonesByPackage = new Map<string, Array<ReturnType<typeof serializePackageMilestone>>>();
    for (const milestone of milestones) {
      const packageMilestones = milestonesByPackage.get(milestone.packageId) ?? [];
      packageMilestones.push(serializePackageMilestone(milestone));
      milestonesByPackage.set(milestone.packageId, packageMilestones);
    }

    const commissionsByPackage = new Map<string, Array<ReturnType<typeof serializePackageCommission>>>();
    for (const commission of commissions) {
      const packageCommissionRows = commissionsByPackage.get(commission.packageId) ?? [];
      packageCommissionRows.push(serializePackageCommission(commission));
      commissionsByPackage.set(commission.packageId, packageCommissionRows);
    }

    return {
      packages: packages.map((servicePackage) => ({
        ...serializePackage(servicePackage),
        items: itemIdsByPackage.get(servicePackage.id) ?? [],
        milestones: milestonesByPackage.get(servicePackage.id) ?? [],
        commissions: commissionsByPackage.get(servicePackage.id) ?? []
      }))
    };
  });

  app.post("/ep-packages/packages", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const body = parseWithSchema(servicePackageCreateSchema, request.body);
    const [servicePackage] = await db
      .insert(servicePackages)
      .values({
        code: body.code,
        name: body.name,
        nameEn: body.name_en,
        basePriceSgd: toRequiredNumeric(body.base_price_sgd),
        tagline: body.tagline,
        isRecommended: body.is_recommended,
        active: body.active,
        sortOrder: body.sort_order
      })
      .returning();

    if (!servicePackage) {
      throw new Error("service_package_create_failed");
    }

    return reply.code(201).send({ package: serializePackage(servicePackage) });
  });

  app.patch("/ep-packages/packages/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(servicePackageUpdateSchema, request.body);
    const [current] = await db.select().from(servicePackages).where(eq(servicePackages.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }

    if (!hasUpdates(body)) {
      return { package: serializePackage(current) };
    }

    const [servicePackage] = await db
      .update(servicePackages)
      .set({
        name: body.name,
        nameEn: body.name_en,
        basePriceSgd: toOptionalNumeric(body.base_price_sgd),
        tagline: body.tagline,
        isRecommended: body.is_recommended,
        active: body.active,
        sortOrder: body.sort_order
      })
      .where(eq(servicePackages.id, id))
      .returning();

    if (!servicePackage) {
      throw new Error("service_package_update_failed");
    }

    return { package: serializePackage(servicePackage) };
  });

  app.put("/ep-packages/packages/:id/items", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const serviceItemIds = uniqueIds(parseWithSchema(packageItemIdsSchema, request.body));

    const result = await db.transaction(async (tx) => {
      const [servicePackage] = await tx.select().from(servicePackages).where(eq(servicePackages.id, id)).limit(1);

      if (!servicePackage) {
        return null;
      }

      if (serviceItemIds.length > 0) {
        const existingItems = await tx
          .select({ id: serviceItems.id })
          .from(serviceItems)
          .where(inArray(serviceItems.id, serviceItemIds));
        const existingIds = new Set(existingItems.map((item) => item.id));
        const missingIds = serviceItemIds.filter((serviceItemId) => !existingIds.has(serviceItemId));

        if (missingIds.length > 0) {
          return { error: "unknown_service_item_ids" as const };
        }
      }

      await tx.delete(packageItems).where(eq(packageItems.packageId, id));

      if (serviceItemIds.length > 0) {
        await tx.insert(packageItems).values(
          serviceItemIds.map((serviceItemId) => ({
            packageId: id,
            serviceItemId
          }))
        );
      }

      return { serviceItemIds };
    });

    if (!result) {
      return sendNotFound(reply);
    }

    if ("error" in result) {
      return reply.code(422).send({ error: result.error });
    }

    return { package_id: id, items: result.serviceItemIds };
  });

  app.put("/ep-packages/packages/:id/milestones", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(packageMilestonesReplaceSchema, request.body);

    const milestones = await db.transaction(async (tx) => {
      const [servicePackage] = await tx.select().from(servicePackages).where(eq(servicePackages.id, id)).limit(1);

      if (!servicePackage) {
        return null;
      }

      await tx.delete(packageMilestones).where(eq(packageMilestones.packageId, id));

      if (body.length === 0) {
        return [];
      }

      return tx
        .insert(packageMilestones)
        .values(
          body.map((milestone) => ({
            packageId: id,
            seq: milestone.seq,
            label: milestone.label,
            labelEn: milestone.label_en,
            amountSgd: toRequiredNumeric(milestone.amount_sgd),
            bindStepOrder: milestone.bind_step_order,
            refundableNote: milestone.refundable_note
          }))
        )
        .returning();
    });

    if (!milestones) {
      return sendNotFound(reply);
    }

    return { package_id: id, milestones: milestones.map(serializePackageMilestone) };
  });

  app.put("/ep-packages/packages/:id/commissions", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(packageCommissionsReplaceSchema, request.body);

    const commissions = await db.transaction(async (tx) => {
      const [servicePackage] = await tx.select().from(servicePackages).where(eq(servicePackages.id, id)).limit(1);

      if (!servicePackage) {
        return null;
      }

      await tx.delete(packageCommissions).where(eq(packageCommissions.packageId, id));

      if (body.length === 0) {
        return [];
      }

      return tx
        .insert(packageCommissions)
        .values(
          body.map((commission) => ({
            packageId: id,
            target: commission.target,
            basis: commission.basis,
            value: toRequiredNumeric(commission.value),
            defaultPartyId: commission.default_party_id,
            note: commission.note
          }))
        )
        .returning();
    });

    if (!commissions) {
      return sendNotFound(reply);
    }

    return { package_id: id, commissions: commissions.map(serializePackageCommission) };
  });
}
