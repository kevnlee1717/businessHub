import {
  db,
  employees,
  franchiseProperties,
  franchisePropertySurveys,
  franchisePropertyVisits,
  ipadSlides
} from "@bh/db";
import { kioskVisitCreateSchema } from "@bh/shared";
import { asc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { parseWithSchema, sendNotFound } from "./hrUtils";

function serializeSlide(row: typeof ipadSlides.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    url: `/uploads/${row.storagePath}`,
    thumb_url: row.thumbPath ? `/uploads/${row.thumbPath}` : null,
    orientation: row.orientation,
    sort_order: row.sortOrder
  };
}

export async function registerKioskRoutes(app: FastifyInstance): Promise<void> {
  // Intentionally public: /ipad is a no-login kiosk product surface.
  app.get("/kiosk/slides", async () => {
    const rows = await db.select().from(ipadSlides).orderBy(asc(ipadSlides.sortOrder), asc(ipadSlides.createdAt));
    return { slides: rows.map(serializeSlide) };
  });

  app.get("/kiosk/properties", async () => {
    const rows = await db
      .select({
        id: franchiseProperties.id,
        name: franchiseProperties.name,
        address: franchiseProperties.address,
        property_type: franchiseProperties.propertyType
      })
      .from(franchiseProperties)
      .orderBy(asc(franchiseProperties.name));

    return { properties: rows };
  });

  app.get("/kiosk/employees", async () => {
    const rows = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.status, "active"))
      .orderBy(asc(employees.name));

    return { employees: rows };
  });

  app.post("/kiosk/visits", async (request, reply) => {
    const body = parseWithSchema(kioskVisitCreateSchema, request.body);
    const [property] = await db.select().from(franchiseProperties).where(eq(franchiseProperties.id, body.property_id)).limit(1);
    if (!property) return sendNotFound(reply);

    const result = await db.transaction(async (tx) => {
      const [visit] = await tx
        .insert(franchisePropertyVisits)
        .values({
          companyId: property.companyId,
          propertyId: property.id,
          byEmployeeId: body.by_employee_id,
          status: "completed",
          plannedAt: new Date(body.visited_at),
          visitedAt: new Date(body.visited_at),
          interestLevel: body.interest_level,
          servicesPitched: body.services_pitched,
          note: body.note
        })
        .returning();
      if (!visit) throw new Error("kiosk_visit_create_failed");

      if (body.survey) {
        await tx.insert(franchisePropertySurveys).values({
          companyId: property.companyId,
          visitId: visit.id,
          interestedServices: body.survey.interested_services,
          details: body.survey.details
        });
      }

      return visit;
    });

    return reply.code(201).send({ visit: { id: result.id } });
  });
}
