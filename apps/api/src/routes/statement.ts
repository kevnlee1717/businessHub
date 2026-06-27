import {
  billing,
  businesses,
  cases,
  clients,
  db,
  dealParties,
  externalCommissionEntries,
  externalParties
} from "@bh/db";
import { desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { parseWithSchema, sendNotFound } from "./hrUtils";

const tokenParamsSchema = z.object({
  token: z.string().trim().min(1)
});

export async function registerStatementRoutes(app: FastifyInstance): Promise<void> {
  app.get("/statement/:token", async (request, reply) => {
    const { token } = parseWithSchema(tokenParamsSchema, request.params);
    const [party] = await db
      .select({
        payee: externalParties,
        role: {
          id: dealParties.id,
          name: dealParties.name,
          nameEn: dealParties.nameEn
        }
      })
      .from(externalParties)
      .leftJoin(dealParties, eq(externalParties.partyId, dealParties.id))
      .where(eq(externalParties.statementToken, token))
      .limit(1);

    if (!party) {
      return sendNotFound(reply);
    }

    const rows = await db
      .select({
        entry: externalCommissionEntries,
        business: {
          id: businesses.id,
          code: businesses.code,
          name: businesses.name,
          nameEn: businesses.nameEn
        },
        billing: {
          id: billing.id,
          refType: billing.refType,
          refId: billing.refId,
          createdAt: billing.createdAt
        },
        client: {
          id: clients.id,
          name: clients.name,
          nameEn: clients.nameEn
        }
      })
      .from(externalCommissionEntries)
      .leftJoin(businesses, eq(externalCommissionEntries.businessId, businesses.id))
      .leftJoin(billing, eq(externalCommissionEntries.billingId, billing.id))
      .leftJoin(cases, eq(billing.id, cases.billingId))
      .leftJoin(clients, eq(cases.clientId, clients.id))
      .where(eq(externalCommissionEntries.payeeId, party.payee.id))
      .orderBy(desc(externalCommissionEntries.period), desc(externalCommissionEntries.createdAt));

    const totals = rows.reduce(
      (acc, row) => {
        const amount = Number(row.entry.amountSgd);
        const amountSettled = Number(row.entry.amountSettled);
        if (row.entry.status !== "void") {
          acc.total += amount;
          acc.settled += amountSettled;
          acc.outstanding += amount - amountSettled;
        }
        return acc;
      },
      { total: 0, settled: 0, outstanding: 0 }
    );

    return {
      payee: {
        id: party.payee.id,
        name: party.payee.name,
        name_en: party.payee.nameEn,
        contact: party.payee.contact,
        role: party.role
      },
      entries: rows.map((row) => ({
        id: row.entry.id,
        billing_id: row.entry.billingId,
        business_id: row.entry.businessId,
        business: row.business,
        billing: row.billing
          ? {
              id: row.billing.id,
              ref_type: row.billing.refType,
              ref_id: row.billing.refId,
              deal_at: row.billing.createdAt
            }
          : null,
        customer: row.client,
        period: row.entry.period,
        recurrence: row.entry.recurrence,
        seq: row.entry.seq,
        amount_sgd: row.entry.amountSgd,
        amount_settled: row.entry.amountSettled,
        outstanding: (Number(row.entry.amountSgd) - Number(row.entry.amountSettled)).toFixed(2),
        status: row.entry.status,
        created_at: row.entry.createdAt
      })),
      totals: {
        total: totals.total.toFixed(2),
        settled: totals.settled.toFixed(2),
        outstanding: totals.outstanding.toFixed(2)
      }
    };
  });
}
