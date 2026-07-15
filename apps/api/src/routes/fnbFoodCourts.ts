import { db, fnbFoodCourts, type FnbFoodCourtFixedFees } from "@bh/db";
import { fnbFoodCourtCreateSchema, fnbFoodCourtIdParams, fnbFoodCourtUpdateSchema } from "@bh/shared";
import { desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema, sendNotFound } from "./hrUtils";

type FnbFoodCourtRow = typeof fnbFoodCourts.$inferSelect;
type LooseFixedFees = {
  cleaning?: number | undefined;
  maintenance?: number | undefined;
  pos?: number | undefined;
  subscription?: number | undefined;
  bank?: number | undefined;
  legal?: number | undefined;
  other?: number | undefined;
};

function numberValue(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function numericValue(value: number): string {
  return String(value);
}

function fixedFeesValue(value: LooseFixedFees | null): FnbFoodCourtFixedFees | null {
  if (value === null) return null;
  return {
    cleaning: value.cleaning ?? 0,
    maintenance: value.maintenance ?? 0,
    pos: value.pos ?? 0,
    subscription: value.subscription ?? 0,
    bank: value.bank ?? 0,
    legal: value.legal ?? 0,
    other: value.other ?? 0
  };
}

function serializeFoodCourt(row: FnbFoodCourtRow) {
  return {
    id: row.id,
    name: row.name,
    stall: row.stall,
    brand: row.brand,
    notes: row.notes,
    rent_pct: numberValue(row.rentPct),
    min_rent: numberValue(row.minRent),
    adv_pct: numberValue(row.advPct),
    mdr_pct: numberValue(row.mdrPct),
    fixed_fees: row.fixedFees,
    entrance_total: numberValue(row.entranceTotal),
    entrance_months: row.entranceMonths,
    food_pct: Number(row.foodPct),
    gst_pct: Number(row.gstPct),
    include_gst: row.includeGst,
    salary: Number(row.salary),
    investor_floor: Number(row.investorFloor),
    profit_target: Number(row.profitTarget),
    tiers: row.tiers,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

type FoodCourtBody = {
  name?: string | undefined;
  stall?: string | null | undefined;
  brand?: string | null | undefined;
  notes?: string | null | undefined;
  rent_pct?: number | undefined;
  min_rent?: number | undefined;
  adv_pct?: number | undefined;
  mdr_pct?: number | undefined;
  fixed_fees?: LooseFixedFees | null | undefined;
  entrance_total?: number | undefined;
  entrance_months?: number | undefined;
  food_pct?: number | undefined;
  gst_pct?: number | undefined;
  include_gst?: boolean | undefined;
  salary?: number | undefined;
  investor_floor?: number | undefined;
  profit_target?: number | undefined;
  tiers?: number[] | undefined;
};

function foodCourtValues(body: FoodCourtBody) {
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.stall !== undefined ? { stall: body.stall } : {}),
    ...(body.brand !== undefined ? { brand: body.brand } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.rent_pct !== undefined ? { rentPct: numericValue(body.rent_pct) } : {}),
    ...(body.min_rent !== undefined ? { minRent: numericValue(body.min_rent) } : {}),
    ...(body.adv_pct !== undefined ? { advPct: numericValue(body.adv_pct) } : {}),
    ...(body.mdr_pct !== undefined ? { mdrPct: numericValue(body.mdr_pct) } : {}),
    ...(body.fixed_fees !== undefined ? { fixedFees: fixedFeesValue(body.fixed_fees) } : {}),
    ...(body.entrance_total !== undefined ? { entranceTotal: numericValue(body.entrance_total) } : {}),
    ...(body.entrance_months !== undefined ? { entranceMonths: body.entrance_months } : {}),
    ...(body.food_pct !== undefined ? { foodPct: numericValue(body.food_pct) } : {}),
    ...(body.gst_pct !== undefined ? { gstPct: numericValue(body.gst_pct) } : {}),
    ...(body.include_gst !== undefined ? { includeGst: body.include_gst } : {}),
    ...(body.salary !== undefined ? { salary: numericValue(body.salary) } : {}),
    ...(body.investor_floor !== undefined ? { investorFloor: numericValue(body.investor_floor) } : {}),
    ...(body.profit_target !== undefined ? { profitTarget: numericValue(body.profit_target) } : {}),
    ...(body.tiers !== undefined ? { tiers: body.tiers } : {})
  };
}

export async function registerFnbFoodCourtRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/fnb-food-courts", { preHandler: requirePerm("franchise.view") }, async () => {
    const rows = await db.select().from(fnbFoodCourts).orderBy(desc(fnbFoodCourts.updatedAt), desc(fnbFoodCourts.createdAt));
    return { food_courts: rows.map(serializeFoodCourt) };
  });

  app.get("/fnb-food-courts/:id", { preHandler: requirePerm("franchise.view") }, async (request, reply) => {
    const { id } = parseWithSchema(fnbFoodCourtIdParams, request.params);
    const [row] = await db.select().from(fnbFoodCourts).where(eq(fnbFoodCourts.id, id)).limit(1);
    if (!row) return sendNotFound(reply);
    return { food_court: serializeFoodCourt(row) };
  });

  app.post("/fnb-food-courts", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const body = parseWithSchema(fnbFoodCourtCreateSchema, request.body);
    const [row] = await db
      .insert(fnbFoodCourts)
      .values({
        ...foodCourtValues(body),
        name: body.name,
        createdBy: request.user.id,
        updatedAt: new Date()
      })
      .returning();
    if (!row) throw new Error("fnb_food_court_create_failed");
    return reply.code(201).send({ food_court: serializeFoodCourt(row) });
  });

  app.patch("/fnb-food-courts/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(fnbFoodCourtIdParams, request.params);
    const body = parseWithSchema(fnbFoodCourtUpdateSchema, request.body);
    const [row] = await db
      .update(fnbFoodCourts)
      .set({
        ...foodCourtValues(body),
        updatedAt: new Date()
      })
      .where(eq(fnbFoodCourts.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    return { food_court: serializeFoodCourt(row) };
  });

  app.delete("/fnb-food-courts/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(fnbFoodCourtIdParams, request.params);
    const [row] = await db.delete(fnbFoodCourts).where(eq(fnbFoodCourts.id, id)).returning({ id: fnbFoodCourts.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });
}
