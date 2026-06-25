import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  contractCreateSchema,
  contractSubjectTypes,
  contractUpdateSchema,
  contractVersionStatuses,
  contractVersionUpdateSchema
} from "@bh/shared";
import { db, contracts, contractVersions, documents } from "@bh/db";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

const contractQuerySchema = z.object({
  subject_type: z.enum(contractSubjectTypes).optional(),
  subject_id: z.string().uuid().optional()
});

const uploadFieldsSchema = z.object({
  note: z.string().trim().min(1).optional(),
  status: z.enum(contractVersionStatuses).optional()
});

function serializeContract(row: typeof contracts.$inferSelect) {
  return {
    id: row.id,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    title: row.title,
    party_info: row.partyInfo,
    status: row.status,
    current_version_no: row.currentVersionNo,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function serializeVersion(row: typeof contractVersions.$inferSelect) {
  return {
    id: row.id,
    contract_id: row.contractId,
    version_no: row.versionNo,
    document_id: row.documentId,
    status: row.status,
    note: row.note,
    created_by: row.createdBy,
    created_at: row.createdAt
  };
}

function serializeDocument(row: typeof documents.$inferSelect) {
  return {
    id: row.id,
    storage_path: row.storagePath,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    uploaded_by: row.uploadedBy,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    client_id: row.clientId,
    category_id: row.categoryId,
    tags: row.tags,
    uploaded_at: row.uploadedAt
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
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

export async function registerContractRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/contracts", { preHandler: requirePerm("document.view") }, async (request) => {
    const query = parseWithSchema(contractQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.subject_type) {
      filters.push(eq(contracts.subjectType, query.subject_type));
    }
    if (query.subject_id) {
      filters.push(eq(contracts.subjectId, query.subject_id));
    }

    const rows = await db
      .select()
      .from(contracts)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(contracts.createdAt));

    return { contracts: rows.map(serializeContract) };
  });

  app.get("/contracts/:id", { preHandler: requirePerm("document.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);

    if (!contract) {
      return sendNotFound(reply);
    }

    const versions = await db
      .select()
      .from(contractVersions)
      .where(eq(contractVersions.contractId, id))
      .orderBy(desc(contractVersions.versionNo));

    return { contract: serializeContract(contract), versions: versions.map(serializeVersion) };
  });

  app.post("/contracts", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const body = parseWithSchema(contractCreateSchema, request.body);
    const [contract] = await db
      .insert(contracts)
      .values({
        subjectType: body.subject_type,
        subjectId: body.subject_id,
        title: body.title,
        partyInfo: body.party_info,
        status: body.status,
        currentVersionNo: 0
      })
      .returning();

    if (!contract) {
      throw new Error("contract_create_failed");
    }

    return reply.code(201).send({ contract: serializeContract(contract) });
  });

  app.patch("/contracts/:id", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(contractUpdateSchema, request.body);
    const [contract] = await db
      .update(contracts)
      .set({
        subjectType: body.subject_type,
        subjectId: body.subject_id,
        title: body.title,
        partyInfo: body.party_info,
        status: body.status,
        updatedAt: new Date()
      })
      .where(eq(contracts.id, id))
      .returning();

    if (!contract) {
      return sendNotFound(reply);
    }

    return { contract: serializeContract(contract) };
  });

  app.post("/contracts/:id/versions", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existingContract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);

    if (!existingContract) {
      return sendNotFound(reply);
    }

    const fields: Record<string, unknown> = {};
    let uploadedDocument: typeof documents.$inferSelect | null = null;

    for await (const part of request.parts()) {
      if (part.type === "field") {
        fields[part.fieldname] = part.value;
        continue;
      }

      if (uploadedDocument) {
        await discardFile(part.file);
        continue;
      }

      const document = await saveUpload(part, {
        subjectType: "contract_version",
        subjectId: id,
        uploadedBy: request.user.id
      });

      if (!document) {
        throw new Error("contract_version_upload_failed");
      }

      uploadedDocument = document;
    }

    if (!uploadedDocument) {
      return reply.code(400).send({ error: "file_required" });
    }

    const parsedFields = uploadFieldsSchema.safeParse({
      note: stringField(fields.note),
      status: stringField(fields.status)
    });

    if (!parsedFields.success) {
      throw parsedFields.error;
    }

    const version = await db.transaction(async (tx) => {
      const [updatedContract] = await tx
        .update(contracts)
        .set({
          currentVersionNo: sql`${contracts.currentVersionNo} + 1`,
          updatedAt: new Date()
        })
        .where(eq(contracts.id, id))
        .returning({ versionNo: contracts.currentVersionNo });

      if (!updatedContract) {
        throw new Error("contract_not_found_after_upload");
      }

      const [created] = await tx
        .insert(contractVersions)
        .values({
          contractId: id,
          versionNo: updatedContract.versionNo,
          documentId: uploadedDocument.id,
          status: parsedFields.data.status ?? "draft",
          note: parsedFields.data.note,
          createdBy: request.user.id
        })
        .returning();

      return created;
    });

    if (!version) {
      throw new Error("contract_version_create_failed");
    }

    return reply.code(201).send({
      version: serializeVersion(version),
      document: serializeDocument(uploadedDocument)
    });
  });

  app.patch("/contract-versions/:id", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(contractVersionUpdateSchema, request.body);
    const [version] = await db
      .update(contractVersions)
      .set({
        status: body.status,
        note: body.note
      })
      .where(eq(contractVersions.id, id))
      .returning();

    if (!version) {
      return sendNotFound(reply);
    }

    return { version: serializeVersion(version) };
  });
}
