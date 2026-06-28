import {
  companies,
  db,
  employees,
  franchiseContacts,
  franchiseFnbSites,
  franchiseFnbSurveys,
  franchiseFnbVisits,
  franchiseOrgs,
  franchiseProperties,
  franchisePropertySurveys,
  franchisePropertyVisits
} from "@bh/db";
import {
  franchiseContactCreateSchema,
  franchiseContactListQuerySchema,
  franchiseContactUpdateSchema,
  franchiseFnbSiteCreateSchema,
  franchiseFnbSiteListQuerySchema,
  franchiseFnbSiteUpdateSchema,
  franchiseFnbVisitCreateSchema,
  franchiseFnbVisitListQuerySchema,
  franchiseKpiQuerySchema,
  franchiseOrgCreateSchema,
  franchiseOrgListQuerySchema,
  franchiseOrgUpdateSchema,
  franchisePropertyCreateSchema,
  franchisePropertyListQuerySchema,
  franchisePropertyUpdateSchema,
  franchisePropertyVisitCreateSchema,
  franchisePropertyVisitListQuerySchema,
  franchiseVisitListQuerySchema
} from "@bh/shared";
import { and, asc, count, desc, eq, gte, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { companyFilter, getAccessibleCompanyIds } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { endOfDate, idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

function hasOwn(input: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function booleanValue(value: unknown) {
  return value === "1" || value === "true";
}

function mustReturn<T>(row: T | undefined, error = "db_write_failed"): T {
  if (!row) throw new Error(error);
  return row;
}

function pageLimit(query: { page?: number | undefined; page_size?: number | undefined }) {
  const limit = query.page_size ?? 100;
  return { limit, offset: ((query.page ?? 1) - 1) * limit };
}

async function assertCompanyAccess(request: FastifyRequest, reply: FastifyReply, companyId: string | null | undefined) {
  const companyIds = await getAccessibleCompanyIds(request);
  if (companyIds !== "all" && (!companyId || !companyIds.includes(companyId))) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function getAccessibleFilter(request: FastifyRequest, column: any): Promise<SQL | undefined> {
  return companyFilter(await getAccessibleCompanyIds(request), column);
}

async function defaultCompanyIdForRequest(request: FastifyRequest): Promise<string | null> {
  const [employee] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, request.user.id)).limit(1);
  if (employee?.companyId) return employee.companyId;

  const companyIds = await getAccessibleCompanyIds(request);
  if (companyIds !== "all") return companyIds[0] ?? null;

  const [company] = await db.select({ id: companies.id }).from(companies).orderBy(asc(companies.name)).limit(1);
  return company?.id ?? null;
}

async function resolveCompanyId(request: FastifyRequest, reply: FastifyReply, companyId: string | null | undefined) {
  const resolved = companyId ?? (await defaultCompanyIdForRequest(request));
  if (!resolved) {
    reply.code(400).send({ error: "company_required" });
    return null;
  }
  if (!(await assertCompanyAccess(request, reply, resolved))) return null;
  return resolved;
}

function serializeOrg(row: typeof franchiseOrgs.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    type: row.type,
    note: row.note,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeContact(row: typeof franchiseContacts.$inferSelect, org?: typeof franchiseOrgs.$inferSelect | null) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    role: row.role,
    phone: row.phone,
    org_id: row.orgId,
    org: org ? serializeOrg(org) : null,
    referred_by_contact_id: row.referredByContactId,
    next_visit_at: row.nextVisitAt,
    owner_id: row.ownerId,
    note: row.note,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeProperty(row: typeof franchiseProperties.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    property_type: row.propertyType,
    address: row.address,
    org_id: row.orgId,
    is_vending_site: row.isVendingSite,
    vending_note: row.vendingNote,
    introduced_by_contact_id: row.introducedByContactId,
    relationship_note: row.relationshipNote,
    priority: row.priority,
    footfall: row.footfall,
    decision_maker: row.decisionMaker,
    has_public_space: row.hasPublicSpace,
    status: row.status,
    owner_id: row.ownerId,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializePropertySurvey(row: typeof franchisePropertySurveys.$inferSelect | null | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.companyId,
    visit_id: row.visitId,
    interested_services: row.interestedServices,
    details: row.details,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializePropertyVisit(
  row: typeof franchisePropertyVisits.$inferSelect,
  survey?: typeof franchisePropertySurveys.$inferSelect | null
) {
  return {
    id: row.id,
    type: "property" as const,
    company_id: row.companyId,
    property_id: row.propertyId,
    contact_id: row.contactId,
    by_employee_id: row.byEmployeeId,
    visited_at: row.visitedAt,
    interest_level: row.interestLevel,
    services_pitched: row.servicesPitched,
    result: row.result,
    note: row.note,
    survey: serializePropertySurvey(survey),
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeFnbSite(row: typeof franchiseFnbSites.$inferSelect) {
  return {
    id: row.id,
    company_id: row.companyId,
    name: row.name,
    org_id: row.orgId,
    location: row.location,
    has_aircon: row.hasAircon,
    introduced_by_contact_id: row.introducedByContactId,
    relationship_note: row.relationshipNote,
    priority: row.priority,
    status: row.status,
    owner_id: row.ownerId,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeFnbSurvey(row: typeof franchiseFnbSurveys.$inferSelect | null | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.companyId,
    visit_id: row.visitId,
    rent_fixed: row.rentFixed,
    rent_revenue_share_pct: row.rentRevenueSharePct,
    management_fee: row.managementFee,
    dishwash_fee: row.dishwashFee,
    contract_expiry: row.contractExpiry,
    extra: row.extra,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeFnbVisit(row: typeof franchiseFnbVisits.$inferSelect, survey?: typeof franchiseFnbSurveys.$inferSelect | null) {
  return {
    id: row.id,
    type: "fnb" as const,
    company_id: row.companyId,
    site_id: row.siteId,
    contact_id: row.contactId,
    by_employee_id: row.byEmployeeId,
    visited_at: row.visitedAt,
    interest_level: row.interestLevel,
    result: row.result,
    note: row.note,
    survey: serializeFnbSurvey(survey),
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function visitDateFilters(
  from: string | undefined,
  to: string | undefined,
  employeeId: string | undefined,
  visitedAt: any,
  byEmployeeId: any
) {
  const filters: SQL[] = [];
  if (from) filters.push(gte(visitedAt, new Date(from)));
  if (to) filters.push(lte(visitedAt, endOfDate(to)));
  if (employeeId) filters.push(eq(byEmployeeId, employeeId));
  return filters;
}

export async function registerFranchiseRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/franchise/orgs", { preHandler: requirePerm("franchise.view") }, async (request) => {
    const query = parseWithSchema(franchiseOrgListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, franchiseOrgs.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.type) filters.push(eq(franchiseOrgs.type, query.type));
    if (query.q) filters.push(sql`${franchiseOrgs.name} ilike ${`%${query.q}%`}`);
    const { limit, offset } = pageLimit(query);
    const rows = await db
      .select()
      .from(franchiseOrgs)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(asc(franchiseOrgs.name))
      .limit(limit)
      .offset(offset);
    return { orgs: rows.map(serializeOrg), resources: rows.map(serializeOrg) };
  });

  app.post("/franchise/orgs", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const body = parseWithSchema(franchiseOrgCreateSchema, request.body);
    const companyId = await resolveCompanyId(request, reply, body.company_id);
    if (!companyId) return;
    const [org] = await db.insert(franchiseOrgs).values({ companyId, name: body.name, type: body.type, note: body.note }).returning();
    const resource = serializeOrg(mustReturn(org));
    return reply.code(201).send({ org: resource, resource });
  });

  app.patch("/franchise/orgs/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(franchiseOrgUpdateSchema, request.body);
    const [existing] = await db.select().from(franchiseOrgs).where(eq(franchiseOrgs.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const update: Partial<typeof franchiseOrgs.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.type !== undefined) update.type = body.type;
    if (hasOwn(body, "note")) update.note = body.note;
    const [org] = await db.update(franchiseOrgs).set(update).where(eq(franchiseOrgs.id, id)).returning();
    const resource = serializeOrg(mustReturn(org));
    return { org: resource, resource };
  });

  app.delete("/franchise/orgs/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(franchiseOrgs).where(eq(franchiseOrgs.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    await db.delete(franchiseOrgs).where(eq(franchiseOrgs.id, id));
    return reply.code(204).send();
  });

  app.get("/franchise/contacts", { preHandler: requirePerm("franchise.view") }, async (request) => {
    const query = parseWithSchema(franchiseContactListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, franchiseContacts.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.due_before) filters.push(lte(franchiseContacts.nextVisitAt, new Date(query.due_before)));
    if (query.owner_id) filters.push(eq(franchiseContacts.ownerId, query.owner_id));
    if (query.org_id) filters.push(eq(franchiseContacts.orgId, query.org_id));
    if (query.q) {
      filters.push(or(sql`${franchiseContacts.name} ilike ${`%${query.q}%`}`, sql`${franchiseContacts.phone} ilike ${`%${query.q}%`}`, sql`${franchiseContacts.role} ilike ${`%${query.q}%`}`)!);
    }
    const { limit, offset } = pageLimit(query);
    const rows = await db
      .select({ contact: franchiseContacts, org: franchiseOrgs })
      .from(franchiseContacts)
      .leftJoin(franchiseOrgs, eq(franchiseContacts.orgId, franchiseOrgs.id))
      .where(and(...filters, query.org_type ? eq(franchiseOrgs.type, query.org_type) : sql`true`))
      .orderBy(asc(franchiseContacts.nextVisitAt), asc(franchiseContacts.name))
      .limit(limit)
      .offset(offset);
    const contacts = rows.map((row) => serializeContact(row.contact, row.org));
    return { contacts, resources: contacts };
  });

  app.post("/franchise/contacts", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const body = parseWithSchema(franchiseContactCreateSchema, request.body);
    const companyId = await resolveCompanyId(request, reply, body.company_id);
    if (!companyId) return;
    const [contact] = await db
      .insert(franchiseContacts)
      .values({
        companyId,
        name: body.name,
        role: body.role,
        phone: body.phone,
        orgId: body.org_id,
        referredByContactId: body.referred_by_contact_id,
        nextVisitAt: body.next_visit_at ? new Date(body.next_visit_at) : undefined,
        ownerId: body.owner_id,
        note: body.note
      })
      .returning();
    const resource = serializeContact(mustReturn(contact));
    return reply.code(201).send({ contact: resource, resource });
  });

  app.patch("/franchise/contacts/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(franchiseContactUpdateSchema, request.body);
    const [existing] = await db.select().from(franchiseContacts).where(eq(franchiseContacts.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const update: Partial<typeof franchiseContacts.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (hasOwn(body, "role")) update.role = body.role;
    if (hasOwn(body, "phone")) update.phone = body.phone;
    if (hasOwn(body, "org_id")) update.orgId = body.org_id;
    if (hasOwn(body, "referred_by_contact_id")) update.referredByContactId = body.referred_by_contact_id;
    if (hasOwn(body, "next_visit_at")) update.nextVisitAt = body.next_visit_at ? new Date(body.next_visit_at) : null;
    if (hasOwn(body, "owner_id")) update.ownerId = body.owner_id;
    if (hasOwn(body, "note")) update.note = body.note;
    const [contact] = await db.update(franchiseContacts).set(update).where(eq(franchiseContacts.id, id)).returning();
    const resource = serializeContact(mustReturn(contact));
    return { contact: resource, resource };
  });

  app.delete("/franchise/contacts/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(franchiseContacts).where(eq(franchiseContacts.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    await db.delete(franchiseContacts).where(eq(franchiseContacts.id, id));
    return reply.code(204).send();
  });

  app.get("/franchise/properties", { preHandler: requirePerm("franchise.view") }, async (request) => {
    const query = parseWithSchema(franchisePropertyListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, franchiseProperties.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.is_vending_site) filters.push(eq(franchiseProperties.isVendingSite, booleanValue(query.is_vending_site)));
    if (query.priority) filters.push(eq(franchiseProperties.priority, query.priority));
    if (query.status) filters.push(eq(franchiseProperties.status, query.status));
    if (query.owner_id) filters.push(eq(franchiseProperties.ownerId, query.owner_id));
    if (query.q) filters.push(or(sql`${franchiseProperties.name} ilike ${`%${query.q}%`}`, sql`${franchiseProperties.address} ilike ${`%${query.q}%`}`)!);
    const { limit, offset } = pageLimit(query);
    const rows = await db
      .select()
      .from(franchiseProperties)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(desc(franchiseProperties.createdAt))
      .limit(limit)
      .offset(offset);
    return { properties: rows.map(serializeProperty), resources: rows.map(serializeProperty) };
  });

  app.post("/franchise/properties", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const body = parseWithSchema(franchisePropertyCreateSchema, request.body);
    const companyId = await resolveCompanyId(request, reply, body.company_id);
    if (!companyId) return;
    const [property] = await db.insert(franchiseProperties).values(toPropertyInsert({ ...body, company_id: companyId })).returning();
    const resource = serializeProperty(mustReturn(property));
    return reply.code(201).send({ property: resource, resource });
  });

  app.patch("/franchise/properties/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(franchisePropertyUpdateSchema, request.body);
    const [existing] = await db.select().from(franchiseProperties).where(eq(franchiseProperties.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const update = toPropertyUpdate(body);
    const [property] = await db.update(franchiseProperties).set(update).where(eq(franchiseProperties.id, id)).returning();
    const resource = serializeProperty(mustReturn(property));
    return { property: resource, resource };
  });

  app.delete("/franchise/properties/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(franchiseProperties).where(eq(franchiseProperties.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    await db.delete(franchiseProperties).where(eq(franchiseProperties.id, id));
    return reply.code(204).send();
  });

  app.get("/franchise/properties/:id/visits", { preHandler: requirePerm("franchise.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(franchisePropertyVisitListQuerySchema, request.query);
    const [property] = await db.select().from(franchiseProperties).where(eq(franchiseProperties.id, id)).limit(1);
    if (!property) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, property.companyId))) return;
    const filters = [eq(franchisePropertyVisits.propertyId, id), ...visitDateFilters(query.from, query.to, query.employee_id, franchisePropertyVisits.visitedAt, franchisePropertyVisits.byEmployeeId)];
    const rows = await db
      .select({ visit: franchisePropertyVisits, survey: franchisePropertySurveys })
      .from(franchisePropertyVisits)
      .leftJoin(franchisePropertySurveys, eq(franchisePropertySurveys.visitId, franchisePropertyVisits.id))
      .where(and(...filters))
      .orderBy(desc(franchisePropertyVisits.visitedAt));
    const visits = rows.map((row) => serializePropertyVisit(row.visit, row.survey));
    return { visits, resources: visits };
  });

  app.post("/franchise/properties/:id/visits", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [property] = await db.select().from(franchiseProperties).where(eq(franchiseProperties.id, id)).limit(1);
    if (!property) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, property.companyId))) return;
    const body = parseWithSchema(franchisePropertyVisitCreateSchema, { ...((request.body ?? {}) as object), property_id: id, company_id: property.companyId });
    const result = await db.transaction(async (tx) => {
      const [visit] = await tx
        .insert(franchisePropertyVisits)
        .values({
          companyId: property.companyId,
          propertyId: id,
          contactId: body.contact_id,
          byEmployeeId: body.by_employee_id,
          visitedAt: new Date(body.visited_at),
          interestLevel: body.interest_level,
          servicesPitched: body.services_pitched,
          result: body.result,
          note: body.note
        })
        .returning();
      const savedVisit = mustReturn(visit);
      let survey: typeof franchisePropertySurveys.$inferSelect | null = null;
      if (body.survey) {
        const [savedSurvey] = await tx
          .insert(franchisePropertySurveys)
          .values({
            companyId: property.companyId,
            visitId: savedVisit.id,
            interestedServices: body.survey.interested_services,
            details: body.survey.details
          })
          .returning();
        survey = mustReturn(savedSurvey);
      }
      return { visit: savedVisit, survey };
    });
    const resource = serializePropertyVisit(result.visit, result.survey);
    return reply.code(201).send({ visit: resource, resource });
  });

  app.get("/franchise/fnb-sites", { preHandler: requirePerm("franchise.view") }, async (request) => {
    const query = parseWithSchema(franchiseFnbSiteListQuerySchema, request.query);
    const filters: SQL[] = [];
    const accessFilter = await getAccessibleFilter(request, franchiseFnbSites.companyId);
    if (accessFilter) filters.push(accessFilter);
    if (query.priority) filters.push(eq(franchiseFnbSites.priority, query.priority));
    if (query.status) filters.push(eq(franchiseFnbSites.status, query.status));
    if (query.owner_id) filters.push(eq(franchiseFnbSites.ownerId, query.owner_id));
    if (query.q) filters.push(or(sql`${franchiseFnbSites.name} ilike ${`%${query.q}%`}`, sql`${franchiseFnbSites.location} ilike ${`%${query.q}%`}`)!);
    const { limit, offset } = pageLimit(query);
    const rows = await db
      .select()
      .from(franchiseFnbSites)
      .where(filters.length ? and(...filters) : sql`true`)
      .orderBy(desc(franchiseFnbSites.createdAt))
      .limit(limit)
      .offset(offset);
    return { sites: rows.map(serializeFnbSite), fnb_sites: rows.map(serializeFnbSite), resources: rows.map(serializeFnbSite) };
  });

  app.post("/franchise/fnb-sites", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const body = parseWithSchema(franchiseFnbSiteCreateSchema, request.body);
    const companyId = await resolveCompanyId(request, reply, body.company_id);
    if (!companyId) return;
    const [site] = await db.insert(franchiseFnbSites).values(toFnbSiteInsert({ ...body, company_id: companyId })).returning();
    const resource = serializeFnbSite(mustReturn(site));
    return reply.code(201).send({ site: resource, resource });
  });

  app.patch("/franchise/fnb-sites/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(franchiseFnbSiteUpdateSchema, request.body);
    const [existing] = await db.select().from(franchiseFnbSites).where(eq(franchiseFnbSites.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    const [site] = await db.update(franchiseFnbSites).set(toFnbSiteUpdate(body)).where(eq(franchiseFnbSites.id, id)).returning();
    const resource = serializeFnbSite(mustReturn(site));
    return { site: resource, resource };
  });

  app.delete("/franchise/fnb-sites/:id", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existing] = await db.select().from(franchiseFnbSites).where(eq(franchiseFnbSites.id, id)).limit(1);
    if (!existing) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, existing.companyId))) return;
    await db.delete(franchiseFnbSites).where(eq(franchiseFnbSites.id, id));
    return reply.code(204).send();
  });

  app.get("/franchise/fnb-sites/:id/visits", { preHandler: requirePerm("franchise.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(franchiseFnbVisitListQuerySchema, request.query);
    const [site] = await db.select().from(franchiseFnbSites).where(eq(franchiseFnbSites.id, id)).limit(1);
    if (!site) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, site.companyId))) return;
    const filters = [eq(franchiseFnbVisits.siteId, id), ...visitDateFilters(query.from, query.to, query.employee_id, franchiseFnbVisits.visitedAt, franchiseFnbVisits.byEmployeeId)];
    const rows = await db
      .select({ visit: franchiseFnbVisits, survey: franchiseFnbSurveys })
      .from(franchiseFnbVisits)
      .leftJoin(franchiseFnbSurveys, eq(franchiseFnbSurveys.visitId, franchiseFnbVisits.id))
      .where(and(...filters))
      .orderBy(desc(franchiseFnbVisits.visitedAt));
    const visits = rows.map((row) => serializeFnbVisit(row.visit, row.survey));
    return { visits, resources: visits };
  });

  app.post("/franchise/fnb-sites/:id/visits", { preHandler: requirePerm("franchise.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [site] = await db.select().from(franchiseFnbSites).where(eq(franchiseFnbSites.id, id)).limit(1);
    if (!site) return sendNotFound(reply);
    if (!(await assertCompanyAccess(request, reply, site.companyId))) return;
    const body = parseWithSchema(franchiseFnbVisitCreateSchema, { ...((request.body ?? {}) as object), site_id: id, company_id: site.companyId });
    const result = await db.transaction(async (tx) => {
      const [visit] = await tx
        .insert(franchiseFnbVisits)
        .values({
          companyId: site.companyId,
          siteId: id,
          contactId: body.contact_id,
          byEmployeeId: body.by_employee_id,
          visitedAt: new Date(body.visited_at),
          interestLevel: body.interest_level,
          result: body.result,
          note: body.note
        })
        .returning();
      const savedVisit = mustReturn(visit);
      let survey: typeof franchiseFnbSurveys.$inferSelect | null = null;
      if (body.survey) {
        const [savedSurvey] = await tx
          .insert(franchiseFnbSurveys)
          .values({
            companyId: site.companyId,
            visitId: savedVisit.id,
            rentFixed: toNumeric(body.survey.rent_fixed),
            rentRevenueSharePct: toNumeric(body.survey.rent_revenue_share_pct),
            managementFee: toNumeric(body.survey.management_fee),
            dishwashFee: toNumeric(body.survey.dishwash_fee),
            contractExpiry: body.survey.contract_expiry,
            extra: body.survey.extra
          })
          .returning();
        survey = mustReturn(savedSurvey);
      }
      return { visit: savedVisit, survey };
    });
    const resource = serializeFnbVisit(result.visit, result.survey);
    return reply.code(201).send({ visit: resource, resource });
  });

  app.get("/franchise/visits", { preHandler: requirePerm("franchise.view") }, async (request) => {
    const query = parseWithSchema(franchiseVisitListQuerySchema, request.query);
    const propertyAccess = await getAccessibleFilter(request, franchisePropertyVisits.companyId);
    const fnbAccess = await getAccessibleFilter(request, franchiseFnbVisits.companyId);
    const propertyFilters = [...visitDateFilters(query.from, query.to, query.employee_id, franchisePropertyVisits.visitedAt, franchisePropertyVisits.byEmployeeId)];
    const fnbFilters = [...visitDateFilters(query.from, query.to, query.employee_id, franchiseFnbVisits.visitedAt, franchiseFnbVisits.byEmployeeId)];
    if (propertyAccess) propertyFilters.push(propertyAccess);
    if (fnbAccess) fnbFilters.push(fnbAccess);
    const [propertyRows, fnbRows] = await Promise.all([
      db
        .select({ visit: franchisePropertyVisits, survey: franchisePropertySurveys })
        .from(franchisePropertyVisits)
        .leftJoin(franchisePropertySurveys, eq(franchisePropertySurveys.visitId, franchisePropertyVisits.id))
        .where(propertyFilters.length ? and(...propertyFilters) : sql`true`),
      db
        .select({ visit: franchiseFnbVisits, survey: franchiseFnbSurveys })
        .from(franchiseFnbVisits)
        .leftJoin(franchiseFnbSurveys, eq(franchiseFnbSurveys.visitId, franchiseFnbVisits.id))
        .where(fnbFilters.length ? and(...fnbFilters) : sql`true`)
    ]);
    const visits = [...propertyRows.map((row) => serializePropertyVisit(row.visit, row.survey)), ...fnbRows.map((row) => serializeFnbVisit(row.visit, row.survey))].sort(
      (a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime()
    );
    return { visits, resources: visits };
  });

  app.get("/franchise/kpi", { preHandler: requirePerm("franchise.view") }, async (request) => {
    const query = parseWithSchema(franchiseKpiQuerySchema, request.query);
    const kpi = await buildKpi(request, query);
    return { kpi, resource: kpi };
  });
}

function toPropertyInsert(body: any): typeof franchiseProperties.$inferInsert {
  return {
    companyId: body.company_id,
    name: body.name,
    propertyType: body.property_type,
    address: body.address,
    orgId: body.org_id,
    isVendingSite: body.is_vending_site,
    vendingNote: body.vending_note,
    introducedByContactId: body.introduced_by_contact_id,
    relationshipNote: body.relationship_note,
    priority: body.priority,
    footfall: body.footfall,
    decisionMaker: body.decision_maker,
    hasPublicSpace: body.has_public_space,
    status: body.status,
    ownerId: body.owner_id
  };
}

function toPropertyUpdate(body: any): Partial<typeof franchiseProperties.$inferInsert> {
  const update: Partial<typeof franchiseProperties.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) update.name = body.name;
  if (body.property_type !== undefined) update.propertyType = body.property_type;
  if (hasOwn(body, "address")) update.address = body.address;
  if (hasOwn(body, "org_id")) update.orgId = body.org_id;
  if (body.is_vending_site !== undefined) update.isVendingSite = body.is_vending_site;
  if (hasOwn(body, "vending_note")) update.vendingNote = body.vending_note;
  if (hasOwn(body, "introduced_by_contact_id")) update.introducedByContactId = body.introduced_by_contact_id;
  if (hasOwn(body, "relationship_note")) update.relationshipNote = body.relationship_note;
  if (body.priority !== undefined) update.priority = body.priority;
  if (hasOwn(body, "footfall")) update.footfall = body.footfall;
  if (hasOwn(body, "decision_maker")) update.decisionMaker = body.decision_maker;
  if (hasOwn(body, "has_public_space")) update.hasPublicSpace = body.has_public_space;
  if (body.status !== undefined) update.status = body.status;
  if (hasOwn(body, "owner_id")) update.ownerId = body.owner_id;
  return update;
}

function toFnbSiteInsert(body: any): typeof franchiseFnbSites.$inferInsert {
  return {
    companyId: body.company_id,
    name: body.name,
    orgId: body.org_id,
    location: body.location,
    hasAircon: body.has_aircon,
    introducedByContactId: body.introduced_by_contact_id,
    relationshipNote: body.relationship_note,
    priority: body.priority,
    status: body.status,
    ownerId: body.owner_id
  };
}

function toFnbSiteUpdate(body: any): Partial<typeof franchiseFnbSites.$inferInsert> {
  const update: Partial<typeof franchiseFnbSites.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) update.name = body.name;
  if (hasOwn(body, "org_id")) update.orgId = body.org_id;
  if (hasOwn(body, "location")) update.location = body.location;
  if (hasOwn(body, "has_aircon")) update.hasAircon = body.has_aircon;
  if (hasOwn(body, "introduced_by_contact_id")) update.introducedByContactId = body.introduced_by_contact_id;
  if (hasOwn(body, "relationship_note")) update.relationshipNote = body.relationship_note;
  if (body.priority !== undefined) update.priority = body.priority;
  if (body.status !== undefined) update.status = body.status;
  if (hasOwn(body, "owner_id")) update.ownerId = body.owner_id;
  return update;
}

async function buildKpi(
  request: FastifyRequest,
  query: { from?: string | undefined; to?: string | undefined; employee_id?: string | undefined; due_days?: number | undefined }
) {
  const [propertyAccess, fnbAccess, contactAccess] = await Promise.all([
    getAccessibleFilter(request, franchiseProperties.companyId),
    getAccessibleFilter(request, franchiseFnbSites.companyId),
    getAccessibleFilter(request, franchiseContacts.companyId)
  ]);
  const propertyVisitAccess = await getAccessibleFilter(request, franchisePropertyVisits.companyId);
  const fnbVisitAccess = await getAccessibleFilter(request, franchiseFnbVisits.companyId);
  const propertyVisitFilters = visitDateFilters(query.from, query.to, query.employee_id, franchisePropertyVisits.visitedAt, franchisePropertyVisits.byEmployeeId);
  const fnbVisitFilters = visitDateFilters(query.from, query.to, query.employee_id, franchiseFnbVisits.visitedAt, franchiseFnbVisits.byEmployeeId);
  if (propertyVisitAccess) propertyVisitFilters.push(propertyVisitAccess);
  if (fnbVisitAccess) fnbVisitFilters.push(fnbVisitAccess);

  const [propertyVisitRows, fnbVisitRows, properties, fnbSites, propertySurveyRows, fnbSurveyRows, dueRows, employeeRows] = await Promise.all([
    db
      .select({ employeeId: franchisePropertyVisits.byEmployeeId, total: count() })
      .from(franchisePropertyVisits)
      .where(propertyVisitFilters.length ? and(...propertyVisitFilters) : sql`true`)
      .groupBy(franchisePropertyVisits.byEmployeeId),
    db
      .select({ employeeId: franchiseFnbVisits.byEmployeeId, total: count() })
      .from(franchiseFnbVisits)
      .where(fnbVisitFilters.length ? and(...fnbVisitFilters) : sql`true`)
      .groupBy(franchiseFnbVisits.byEmployeeId),
    db.select().from(franchiseProperties).where(and(propertyAccess ?? sql`true`, query.employee_id ? eq(franchiseProperties.ownerId, query.employee_id) : sql`true`)),
    db.select().from(franchiseFnbSites).where(and(fnbAccess ?? sql`true`, query.employee_id ? eq(franchiseFnbSites.ownerId, query.employee_id) : sql`true`)),
    db
      .select({ employeeId: franchisePropertyVisits.byEmployeeId, total: count() })
      .from(franchisePropertySurveys)
      .innerJoin(franchisePropertyVisits, eq(franchisePropertySurveys.visitId, franchisePropertyVisits.id))
      .where(propertyVisitFilters.length ? and(...propertyVisitFilters) : sql`true`)
      .groupBy(franchisePropertyVisits.byEmployeeId),
    db
      .select({ employeeId: franchiseFnbVisits.byEmployeeId, total: count() })
      .from(franchiseFnbSurveys)
      .innerJoin(franchiseFnbVisits, eq(franchiseFnbSurveys.visitId, franchiseFnbVisits.id))
      .where(fnbVisitFilters.length ? and(...fnbVisitFilters) : sql`true`)
      .groupBy(franchiseFnbVisits.byEmployeeId),
    db
      .select({ contact: franchiseContacts, org: franchiseOrgs })
      .from(franchiseContacts)
      .leftJoin(franchiseOrgs, eq(franchiseContacts.orgId, franchiseOrgs.id))
      .where(
        and(
          contactAccess ?? sql`true`,
          isNotNull(franchiseContacts.nextVisitAt),
          lte(franchiseContacts.nextVisitAt, new Date(Date.now() + (query.due_days ?? 7) * 24 * 60 * 60 * 1000)),
          query.employee_id ? eq(franchiseContacts.ownerId, query.employee_id) : sql`true`
        )
      )
      .orderBy(asc(franchiseContacts.nextVisitAt))
      .limit(20),
    db.select({ id: employees.id, name: employees.name }).from(employees)
  ]);

  const employeeNames = new Map(employeeRows.map((row) => [row.id, row.name]));
  const visitVolume = mergeEmployeeCounts(propertyVisitRows, fnbVisitRows, employeeNames);
  const surveyCollection = mergeEmployeeCounts(propertySurveyRows, fnbSurveyRows, employeeNames);
  const propertyHighIds = new Set<string>();
  const fnbHighIds = new Set<string>();
  const [propertyHighRows, fnbHighRows] = await Promise.all([
    db
      .select({ propertyId: franchisePropertyVisits.propertyId })
      .from(franchisePropertyVisits)
      .where(and(...propertyVisitFilters, eq(franchisePropertyVisits.interestLevel, "high"))),
    db
      .select({ siteId: franchiseFnbVisits.siteId })
      .from(franchiseFnbVisits)
      .where(and(...fnbVisitFilters, eq(franchiseFnbVisits.interestLevel, "high")))
  ]);
  for (const row of propertyHighRows) propertyHighIds.add(row.propertyId);
  for (const row of fnbHighRows) fnbHighIds.add(row.siteId);

  return {
    visit_volume: visitVolume,
    site_coverage: {
      total: properties.length + fnbSites.length,
      property_total: properties.length,
      fnb_total: fnbSites.length,
      visited: properties.filter((row) => row.status !== "unvisited").length + fnbSites.filter((row) => row.status !== "unvisited").length,
      pending: properties.filter((row) => row.status === "unvisited").length + fnbSites.filter((row) => row.status === "unvisited").length,
      vending_sites: properties.filter((row) => row.isVendingSite).length,
      vending_ratio: properties.length ? properties.filter((row) => row.isVendingSite).length / properties.length : 0
    },
    survey_collection: {
      total: surveyCollection.reduce((sum, row) => sum + row.count, 0),
      by_employee: surveyCollection
    },
    interest_funnel: {
      high_interest_sites: propertyHighIds.size + fnbHighIds.size,
      won_sites: properties.filter((row) => row.status === "won").length + fnbSites.filter((row) => row.status === "won").length
    },
    due_contacts: dueRows.map((row) => serializeContact(row.contact, row.org))
  };
}

function mergeEmployeeCounts(
  a: { employeeId: string; total: number | string }[],
  b: { employeeId: string; total: number | string }[],
  names: Map<string, string>
) {
  const totals = new Map<string, number>();
  for (const row of [...a, ...b]) totals.set(row.employeeId, (totals.get(row.employeeId) ?? 0) + Number(row.total));
  return [...totals.entries()]
    .map(([employeeId, total]) => ({ employee_id: employeeId, employee_name: names.get(employeeId) ?? null, count: total }))
    .sort((left, right) => right.count - left.count);
}
