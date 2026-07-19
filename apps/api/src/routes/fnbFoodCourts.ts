import { db, fnbFoodCourts, type FnbFoodCourtFixedFees } from "@bh/db";
import { fnbFoodCourtCreateSchema, fnbFoodCourtIdParams, fnbFoodCourtUpdateSchema } from "@bh/shared";
import { desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requireAnyPerm, requirePerm } from "../auth/jwt";
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
    adv_mode: row.advMode,
    mdr_pct: numberValue(row.mdrPct),
    mdr_mode: row.mdrMode,
    fixed_fees: row.fixedFees,
    entrance_monthly: numberValue(row.entranceMonthly),
    mgmt_pct: Number(row.mgmtPct),
    food_pct: Number(row.foodPct),
    gst_pct: Number(row.gstPct),
    include_gst: row.includeGst,
    salary: Number(row.salary),
    investor_floor: Number(row.investorFloor),
    investor_share_pct: Number(row.investorSharePct),
    couple_floor: Number(row.coupleFloor),
    couple_repay_cap: Number(row.coupleRepayCap),
    profit_target: Number(row.profitTarget),
    excess_mgmt_pct: Number(row.excessMgmtPct),
    excess_couple_pct: Number(row.excessCouplePct),
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
  adv_mode?: "pct" | "fixed" | undefined;
  mdr_pct?: number | undefined;
  mdr_mode?: "pct" | "fixed" | undefined;
  fixed_fees?: LooseFixedFees | null | undefined;
  entrance_monthly?: number | undefined;
  mgmt_pct?: number | undefined;
  food_pct?: number | undefined;
  gst_pct?: number | undefined;
  include_gst?: boolean | undefined;
  salary?: number | undefined;
  investor_floor?: number | undefined;
  investor_share_pct?: number | undefined;
  couple_floor?: number | undefined;
  couple_repay_cap?: number | undefined;
  profit_target?: number | undefined;
  excess_mgmt_pct?: number | undefined;
  excess_couple_pct?: number | undefined;
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
    ...(body.adv_mode !== undefined ? { advMode: body.adv_mode } : {}),
    ...(body.mdr_pct !== undefined ? { mdrPct: numericValue(body.mdr_pct) } : {}),
    ...(body.mdr_mode !== undefined ? { mdrMode: body.mdr_mode } : {}),
    ...(body.fixed_fees !== undefined ? { fixedFees: fixedFeesValue(body.fixed_fees) } : {}),
    ...(body.entrance_monthly !== undefined ? { entranceMonthly: numericValue(body.entrance_monthly) } : {}),
    ...(body.mgmt_pct !== undefined ? { mgmtPct: numericValue(body.mgmt_pct) } : {}),
    ...(body.food_pct !== undefined ? { foodPct: numericValue(body.food_pct) } : {}),
    ...(body.gst_pct !== undefined ? { gstPct: numericValue(body.gst_pct) } : {}),
    ...(body.include_gst !== undefined ? { includeGst: body.include_gst } : {}),
    ...(body.salary !== undefined ? { salary: numericValue(body.salary) } : {}),
    ...(body.investor_floor !== undefined ? { investorFloor: numericValue(body.investor_floor) } : {}),
    ...(body.investor_share_pct !== undefined ? { investorSharePct: numericValue(body.investor_share_pct) } : {}),
    ...(body.couple_floor !== undefined ? { coupleFloor: numericValue(body.couple_floor) } : {}),
    ...(body.couple_repay_cap !== undefined ? { coupleRepayCap: numericValue(body.couple_repay_cap) } : {}),
    ...(body.profit_target !== undefined ? { profitTarget: numericValue(body.profit_target) } : {}),
    ...(body.excess_mgmt_pct !== undefined ? { excessMgmtPct: numericValue(body.excess_mgmt_pct) } : {}),
    ...(body.excess_couple_pct !== undefined ? { excessCouplePct: numericValue(body.excess_couple_pct) } : {}),
    ...(body.tiers !== undefined ? { tiers: body.tiers } : {})
  };
}

export async function registerFnbFoodCourtRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/fnb-food-courts", { preHandler: requireAnyPerm(["franchise.view", "mlk.view"]) }, async () => {
    const rows = await db.select().from(fnbFoodCourts).orderBy(desc(fnbFoodCourts.updatedAt), desc(fnbFoodCourts.createdAt));
    return { food_courts: rows.map(serializeFoodCourt) };
  });

  app.get("/fnb-food-courts/:id", { preHandler: requireAnyPerm(["franchise.view", "mlk.view"]) }, async (request, reply) => {
    const { id } = parseWithSchema(fnbFoodCourtIdParams, request.params);
    const [row] = await db.select().from(fnbFoodCourts).where(eq(fnbFoodCourts.id, id)).limit(1);
    if (!row) return sendNotFound(reply);
    return { food_court: serializeFoodCourt(row) };
  });

  app.post("/fnb-food-courts", { preHandler: requireAnyPerm(["franchise.manage", "mlk.manage"]) }, async (request, reply) => {
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
