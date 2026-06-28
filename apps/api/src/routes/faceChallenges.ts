import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { attendanceRecords, db, faceBaselines, faceChallenges, siteVisits } from "@bh/db";
import {
  faceChallengeCreateSchema,
  faceChallengeResultSchema,
  faceChallengeStatuses,
  facePurposes,
  faceRandomCheckSchema
} from "@bh/shared";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { ctxCan } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeChallenge(row: typeof faceChallenges.$inferSelect) {
  return {
    id: row.id,
    employee_id: row.employeeId,
    purpose: row.purpose,
    status: row.status,
    nonce: row.nonce,
    similarity: row.similarity,
    liveness_action_passed: row.livenessActionPassed,
    liveness_color_score: row.livenessColorScore,
    baseline_id: row.baselineId,
    failure_reason: row.failureReason,
    related_attendance_id: row.relatedAttendanceId,
    related_site_visit_id: row.relatedSiteVisitId,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeBaseline(row: typeof faceBaselines.$inferSelect) {
  return {
    id: row.id,
    employee_id: row.employeeId,
    photo_path: row.photoPath,
    embedding_model: row.embeddingModel,
    embedding_dim: row.embeddingDim,
    enrolled_at: row.enrolledAt,
    retired_at: row.retiredAt
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
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

async function findActiveBaseline(employeeId: string) {
  const [baseline] = await db
    .select()
    .from(faceBaselines)
    .where(and(eq(faceBaselines.employeeId, employeeId), isNull(faceBaselines.retiredAt)))
    .limit(1);

  return baseline ?? null;
}

const faceChallengeQuerySchema = z.object({
  employee_id: z.string().uuid().optional(),
  status: z.enum(faceChallengeStatuses).optional(),
  purpose: z.enum(facePurposes).optional()
});

function mapSiteVisitFaceStatus(status: (typeof faceChallengeStatuses)[number]) {
  if (status === "passed") {
    return "passed";
  }

  if (status === "failed") {
    return "failed";
  }

  return "pending";
}

export async function registerFaceChallengeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.post("/face/baselines", { preHandler: requirePerm("attendance.self") }, async (request, reply) => {
    const fields: Record<string, unknown> = {};
    let photoPath: string | null = null;

    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname === "photo") {
          const document = await saveUpload(part, {
            subjectType: "face_baseline",
            uploadedBy: request.user.id
          });
          if (!document) {
            throw new Error("face_baseline_upload_failed");
          }
          photoPath = document.storagePath;
        } else {
          await discardFile(part.file);
        }
        continue;
      }

      if (part.type === "field") {
        fields[part.fieldname] = part.value;
      }
    }

    const targetId = stringField(fields.employee_id) ?? request.user.id;

    if (targetId !== request.user.id && !(await ctxCan(request, "attendance.manage"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (!photoPath) {
      return reply.code(400).send({ error: "photo_required" });
    }

    const baseline = await db.transaction(async (tx) => {
      await tx
        .update(faceBaselines)
        .set({ retiredAt: new Date() })
        .where(and(eq(faceBaselines.employeeId, targetId), isNull(faceBaselines.retiredAt)));

      const [created] = await tx
        .insert(faceBaselines)
        .values({
          employeeId: targetId,
          photoPath,
          embedding: null,
          embeddingDim: null
        })
        .returning();

      return created;
    });

    if (!baseline) {
      throw new Error("face_baseline_create_failed");
    }

    return reply.code(201).send({ baseline: serializeBaseline(baseline) });
  });

  app.get("/face/baselines/:id", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);

    if (id !== request.user.id && !(await ctxCan(request, "attendance.manage"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const baseline = await findActiveBaseline(id);
    return { baseline: baseline ? serializeBaseline(baseline) : null };
  });

  app.post("/face/challenges", { preHandler: requirePerm("attendance.self") }, async (request, reply) => {
    const body = parseWithSchema(faceChallengeCreateSchema, request.body);
    const baseline = await findActiveBaseline(request.user.id);
    const [challenge] = await db
      .insert(faceChallenges)
      .values({
        employeeId: request.user.id,
        purpose: body.purpose,
        status: "pushed",
        nonce: randomUUID(),
        baselineId: baseline?.id ?? null,
        relatedAttendanceId: body.related_attendance_id ?? null,
        relatedSiteVisitId: body.related_site_visit_id ?? null,
        clientIp: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      })
      .returning();

    if (!challenge) {
      throw new Error("face_challenge_create_failed");
    }

    return reply.code(201).send({ challenge: serializeChallenge(challenge) });
  });

  app.post("/face/random-check", { preHandler: requirePerm("attendance.manage") }, async (request, reply) => {
    const body = parseWithSchema(faceRandomCheckSchema, request.body);
    const baseline = await findActiveBaseline(body.employee_id);
    const [challenge] = await db
      .insert(faceChallenges)
      .values({
        employeeId: body.employee_id,
        purpose: "random_check",
        status: "pending_push",
        nonce: randomUUID(),
        baselineId: baseline?.id ?? null,
        clientIp: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      })
      .returning();

    if (!challenge) {
      throw new Error("face_challenge_create_failed");
    }

    return reply.code(201).send({ challenge: serializeChallenge(challenge) });
  });

  app.post("/face/challenges/:id/result", async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(faceChallengeResultSchema, request.body);
    const [existing] = await db.select().from(faceChallenges).where(eq(faceChallenges.id, id)).limit(1);

    if (!existing) {
      return sendNotFound(reply);
    }

    if (body.nonce !== existing.nonce) {
      return reply.code(409).send({ error: "nonce_mismatch" });
    }

    const [challenge] = await db
      .update(faceChallenges)
      .set({
        status: body.status,
        similarity: body.similarity === undefined ? null : String(body.similarity),
        livenessActionPassed: body.liveness_action_passed ?? null,
        livenessColorScore: body.liveness_color_score === undefined ? null : String(body.liveness_color_score),
        failureReason: body.failure_reason ?? null,
        baselineId: body.baseline_id ?? existing.baselineId,
        updatedAt: new Date()
      })
      .where(eq(faceChallenges.id, id))
      .returning();

    if (!challenge) {
      throw new Error("face_challenge_update_failed");
    }

    if (existing.relatedAttendanceId) {
      await db
        .update(attendanceRecords)
        .set({
          facePass: body.status === "passed",
          faceSimilarity: body.similarity === undefined ? null : String(body.similarity),
          faceChallengeId: challenge.id
        })
        .where(eq(attendanceRecords.id, existing.relatedAttendanceId));
    }

    if (existing.relatedSiteVisitId) {
      await db
        .update(siteVisits)
        .set({
          faceStatus: mapSiteVisitFaceStatus(body.status),
          faceSimilarity: body.similarity === undefined ? null : String(body.similarity),
          faceChallengeId: challenge.id
        })
        .where(eq(siteVisits.id, existing.relatedSiteVisitId));
    }

    return { challenge: serializeChallenge(challenge) };
  });

  app.get("/face/challenges", { preHandler: requirePerm("attendance.manage") }, async (request) => {
    const query = parseWithSchema(faceChallengeQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.employee_id) {
      filters.push(eq(faceChallenges.employeeId, query.employee_id));
    }

    if (query.status) {
      filters.push(eq(faceChallenges.status, query.status));
    }

    if (query.purpose) {
      filters.push(eq(faceChallenges.purpose, query.purpose));
    }

    const rows = await db
      .select()
      .from(faceChallenges)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(faceChallenges.createdAt));

    return { challenges: rows.map(serializeChallenge) };
  });
}
