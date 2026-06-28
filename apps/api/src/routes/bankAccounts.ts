import { bankAccounts, db } from "@bh/db";
import { bankAccountCreateSchema, bankAccountUpdateSchema } from "@bh/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";
import { serializeBankAccount } from "./ledgerUtils";

const bankAccountQuerySchema = z.object({
  company_id: z.string().uuid().optional()
});

export async function registerBankAccountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/bank-accounts", { preHandler: requirePerm("finance.view") }, async (request) => {
    const query = parseWithSchema(bankAccountQuerySchema, request.query);
    const filters: SQL[] = [];
    const companyIds = await getAccessibleCompanyIds(request);
    const accessFilter = companyFilter(companyIds, bankAccounts.companyId);

    if (accessFilter) {
      filters.push(accessFilter);
    }

    if (query.company_id) {
      filters.push(eq(bankAccounts.companyId, query.company_id));
    }

    const rows = await db
      .select()
      .from(bankAccounts)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(bankAccounts.isPrimary), bankAccounts.createdAt);

    return { bank_accounts: rows.map(serializeBankAccount) };
  });

  app.post("/bank-accounts", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const body = parseWithSchema(bankAccountCreateSchema, request.body);

    const account = await db.transaction(async (tx) => {
      if (body.is_primary) {
        await tx
          .update(bankAccounts)
          .set({ isPrimary: false })
          .where(eq(bankAccounts.companyId, body.company_id));
      }

      const [created] = await tx
        .insert(bankAccounts)
        .values({
          companyId: body.company_id,
          name: body.name,
          bankName: body.bank_name,
          accountNo: body.account_no,
          currency: body.currency,
          isPrimary: body.is_primary,
          active: body.active,
          note: body.note
        })
        .returning();

      return created ?? null;
    });

    if (!account) {
      throw new Error("bank_account_create_failed");
    }

    return reply.code(201).send({ bank_account: serializeBankAccount(account) });
  });

  app.patch("/bank-accounts/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(bankAccountUpdateSchema, request.body);

    const account = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);

      if (!current) {
        return null;
      }

      const companyId = body.company_id ?? current.companyId;
      if (body.is_primary) {
        await tx
          .update(bankAccounts)
          .set({ isPrimary: false })
          .where(and(eq(bankAccounts.companyId, companyId), sql`${bankAccounts.id} <> ${id}`));
      }

      const [updated] = await tx
        .update(bankAccounts)
        .set({
          companyId: body.company_id,
          name: body.name,
          bankName: body.bank_name,
          accountNo: body.account_no,
          currency: body.currency,
          isPrimary: body.is_primary,
          openingBalance: body.opening_balance === undefined ? undefined : (toNumeric(body.opening_balance) as string),
          openingDate: body.opening_date,
          active: body.active,
          note: body.note
        })
        .where(eq(bankAccounts.id, id))
        .returning();

      return updated ?? null;
    });

    if (!account) {
      return sendNotFound(reply);
    }

    return { bank_account: serializeBankAccount(account) };
  });
}
