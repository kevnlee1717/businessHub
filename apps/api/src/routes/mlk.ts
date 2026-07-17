import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  db,
  driveNodes,
  fnbFoodCourts,
  mlkCouples,
  mlkInvestors,
  mlkLedger,
  mlkPayments,
  mlkSettlements,
  mlkStoreRevenue,
  mlkStores
} from "@bh/db";
import {
  mlkCoupleCreateSchema,
  mlkCoupleUpdateSchema,
  mlkFolderCreateSchema,
  mlkFolderIdParams,
  mlkIdParams,
  mlkInvestorCreateSchema,
  mlkInvestorUpdateSchema,
  mlkLedgerCreateSchema,
  mlkLedgerUpdateSchema,
  mlkPaymentCreateSchema,
  mlkPaymentUpdateSchema,
  mlkRevenueCreateSchema,
  mlkRevenueQuerySchema,
  mlkSettlementCreateSchema,
  mlkStoreCreateSchema,
  mlkStoreUpdateSchema,
  type MlkCoupleCreateInput,
  type MlkCoupleUpdateInput,
  type MlkInvestorCreateInput,
  type MlkInvestorUpdateInput,
  type MlkLedgerCreateInput,
  type MlkLedgerUpdateInput,
  type MlkPaymentCreateInput,
  type MlkPaymentUpdateInput,
  type MlkStoreCreateInput,
  type MlkStoreUpdateInput
} from "@bh/shared";
import { type MultipartFile } from "@fastify/multipart";
import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema, sendNotFound } from "./hrUtils";

const mlkFileNodeParams = z.object({ folderId: z.string().uuid(), id: z.string().uuid() });
const mlkFileNodePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    parent_id: z.string().uuid().nullable().optional(),
    sort_order: z.number().int().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: "empty_patch" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");
const storageDirectory = "drive";
const DRIVE_MAX_UPLOAD = 300 * 1024 * 1024;

type InvestorRow = typeof mlkInvestors.$inferSelect;
type CoupleRow = typeof mlkCouples.$inferSelect;
type StoreRow = typeof mlkStores.$inferSelect;
type PaymentRow = typeof mlkPayments.$inferSelect;
type LedgerRow = typeof mlkLedger.$inferSelect;
type RevenueRow = typeof mlkStoreRevenue.$inferSelect;
type SettlementRow = typeof mlkSettlements.$inferSelect;
type DriveNodeRow = typeof driveNodes.$inferSelect;
type MlkFolderKind = "stores" | "investors" | "couples";
type MultipartFields = Record<string, string>;
type UploadedFile = {
  filename: string;
  storagePath: string;
  mime: string;
  size: number;
};

function numberValue(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function requiredNumberValue(value: string): number {
  return Number(value);
}

function numericValue(value: number): string {
  return String(value);
}

function serializeInvestor(row: InvestorRow) {
  return {
    id: row.id,
    name: row.name,
    company_name: row.companyName,
    uen: row.uen,
    id_no: row.idNo,
    phone: row.phone,
    wechat: row.wechat,
    address: row.address,
    service_tier: row.serviceTier,
    pr_status: row.prStatus,
    kyc_status: row.kycStatus,
    drive_folder_id: row.driveFolderId,
    notes: row.notes,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeCouple(row: CoupleRow) {
  return {
    id: row.id,
    operator_company: row.operatorCompany,
    operator_uen: row.operatorUen,
    husband_name: row.husbandName,
    husband_id_no: row.husbandIdNo,
    husband_passport: row.husbandPassport,
    wife_name: row.wifeName,
    wife_id_no: row.wifeIdNo,
    wife_passport: row.wifePassport,
    phone: row.phone,
    wechat: row.wechat,
    husband_ep: row.husbandEp,
    wife_ep: row.wifeEp,
    pr_status: row.prStatus,
    mentor_id: row.mentorId,
    status: row.status,
    joined_at: row.joinedAt,
    exited_at: row.exitedAt,
    drive_folder_id: row.driveFolderId,
    notes: row.notes,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function coupleDisplayName(row: Pick<CoupleRow, "husbandName" | "wifeName"> | null): string | null {
  return row ? `${row.husbandName} / ${row.wifeName}` : null;
}

function serializeStore(row: StoreRow) {
  return {
    id: row.id,
    name: row.name,
    stall: row.stall,
    cuisine: row.cuisine,
    address: row.address,
    spv_name: row.spvName,
    spv_uen: row.spvUen,
    investor_id: row.investorId,
    couple_id: row.coupleId,
    food_court_id: row.foodCourtId,
    kitchen_store_id: row.kitchenStoreId,
    status: row.status,
    intent_signed_at: row.intentSignedAt,
    selected_at: row.selectedAt,
    incorporated_at: row.incorporatedAt,
    lease_signed_at: row.leaseSignedAt,
    renovation_at: row.renovationAt,
    opened_at: row.openedAt,
    closed_at: row.closedAt,
    fc_deposit_amount: numberValue(row.fcDepositAmount),
    drive_folder_id: row.driveFolderId,
    notes: row.notes,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializePayment(row: PaymentRow) {
  return {
    id: row.id,
    investor_id: row.investorId,
    store_id: row.storeId,
    kind: row.kind,
    amount_due: requiredNumberValue(row.amountDue),
    amount_paid: requiredNumberValue(row.amountPaid),
    paid_at: row.paidAt,
    status: row.status,
    notes: row.notes,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeLedger(row: LedgerRow) {
  return {
    id: row.id,
    couple_id: row.coupleId,
    store_id: row.storeId,
    month: row.month,
    kind: row.kind,
    amount: requiredNumberValue(row.amount),
    notes: row.notes,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeRevenue(row: RevenueRow) {
  return {
    id: row.id,
    store_id: row.storeId,
    date: row.date,
    turnover: requiredNumberValue(row.turnover),
    source: row.source,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeSettlement(row: SettlementRow) {
  return {
    id: row.id,
    store_id: row.storeId,
    month: row.month,
    turnover: requiredNumberValue(row.turnover),
    net_profit: requiredNumberValue(row.netProfit),
    investor_payout: requiredNumberValue(row.investorPayout),
    couple_payout: requiredNumberValue(row.couplePayout),
    mgmt_payout: requiredNumberValue(row.mgmtPayout),
    detail: row.detail,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function urlForStoragePath(storagePath: string | null | undefined) {
  return storagePath ? `/uploads/${storagePath}` : null;
}

function serializeNode(row: DriveNodeRow) {
  return {
    id: row.id,
    parent_id: row.parentId,
    kind: row.kind,
    name: row.name,
    storage_path: row.storagePath,
    mime: row.mime,
    size: row.size,
    sort_order: row.sortOrder,
    updated_at: row.updatedAt,
    created_at: row.createdAt,
    ...(row.kind === "file" ? { url: urlForStoragePath(row.storagePath) } : {})
  };
}

function investorValues(body: MlkInvestorCreateInput | MlkInvestorUpdateInput) {
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.company_name !== undefined ? { companyName: body.company_name } : {}),
    ...(body.uen !== undefined ? { uen: body.uen } : {}),
    ...(body.id_no !== undefined ? { idNo: body.id_no } : {}),
    ...(body.phone !== undefined ? { phone: body.phone } : {}),
    ...(body.wechat !== undefined ? { wechat: body.wechat } : {}),
    ...(body.address !== undefined ? { address: body.address } : {}),
    ...(body.service_tier !== undefined ? { serviceTier: body.service_tier } : {}),
    ...(body.pr_status !== undefined ? { prStatus: body.pr_status } : {}),
    ...(body.kyc_status !== undefined ? { kycStatus: body.kyc_status } : {}),
    ...(body.drive_folder_id !== undefined ? { driveFolderId: body.drive_folder_id } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {})
  };
}

function coupleValues(body: MlkCoupleCreateInput | MlkCoupleUpdateInput) {
  return {
    ...(body.operator_company !== undefined ? { operatorCompany: body.operator_company } : {}),
    ...(body.operator_uen !== undefined ? { operatorUen: body.operator_uen } : {}),
    ...(body.husband_name !== undefined ? { husbandName: body.husband_name } : {}),
    ...(body.husband_id_no !== undefined ? { husbandIdNo: body.husband_id_no } : {}),
    ...(body.husband_passport !== undefined ? { husbandPassport: body.husband_passport } : {}),
    ...(body.wife_name !== undefined ? { wifeName: body.wife_name } : {}),
    ...(body.wife_id_no !== undefined ? { wifeIdNo: body.wife_id_no } : {}),
    ...(body.wife_passport !== undefined ? { wifePassport: body.wife_passport } : {}),
    ...(body.phone !== undefined ? { phone: body.phone } : {}),
    ...(body.wechat !== undefined ? { wechat: body.wechat } : {}),
    ...(body.husband_ep !== undefined ? { husbandEp: body.husband_ep } : {}),
    ...(body.wife_ep !== undefined ? { wifeEp: body.wife_ep } : {}),
    ...(body.pr_status !== undefined ? { prStatus: body.pr_status } : {}),
    ...(body.mentor_id !== undefined ? { mentorId: body.mentor_id } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.joined_at !== undefined ? { joinedAt: body.joined_at } : {}),
    ...(body.exited_at !== undefined ? { exitedAt: body.exited_at } : {}),
    ...(body.drive_folder_id !== undefined ? { driveFolderId: body.drive_folder_id } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {})
  };
}

function storeValues(body: MlkStoreCreateInput | MlkStoreUpdateInput) {
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.stall !== undefined ? { stall: body.stall } : {}),
    ...(body.cuisine !== undefined ? { cuisine: body.cuisine } : {}),
    ...(body.address !== undefined ? { address: body.address } : {}),
    ...(body.spv_name !== undefined ? { spvName: body.spv_name } : {}),
    ...(body.spv_uen !== undefined ? { spvUen: body.spv_uen } : {}),
    ...(body.investor_id !== undefined ? { investorId: body.investor_id } : {}),
    ...(body.couple_id !== undefined ? { coupleId: body.couple_id } : {}),
    ...(body.food_court_id !== undefined ? { foodCourtId: body.food_court_id } : {}),
    ...(body.kitchen_store_id !== undefined ? { kitchenStoreId: body.kitchen_store_id } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.intent_signed_at !== undefined ? { intentSignedAt: body.intent_signed_at } : {}),
    ...(body.selected_at !== undefined ? { selectedAt: body.selected_at } : {}),
    ...(body.incorporated_at !== undefined ? { incorporatedAt: body.incorporated_at } : {}),
    ...(body.lease_signed_at !== undefined ? { leaseSignedAt: body.lease_signed_at } : {}),
    ...(body.renovation_at !== undefined ? { renovationAt: body.renovation_at } : {}),
    ...(body.opened_at !== undefined ? { openedAt: body.opened_at } : {}),
    ...(body.closed_at !== undefined ? { closedAt: body.closed_at } : {}),
    ...(body.fc_deposit_amount !== undefined ? { fcDepositAmount: body.fc_deposit_amount === null ? null : numericValue(body.fc_deposit_amount) } : {}),
    ...(body.drive_folder_id !== undefined ? { driveFolderId: body.drive_folder_id } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {})
  };
}

function paymentValues(body: MlkPaymentCreateInput | MlkPaymentUpdateInput) {
  return {
    ...(body.investor_id !== undefined ? { investorId: body.investor_id } : {}),
    ...(body.store_id !== undefined ? { storeId: body.store_id } : {}),
    ...(body.kind !== undefined ? { kind: body.kind } : {}),
    ...(body.amount_due !== undefined ? { amountDue: numericValue(body.amount_due) } : {}),
    ...(body.amount_paid !== undefined ? { amountPaid: numericValue(body.amount_paid) } : {}),
    ...(body.paid_at !== undefined ? { paidAt: body.paid_at } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {})
  };
}

function ledgerValues(body: MlkLedgerCreateInput | MlkLedgerUpdateInput) {
  return {
    ...(body.couple_id !== undefined ? { coupleId: body.couple_id } : {}),
    ...(body.store_id !== undefined ? { storeId: body.store_id } : {}),
    ...(body.month !== undefined ? { month: body.month } : {}),
    ...(body.kind !== undefined ? { kind: body.kind } : {}),
    ...(body.amount !== undefined ? { amount: numericValue(body.amount) } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {})
  };
}

function revenueValues(body: { date: string; turnover: number; source?: "kitchen" | "manual" | undefined }, storeId: string, userId: string) {
  return {
    storeId,
    date: body.date,
    turnover: numericValue(body.turnover),
    source: body.source ?? "manual",
    createdBy: userId,
    updatedAt: new Date()
  };
}

function settlementValues(
  body: {
    month: string;
    turnover?: number | undefined;
    net_profit?: number | undefined;
    investor_payout?: number | undefined;
    couple_payout?: number | undefined;
    mgmt_payout?: number | undefined;
    detail?: unknown;
  },
  storeId: string,
  userId: string
) {
  return {
    storeId,
    month: body.month,
    turnover: numericValue(body.turnover ?? 0),
    netProfit: numericValue(body.net_profit ?? 0),
    investorPayout: numericValue(body.investor_payout ?? 0),
    couplePayout: numericValue(body.couple_payout ?? 0),
    mgmtPayout: numericValue(body.mgmt_payout ?? 0),
    ...(body.detail !== undefined ? { detail: body.detail } : {}),
    createdBy: userId,
    updatedAt: new Date()
  };
}

function fieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

async function discardFile(part: MultipartFile): Promise<void> {
  await pipeline(
    part.file,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

async function unlinkStoragePath(storagePath: string | null | undefined) {
  if (!storagePath) return;
  try {
    await unlink(join(uploadRoot, storagePath));
  } catch {
    // Best-effort cleanup only; stale files should not break API writes.
  }
}

async function saveFile(part: MultipartFile) {
  const directory = join(uploadRoot, storageDirectory);
  await mkdir(directory, { recursive: true });

  const extension = extname(part.filename);
  const storedFilename = `${randomUUID()}${extension}`;
  const absolutePath = join(directory, storedFilename);
  const storagePath = posix.join(storageDirectory, storedFilename);
  let size = 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      callback(null, chunk);
    }
  });

  try {
    await pipeline(part.file, counter, createWriteStream(absolutePath));
  } catch (error) {
    await unlinkStoragePath(storagePath);
    throw error;
  }

  return {
    filename: part.filename,
    storagePath,
    mime: part.mimetype,
    size
  };
}

async function readMultipartWithFirstFile(request: FastifyRequest) {
  const fields: MultipartFields = {};
  let file: UploadedFile | null = null;

  try {
    for await (const part of request.parts({ limits: { fileSize: DRIVE_MAX_UPLOAD } })) {
      if (part.type === "field") {
        const value = fieldValue(part.value);
        if (value !== "") {
          fields[part.fieldname] = value;
        }
        continue;
      }

      if (file) {
        await discardFile(part);
        continue;
      }

      file = await saveFile(part);
    }
  } catch (error) {
    await unlinkStoragePath(file?.storagePath);
    throw error;
  }

  return { fields, file };
}

function isFileTooLargeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

function sendDriveFileTooLarge(reply: FastifyReply) {
  return reply.code(413).send({
    error: "file_too_large",
    message: "文件超过 300MB 上限,请压缩后再传"
  });
}

async function findActiveNode(id: string) {
  const [node] = await db
    .select()
    .from(driveNodes)
    .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
    .limit(1);
  return node ?? null;
}

// 取 rootId 下的整棵子树(不含 root 自身),用于多列 Finder。root 的直接子节点在结果里,
// 但 parent_id 归一化交给调用方(root 的直接子 → null,便于前端 DriveColumns 当作顶层列)。
async function getMlkSubtreeRows(rootId: string) {
  const rows = await db
    .select()
    .from(driveNodes)
    .where(isNull(driveNodes.deletedAt))
    .orderBy(sql`case when ${driveNodes.kind} = 'folder' then 0 else 1 end`, asc(driveNodes.name));
  const childrenByParent = new Map<string | null, DriveNodeRow[]>();
  for (const row of rows) {
    const siblings = childrenByParent.get(row.parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parentId, siblings);
  }
  const scoped: DriveNodeRow[] = [];
  const pending = [...(childrenByParent.get(rootId) ?? [])];
  while (pending.length > 0) {
    const row = pending.shift();
    if (!row) continue;
    scoped.push(row);
    pending.push(...(childrenByParent.get(row.id) ?? []));
  }
  return scoped;
}

function serializeScopedNode(row: DriveNodeRow, rootId: string) {
  return { ...serializeNode(row), parent_id: row.parentId === rootId ? null : row.parentId };
}

async function ensureMlkFolder(kind: MlkFolderKind, name: string, userId: string) {
  const kindLabels: Record<MlkFolderKind, string> = {
    stores: "门店",
    investors: "投资人",
    couples: "夫妻"
  };

  async function findOrCreateFolder(parentId: string | null, folderName: string) {
    const parentFilter = parentId ? eq(driveNodes.parentId, parentId) : isNull(driveNodes.parentId);
    const [existing] = await db
      .select()
      .from(driveNodes)
      .where(and(parentFilter, eq(driveNodes.kind, "folder"), eq(driveNodes.name, folderName), isNull(driveNodes.deletedAt)))
      .limit(1);
    if (existing) return existing.id;

    const [folder] = await db
      .insert(driveNodes)
      .values({
        parentId,
        kind: "folder",
        name: folderName,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();
    if (!folder) throw new Error("mlk_folder_create_failed");
    return folder.id;
  }

  const rootId = await findOrCreateFolder(null, "陆老师厨房");
  // 模块隔离:陆老师厨房 root 打 scope='mlk',对宣传册 drive 隐藏
  await db.update(driveNodes).set({ scope: "mlk" }).where(and(eq(driveNodes.id, rootId), isNull(driveNodes.scope)));
  const sectionId = await findOrCreateFolder(rootId, kindLabels[kind]);
  return findOrCreateFolder(sectionId, name);
}

async function renameMlkFolder(folderId: string | null, name: string) {
  if (!folderId) return;
  await db
    .update(driveNodes)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(driveNodes.id, folderId), eq(driveNodes.kind, "folder"), isNull(driveNodes.deletedAt)));
}

// 夫妻只能属于一家门店:检查该 couple 是否已被"另一家"门店占用
async function coupleTakenByAnotherStore(coupleId: string, exceptStoreId?: string) {
  const filters = [eq(mlkStores.coupleId, coupleId)];
  if (exceptStoreId) filters.push(ne(mlkStores.id, exceptStoreId));
  const [row] = await db.select({ id: mlkStores.id }).from(mlkStores).where(and(...filters)).limit(1);
  return row ?? null;
}

async function findStoreOr404(storeId: string, reply: FastifyReply) {
  const [store] = await db.select().from(mlkStores).where(eq(mlkStores.id, storeId)).limit(1);
  if (!store) {
    sendNotFound(reply);
    return null;
  }
  return store;
}

export async function registerMlkRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/mlk/investors", { preHandler: requirePerm("mlk.view") }, async () => {
    const rows = await db.select().from(mlkInvestors).orderBy(desc(mlkInvestors.updatedAt), desc(mlkInvestors.createdAt));
    return { investors: rows.map(serializeInvestor) };
  });

  app.get("/mlk/investors/:id", { preHandler: requirePerm("mlk.view") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.select().from(mlkInvestors).where(eq(mlkInvestors.id, id)).limit(1);
    if (!row) return sendNotFound(reply);
    return { investor: serializeInvestor(row) };
  });

  app.post("/mlk/investors", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const body = parseWithSchema(mlkInvestorCreateSchema, request.body);
    const driveFolderId = body.drive_folder_id ?? (await ensureMlkFolder("investors", body.name, request.user.id));
    const [row] = await db
      .insert(mlkInvestors)
      .values({
        ...investorValues(body),
        name: body.name,
        driveFolderId,
        createdBy: request.user.id,
        updatedAt: new Date()
      })
      .returning();
    if (!row) throw new Error("mlk_investor_create_failed");
    return reply.code(201).send({ investor: serializeInvestor(row) });
  });

  app.patch("/mlk/investors/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const body = parseWithSchema(mlkInvestorUpdateSchema, request.body);
    const [existing] = await db.select().from(mlkInvestors).where(eq(mlkInvestors.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    const [row] = await db
      .update(mlkInvestors)
      .set({ ...investorValues(body), updatedAt: new Date() })
      .where(eq(mlkInvestors.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    if (body.name !== undefined) await renameMlkFolder(row.driveFolderId, body.name);
    return { investor: serializeInvestor(row) };
  });

  app.delete("/mlk/investors/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.delete(mlkInvestors).where(eq(mlkInvestors.id, id)).returning({ id: mlkInvestors.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/mlk/couples", { preHandler: requirePerm("mlk.view") }, async () => {
    const rows = await db.select().from(mlkCouples).orderBy(desc(mlkCouples.updatedAt), desc(mlkCouples.createdAt));
    return { couples: rows.map(serializeCouple) };
  });

  app.get("/mlk/couples/:id", { preHandler: requirePerm("mlk.view") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.select().from(mlkCouples).where(eq(mlkCouples.id, id)).limit(1);
    if (!row) return sendNotFound(reply);
    return { couple: serializeCouple(row) };
  });

  app.post("/mlk/couples", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const body = parseWithSchema(mlkCoupleCreateSchema, request.body);
    const driveFolderId = body.drive_folder_id ?? (await ensureMlkFolder("couples", `${body.husband_name}-${body.wife_name}`, request.user.id));
    const [row] = await db
      .insert(mlkCouples)
      .values({
        ...coupleValues(body),
        husbandName: body.husband_name,
        wifeName: body.wife_name,
        driveFolderId,
        createdBy: request.user.id,
        updatedAt: new Date()
      })
      .returning();
    if (!row) throw new Error("mlk_couple_create_failed");
    return reply.code(201).send({ couple: serializeCouple(row) });
  });

  app.patch("/mlk/couples/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const body = parseWithSchema(mlkCoupleUpdateSchema, request.body);
    const [existing] = await db.select().from(mlkCouples).where(eq(mlkCouples.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    const [row] = await db
      .update(mlkCouples)
      .set({ ...coupleValues(body), updatedAt: new Date() })
      .where(eq(mlkCouples.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    if (body.husband_name !== undefined || body.wife_name !== undefined) {
      await renameMlkFolder(row.driveFolderId, `${row.husbandName}-${row.wifeName}`);
    }
    return { couple: serializeCouple(row) };
  });

  app.delete("/mlk/couples/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.delete(mlkCouples).where(eq(mlkCouples.id, id)).returning({ id: mlkCouples.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/mlk/stores", { preHandler: requirePerm("mlk.view") }, async () => {
    const rows = await db
      .select({
        store: mlkStores,
        investorName: mlkInvestors.name,
        husbandName: mlkCouples.husbandName,
        wifeName: mlkCouples.wifeName,
        foodCourtName: fnbFoodCourts.name
      })
      .from(mlkStores)
      .leftJoin(mlkInvestors, eq(mlkStores.investorId, mlkInvestors.id))
      .leftJoin(mlkCouples, eq(mlkStores.coupleId, mlkCouples.id))
      .leftJoin(fnbFoodCourts, eq(mlkStores.foodCourtId, fnbFoodCourts.id))
      .orderBy(desc(mlkStores.updatedAt), desc(mlkStores.createdAt));

    return {
      stores: rows.map((row) => ({
        ...serializeStore(row.store),
        investor_name: row.investorName,
        couple_name: row.husbandName && row.wifeName ? `${row.husbandName} / ${row.wifeName}` : null,
        food_court_name: row.foodCourtName
      }))
    };
  });

  app.get("/mlk/stores/:id", { preHandler: requirePerm("mlk.view") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db
      .select({ store: mlkStores, investor: mlkInvestors, couple: mlkCouples, foodCourtName: fnbFoodCourts.name })
      .from(mlkStores)
      .leftJoin(mlkInvestors, eq(mlkStores.investorId, mlkInvestors.id))
      .leftJoin(mlkCouples, eq(mlkStores.coupleId, mlkCouples.id))
      .leftJoin(fnbFoodCourts, eq(mlkStores.foodCourtId, fnbFoodCourts.id))
      .where(eq(mlkStores.id, id))
      .limit(1);
    if (!row) return sendNotFound(reply);

    const [payments, settlements, revenueMonthly] = await Promise.all([
      db.select().from(mlkPayments).where(eq(mlkPayments.storeId, id)).orderBy(desc(mlkPayments.createdAt)),
      db.select().from(mlkSettlements).where(eq(mlkSettlements.storeId, id)).orderBy(desc(mlkSettlements.month)),
      db.execute(sql`
        select date_trunc('month', "date")::date as month, coalesce(sum("turnover"), 0)::text as turnover
        from "mlk_store_revenue"
        where "store_id" = ${id}
        group by date_trunc('month', "date")::date
        order by month desc
        limit 12
      `)
    ]);

    return {
      store: {
        ...serializeStore(row.store),
        investor_name: row.investor?.name ?? null,
        couple_name: coupleDisplayName(row.couple),
        food_court_name: row.foodCourtName,
        payments: payments.map(serializePayment),
        revenue_monthly: revenueMonthly.rows.map((item) => ({
          month: String(item.month),
          turnover: Number(item.turnover ?? 0)
        })),
        settlements: settlements.map(serializeSettlement)
      }
    };
  });

  app.post("/mlk/stores", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const body = parseWithSchema(mlkStoreCreateSchema, request.body);
    if (body.couple_id && (await coupleTakenByAnotherStore(body.couple_id))) {
      return reply.code(400).send({ error: "couple_already_assigned" });
    }
    const driveFolderId = body.drive_folder_id ?? (await ensureMlkFolder("stores", body.name, request.user.id));
    const [row] = await db
      .insert(mlkStores)
      .values({
        ...storeValues(body),
        name: body.name,
        driveFolderId,
        createdBy: request.user.id,
        updatedAt: new Date()
      })
      .returning();
    if (!row) throw new Error("mlk_store_create_failed");
    return reply.code(201).send({ store: serializeStore(row) });
  });

  app.patch("/mlk/stores/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const body = parseWithSchema(mlkStoreUpdateSchema, request.body);
    const [existing] = await db.select().from(mlkStores).where(eq(mlkStores.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (body.couple_id && (await coupleTakenByAnotherStore(body.couple_id, id))) {
      return reply.code(400).send({ error: "couple_already_assigned" });
    }
    const [row] = await db
      .update(mlkStores)
      .set({ ...storeValues(body), updatedAt: new Date() })
      .where(eq(mlkStores.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    if (body.name !== undefined) await renameMlkFolder(row.driveFolderId, body.name);
    return { store: serializeStore(row) };
  });

  app.delete("/mlk/stores/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.delete(mlkStores).where(eq(mlkStores.id, id)).returning({ id: mlkStores.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/mlk/investors/:id/payments", { preHandler: requirePerm("mlk.view") }, async (request) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const rows = await db.select().from(mlkPayments).where(eq(mlkPayments.investorId, id)).orderBy(desc(mlkPayments.createdAt));
    return { payments: rows.map(serializePayment) };
  });

  app.post("/mlk/payments", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const body = parseWithSchema(mlkPaymentCreateSchema, request.body);
    const [row] = await db
      .insert(mlkPayments)
      .values({ ...paymentValues(body), investorId: body.investor_id, kind: body.kind, createdBy: request.user.id, updatedAt: new Date() })
      .returning();
    if (!row) throw new Error("mlk_payment_create_failed");
    return reply.code(201).send({ payment: serializePayment(row) });
  });

  app.patch("/mlk/payments/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const body = parseWithSchema(mlkPaymentUpdateSchema, request.body);
    const [row] = await db
      .update(mlkPayments)
      .set({ ...paymentValues(body), updatedAt: new Date() })
      .where(eq(mlkPayments.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    return { payment: serializePayment(row) };
  });

  app.delete("/mlk/payments/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.delete(mlkPayments).where(eq(mlkPayments.id, id)).returning({ id: mlkPayments.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/mlk/couples/:id/ledger", { preHandler: requirePerm("mlk.view") }, async (request) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const rows = await db.select().from(mlkLedger).where(eq(mlkLedger.coupleId, id)).orderBy(desc(mlkLedger.month), desc(mlkLedger.createdAt));
    return { ledger: rows.map(serializeLedger) };
  });

  app.post("/mlk/ledger", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const body = parseWithSchema(mlkLedgerCreateSchema, request.body);
    const [row] = await db
      .insert(mlkLedger)
      .values({ ...ledgerValues(body), coupleId: body.couple_id, month: body.month, kind: body.kind, amount: numericValue(body.amount), createdBy: request.user.id, updatedAt: new Date() })
      .returning();
    if (!row) throw new Error("mlk_ledger_create_failed");
    return reply.code(201).send({ ledger: serializeLedger(row) });
  });

  app.patch("/mlk/ledger/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const body = parseWithSchema(mlkLedgerUpdateSchema, request.body);
    const [row] = await db
      .update(mlkLedger)
      .set({ ...ledgerValues(body), updatedAt: new Date() })
      .where(eq(mlkLedger.id, id))
      .returning();
    if (!row) return sendNotFound(reply);
    return { ledger: serializeLedger(row) };
  });

  app.delete("/mlk/ledger/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.delete(mlkLedger).where(eq(mlkLedger.id, id)).returning({ id: mlkLedger.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/mlk/stores/:id/revenue", { preHandler: requirePerm("mlk.view") }, async (request) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const query = parseWithSchema(mlkRevenueQuerySchema, request.query);
    const filters = [
      eq(mlkStoreRevenue.storeId, id),
      ...(query.from !== undefined ? [gte(mlkStoreRevenue.date, query.from)] : []),
      ...(query.to !== undefined ? [lte(mlkStoreRevenue.date, query.to)] : [])
    ];
    const rows = await db
      .select()
      .from(mlkStoreRevenue)
      .where(and(...filters))
      .orderBy(desc(mlkStoreRevenue.date));
    return { revenue: rows.map(serializeRevenue) };
  });

  app.post("/mlk/stores/:id/revenue", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    if (!(await findStoreOr404(id, reply))) return;
    const body = parseWithSchema(mlkRevenueCreateSchema, request.body);
    const [row] = await db
      .insert(mlkStoreRevenue)
      .values(revenueValues(body, id, request.user.id))
      .onConflictDoUpdate({
        target: [mlkStoreRevenue.storeId, mlkStoreRevenue.date],
        set: {
          turnover: numericValue(body.turnover),
          source: body.source ?? "manual",
          updatedAt: new Date()
        }
      })
      .returning();
    if (!row) throw new Error("mlk_revenue_upsert_failed");
    return reply.code(201).send({ revenue: serializeRevenue(row) });
  });

  app.get("/mlk/stores/:id/settlements", { preHandler: requirePerm("mlk.view") }, async (request) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const rows = await db.select().from(mlkSettlements).where(eq(mlkSettlements.storeId, id)).orderBy(desc(mlkSettlements.month));
    return { settlements: rows.map(serializeSettlement) };
  });

  app.post("/mlk/stores/:id/settlements", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    if (!(await findStoreOr404(id, reply))) return;
    const body = parseWithSchema(mlkSettlementCreateSchema, request.body);
    const [row] = await db
      .insert(mlkSettlements)
      .values(settlementValues(body, id, request.user.id))
      .onConflictDoUpdate({
        target: [mlkSettlements.storeId, mlkSettlements.month],
        set: {
          turnover: numericValue(body.turnover ?? 0),
          netProfit: numericValue(body.net_profit ?? 0),
          investorPayout: numericValue(body.investor_payout ?? 0),
          couplePayout: numericValue(body.couple_payout ?? 0),
          mgmtPayout: numericValue(body.mgmt_payout ?? 0),
          ...(body.detail !== undefined ? { detail: body.detail } : {}),
          updatedAt: new Date()
        }
      })
      .returning();
    if (!row) throw new Error("mlk_settlement_upsert_failed");
    return reply.code(201).send({ settlement: serializeSettlement(row) });
  });

  app.delete("/mlk/settlements/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const [row] = await db.delete(mlkSettlements).where(eq(mlkSettlements.id, id)).returning({ id: mlkSettlements.id });
    if (!row) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/mlk/files/:folderId", { preHandler: requirePerm("mlk.view") }, async (request, reply) => {
    const { folderId } = parseWithSchema(mlkFolderIdParams, request.params);
    const folder = await findActiveNode(folderId);
    if (!folder || folder.kind !== "folder") return sendNotFound(reply);
    const rows = await db
      .select()
      .from(driveNodes)
      .where(and(eq(driveNodes.parentId, folderId), isNull(driveNodes.deletedAt)))
      .orderBy(sql`case when ${driveNodes.kind} = 'folder' then 0 else 1 end`, asc(driveNodes.name));
    return { nodes: rows.map(serializeNode) };
  });

  // 多列 Finder 用:返回 root 文件夹下的整棵子树(root 直接子的 parent_id 归一化为 null)
  app.get("/mlk/files/:folderId/tree", { preHandler: requirePerm("mlk.view") }, async (request, reply) => {
    const { folderId } = parseWithSchema(mlkFolderIdParams, request.params);
    const root = await findActiveNode(folderId);
    if (!root || root.kind !== "folder") return sendNotFound(reply);
    const scoped = await getMlkSubtreeRows(folderId);
    return { nodes: scoped.map((row) => serializeScopedNode(row, folderId)) };
  });

  // 重命名 / 移动(拖拽换父文件夹)。parent_id 为 null 表示移到 root 根层。
  app.patch("/mlk/files/:folderId/node/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { folderId, id } = parseWithSchema(mlkFileNodeParams, request.params);
    const body = parseWithSchema(mlkFileNodePatchSchema, request.body);
    const root = await findActiveNode(folderId);
    if (!root || root.kind !== "folder") return sendNotFound(reply);
    if (id === folderId) return reply.code(400).send({ error: "mlk_drive_root_readonly" });

    const subtree = await getMlkSubtreeRows(folderId);
    const target = subtree.find((row) => row.id === id);
    if (!target) return sendNotFound(reply);

    let resolvedParentId: string | null | undefined;
    if (body.parent_id !== undefined) {
      if (body.parent_id === null) {
        resolvedParentId = folderId;
      } else {
        const parentNode = subtree.find((row) => row.id === body.parent_id);
        if (!parentNode || parentNode.kind !== "folder") {
          return reply.code(400).send({ error: "parent_outside_mlk_drive" });
        }
        // 防环:目标父不能是自己或自己的后代
        const childrenByParent = new Map<string, DriveNodeRow[]>();
        for (const row of subtree) {
          if (!row.parentId) continue;
          const siblings = childrenByParent.get(row.parentId) ?? [];
          siblings.push(row);
          childrenByParent.set(row.parentId, siblings);
        }
        const descendants = new Set<string>();
        const stack = [id];
        while (stack.length > 0) {
          const current = stack.pop();
          if (!current) continue;
          for (const child of childrenByParent.get(current) ?? []) {
            descendants.add(child.id);
            stack.push(child.id);
          }
        }
        if (body.parent_id === id || descendants.has(body.parent_id)) {
          return reply.code(400).send({ error: "cyclic_parent" });
        }
        resolvedParentId = body.parent_id;
      }
    }

    const [row] = await db
      .update(driveNodes)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.parent_id !== undefined ? { parentId: resolvedParentId } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
      .returning();
    if (!row) return sendNotFound(reply);
    return { node: serializeScopedNode(row, folderId) };
  });

  // 替换文件内容(保留节点位置)
  app.put("/mlk/files/:folderId/node/:id/replace", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { folderId, id } = parseWithSchema(mlkFileNodeParams, request.params);
    let file: UploadedFile | null = null;

    try {
      const root = await findActiveNode(folderId);
      if (!root || root.kind !== "folder") return sendNotFound(reply);
      const subtree = await getMlkSubtreeRows(folderId);
      const target = subtree.find((row) => row.id === id);
      if (!target) return sendNotFound(reply);
      if (target.kind !== "file") return reply.code(400).send({ error: "file_node_required" });

      const multipart = await readMultipartWithFirstFile(request);
      file = multipart.file;
      if (!file) return reply.code(400).send({ error: "file_required" });

      const [row] = await db
        .update(driveNodes)
        .set({
          name: file.filename,
          storagePath: file.storagePath,
          mime: file.mime,
          size: file.size,
          updatedAt: new Date()
        })
        .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
        .returning();
      if (!row) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }
      await unlinkStoragePath(target.storagePath);
      return { node: serializeScopedNode(row, folderId) };
    } catch (error) {
      await unlinkStoragePath(file?.storagePath);
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.post("/mlk/files/:folderId", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { folderId } = parseWithSchema(mlkFolderIdParams, request.params);
    let file: UploadedFile | null = null;

    try {
      const folder = await findActiveNode(folderId);
      if (!folder || folder.kind !== "folder") return sendNotFound(reply);

      const multipart = await readMultipartWithFirstFile(request);
      file = multipart.file;
      if (!file) return reply.code(400).send({ error: "file_required" });

      const [row] = await db
        .insert(driveNodes)
        .values({
          parentId: folderId,
          kind: "file",
          name: file.filename,
          storagePath: file.storagePath,
          mime: file.mime,
          size: file.size,
          createdBy: request.user.id,
          updatedAt: new Date()
        })
        .returning();
      if (!row) throw new Error("mlk_file_create_failed");
      return reply.code(201).send({ node: serializeNode(row) });
    } catch (error) {
      await unlinkStoragePath(file?.storagePath);
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.post("/mlk/files/:folderId/folder", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { folderId } = parseWithSchema(mlkFolderIdParams, request.params);
    const body = parseWithSchema(mlkFolderCreateSchema, request.body);
    const folder = await findActiveNode(folderId);
    if (!folder || folder.kind !== "folder") return sendNotFound(reply);
    const [row] = await db
      .insert(driveNodes)
      .values({
        parentId: folderId,
        kind: "folder",
        name: body.name,
        createdBy: request.user.id,
        updatedAt: new Date()
      })
      .returning();
    if (!row) throw new Error("mlk_child_folder_create_failed");
    return reply.code(201).send({ node: serializeNode(row) });
  });

  app.delete("/mlk/files/node/:id", { preHandler: requirePerm("mlk.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const existing = await findActiveNode(id);
    if (!existing) return sendNotFound(reply);
    const deletedAt = new Date();
    const deletedBatch = randomUUID();
    const result = await db.execute(sql`
      with recursive target as (
        select id
        from drive_nodes
        where id = ${id} and deleted_at is null
        union all
        select child.id
        from drive_nodes child
        join target on child.parent_id = target.id
        where child.deleted_at is null
      )
      update drive_nodes
      set deleted_at = ${deletedAt},
          deleted_batch = ${deletedBatch},
          updated_at = ${deletedAt}
      where id in (select id from target)
      returning id
    `);
    if (result.rows.length === 0) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/mlk/files/node/:id/download", { preHandler: requirePerm("mlk.view") }, async (request, reply) => {
    const { id } = parseWithSchema(mlkIdParams, request.params);
    const node = await findActiveNode(id);
    if (!node || node.kind !== "file" || !node.storagePath) return sendNotFound(reply);

    const absolutePath = join(uploadRoot, node.storagePath);
    try {
      await access(absolutePath);
    } catch {
      return sendNotFound(reply);
    }

    reply.header("Content-Type", node.mime ?? "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(node.name)}`);
    return reply.send(createReadStream(absolutePath));
  });
}
