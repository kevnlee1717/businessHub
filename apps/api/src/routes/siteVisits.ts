import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db, siteVisits } from "@bh/db";
import { can, siteVisitOverrideSchema, siteVisitQuerySchema } from "@bh/shared";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const siteVisitClientSchema = z.object({
  client_id: z.string().uuid()
});

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function serializeSiteVisit(row: typeof siteVisits.$inferSelect) {
  return {
    id: row.id,
    employee_id: row.employeeId,
    client_id: row.clientId,
    captured_at: row.capturedAt,
    synced_at: row.syncedAt,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    address: row.address,
    selfie_document_id: row.selfieDocumentId,
    site_photo_document_ids: row.sitePhotoDocumentIds,
    face_challenge_id: row.faceChallengeId,
    face_status: row.faceStatus,
    face_similarity: row.faceSimilarity,
    distance_to_lead_m: row.distanceToLeadM,
    note: row.note,
    status: row.status,
    reject_reason: row.rejectReason,
    overridden_by: row.overriddenBy,
    overridden_at: row.overriddenAt,
    created_at: row.createdAt
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  const text = stringField(value);
  if (text === undefined) {
    return undefined;
  }

  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

async function discardFile(file: NodeJS.ReadableStream): Promise<void> {
  await pipeline(
    file,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      }
    })
  );
}

export async function registerSiteVisitRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.post("/site-visits", { preHandler: requirePerm("attendance.self") }, async (request, reply) => {
    const fields: Record<string, unknown> = {};
    let selfieDocumentId: string | null = null;
    const sitePhotoDocumentIds: string[] = [];

    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname === "selfie") {
          const document = await saveUpload(part, {
            subjectType: "site_visit_selfie",
            uploadedBy: request.user.id
          });
          if (!document) {
            throw new Error("site_visit_selfie_upload_failed");
          }
          selfieDocumentId = document.id;
        } else if (part.fieldname === "photos" && sitePhotoDocumentIds.length < 20) {
          const document = await saveUpload(part, {
            subjectType: "site_visit_photo",
            uploadedBy: request.user.id
          });
          if (!document) {
            throw new Error("site_visit_photo_upload_failed");
          }
          sitePhotoDocumentIds.push(document.id);
        } else {
          await discardFile(part.file);
        }
        continue;
      }

      if (part.type === "field") {
        fields[part.fieldname] = part.value;
      }
    }

    const lat = numberField(fields.lat);
    const lng = numberField(fields.lng);

    if (lat === undefined || lng === undefined) {
      return reply.code(400).send({ error: "location_required" });
    }

    const leadLat = numberField(fields.lead_lat);
    const leadLng = numberField(fields.lead_lng);
    const accuracy = numberField(fields.accuracy);
    const distanceToLead =
      leadLat !== undefined && leadLng !== undefined ? haversineMeters(lat, lng, leadLat, leadLng) : null;
    const distanceToLeadM = distanceToLead === null ? null : distanceToLead.toFixed(2);
    const rejectReason = distanceToLead !== null && distanceToLead > 1000 ? "distance_to_lead>1000m" : null;
    const status = rejectReason ? "rejected_distance" : "verified";
    const capturedAtText = stringField(fields.captured_at);

    const [siteVisit] = await db
      .insert(siteVisits)
      .values({
        employeeId: request.user.id,
        clientId: stringField(fields.client_id) ?? null,
        capturedAt: capturedAtText ? new Date(capturedAtText) : null,
        syncedAt: new Date(),
        lat: String(lat),
        lng: String(lng),
        accuracy: accuracy !== undefined ? String(accuracy) : null,
        address: stringField(fields.address) ?? null,
        selfieDocumentId,
        sitePhotoDocumentIds,
        faceChallengeId: null,
        faceStatus: "skipped",
        faceSimilarity: null,
        distanceToLeadM,
        note: stringField(fields.note) ?? null,
        status,
        rejectReason
      })
      .returning();

    if (!siteVisit) {
      throw new Error("site_visit_create_failed");
    }

    return reply.code(201).send({ siteVisit: serializeSiteVisit(siteVisit) });
  });

  app.get("/site-visits", async (request) => {
    const query = parseWithSchema(siteVisitQuerySchema, request.query);
    const filters: SQL[] = [];
    const canManage = can(request.user.role, "attendance.manage");

    if (canManage) {
      if (query.employee_id) {
        filters.push(eq(siteVisits.employeeId, query.employee_id));
      }
    } else {
      filters.push(eq(siteVisits.employeeId, request.user.id));
    }

    if (query.status) {
      filters.push(eq(siteVisits.status, query.status));
    }

    const rows = await db
      .select()
      .from(siteVisits)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(siteVisits.createdAt));

    return { siteVisits: rows.map(serializeSiteVisit) };
  });

  app.get("/site-visits/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [siteVisit] = await db.select().from(siteVisits).where(eq(siteVisits.id, id)).limit(1);

    if (!siteVisit) {
      return sendNotFound(reply);
    }

    if (siteVisit.employeeId !== request.user.id && !can(request.user.role, "attendance.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return { siteVisit: serializeSiteVisit(siteVisit) };
  });

  app.patch("/site-visits/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(siteVisitClientSchema, request.body);
    const [existing] = await db.select().from(siteVisits).where(eq(siteVisits.id, id)).limit(1);

    if (!existing) {
      return sendNotFound(reply);
    }

    if (existing.employeeId !== request.user.id && !can(request.user.role, "attendance.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const [siteVisit] = await db
      .update(siteVisits)
      .set({ clientId: body.client_id })
      .where(eq(siteVisits.id, id))
      .returning();

    return { siteVisit: serializeSiteVisit(siteVisit ?? existing) };
  });

  app.post("/site-visits/:id/override", { preHandler: requirePerm("attendance.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(siteVisitOverrideSchema, request.body);
    const [siteVisit] = await db
      .update(siteVisits)
      .set({
        status: body.status,
        rejectReason: body.reject_reason ?? null,
        overriddenBy: request.user.id,
        overriddenAt: new Date()
      })
      .where(eq(siteVisits.id, id))
      .returning();

    if (!siteVisit) {
      return sendNotFound(reply);
    }

    return { siteVisit: serializeSiteVisit(siteVisit) };
  });
}
