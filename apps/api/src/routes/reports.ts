import { gstQuerySchema, reportQuerySchema } from "@bh/shared";
import { type FastifyInstance } from "fastify";
import { getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { parseWithSchema } from "./hrUtils";
import { buildGstEstimate, buildPnl, listReportCompanies, pnlToCsv } from "./reportUtils";

const SGT_OFFSET_HOURS = 8;

function todaySgt(now = new Date()): string {
  const sgt = new Date(now.getTime() + SGT_OFFSET_HOURS * 60 * 60 * 1000);
  return `${sgt.getUTCFullYear()}-${String(sgt.getUTCMonth() + 1).padStart(2, "0")}-${String(sgt.getUTCDate()).padStart(2, "0")}`;
}

function withDefaultPeriod<T extends { from?: string | undefined; to?: string | undefined }>(
  query: T
): T & { from: string; to: string } {
  const today = todaySgt();
  const year = today.slice(0, 4);
  return {
    ...query,
    from: query.from ?? `${year}-01-01`,
    to: query.to ?? today
  };
}

function filenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "all";
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/reports/pnl", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const query = withDefaultPeriod(parseWithSchema(reportQuerySchema, request.query));
    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all" && query.company_id && !companyIds.includes(query.company_id)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const allowedCompanyIds = companyIds === "all" ? undefined : companyIds;
    const pnl = await buildPnl(query.company_id ?? null, query.from, query.to, allowedCompanyIds);

    if (query.company_id) {
      return pnl;
    }

    const companyRows = await listReportCompanies(allowedCompanyIds);
    const byCompany = await Promise.all(
      companyRows.map((company) => buildPnl(company.id, query.from, query.to))
    );

    return {
      ...pnl,
      by_company: byCompany
    };
  });

  app.get("/reports/pnl.csv", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const query = withDefaultPeriod(parseWithSchema(reportQuerySchema, request.query));
    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all" && query.company_id && !companyIds.includes(query.company_id)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const pnl = await buildPnl(
      query.company_id ?? null,
      query.from,
      query.to,
      companyIds === "all" ? undefined : companyIds
    );
    const scope = query.company_id ? filenamePart(pnl.company.name) : "all";

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="pnl_${scope}_${query.from}_${query.to}.csv"`
    );
    return reply.send(pnlToCsv(pnl));
  });

  app.get("/reports/gst", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const query = withDefaultPeriod(parseWithSchema(gstQuerySchema, request.query));
    const companyIds = await getAccessibleCompanyIds(request);

    if (companyIds !== "all" && query.company_id && !companyIds.includes(query.company_id)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const rate = typeof query.rate === "number" ? query.rate : 0.09;
    return buildGstEstimate(
      query.company_id ?? null,
      query.from,
      query.to,
      rate,
      companyIds === "all" ? undefined : companyIds
    );
  });
}
