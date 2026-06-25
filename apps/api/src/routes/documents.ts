import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db, documents } from "@bh/db";
import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { idParamsSchema, parseWithSchema } from "./hrUtils";

const documentQuerySchema = z.object({
  client_id: z.string().uuid().optional(),
  subject_type: z.string().trim().min(1).optional(),
  subject_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  tag: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional()
});

const uploadFieldsSchema = z.object({
  subject_type: z.string().trim().min(1).optional(),
  subject_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional()
});

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

function collectTags(values: unknown[]): string[] {
  const tags = values.flatMap((value) => {
    const text = stringField(value);
    return text ? text.split(",") : [];
  });

  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))];
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

export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/documents", { preHandler: requirePerm("document.view") }, async (request) => {
    const query = parseWithSchema(documentQuerySchema, request.query);
    const filters: SQL[] = [];

    if (query.client_id) {
      filters.push(eq(documents.clientId, query.client_id));
    }
    if (query.subject_type) {
      filters.push(eq(documents.subjectType, query.subject_type));
    }
    if (query.subject_id) {
      filters.push(eq(documents.subjectId, query.subject_id));
    }
    if (query.category_id) {
      filters.push(eq(documents.categoryId, query.category_id));
    }
    if (query.tag) {
      filters.push(sql`${documents.tags} @> ARRAY[${query.tag}]::text[]`);
    }
    if (query.filename) {
      filters.push(ilike(documents.filename, `%${query.filename}%`));
    }
    if (query.date_from) {
      filters.push(gte(documents.uploadedAt, new Date(query.date_from)));
    }
    if (query.date_to) {
      filters.push(lte(documents.uploadedAt, new Date(query.date_to)));
    }

    const rows = await db
      .select()
      .from(documents)
      .where(filters.length > 0 ? and(...filters) : sql`true`)
      .orderBy(desc(documents.uploadedAt));

    return { documents: rows.map(serializeDocument) };
  });

  app.post("/documents", { preHandler: requirePerm("document.manage") }, async (request, reply) => {
    const fields: Record<string, unknown> = {};
    const tagValues: unknown[] = [];
    let uploadedDocument: typeof documents.$inferSelect | null = null;

    for await (const part of request.parts()) {
      if (part.type === "field") {
        if (part.fieldname === "tags") {
          tagValues.push(part.value);
        } else {
          fields[part.fieldname] = part.value;
        }
        continue;
      }

      if (part.fieldname !== "file" || uploadedDocument) {
        await discardFile(part.file);
        continue;
      }

      const parsedFields = uploadFieldsSchema.safeParse({
        subject_type: stringField(fields.subject_type),
        subject_id: stringField(fields.subject_id),
        client_id: stringField(fields.client_id),
        category_id: stringField(fields.category_id)
      });

      if (!parsedFields.success) {
        await discardFile(part.file);
        throw parsedFields.error;
      }

      const document = await saveUpload(part, {
        subjectType: parsedFields.data.subject_type ?? "general",
        subjectId: parsedFields.data.subject_id ?? null,
        clientId: parsedFields.data.client_id ?? null,
        categoryId: parsedFields.data.category_id ?? null,
        uploadedBy: request.user.id
      });

      if (!document) {
        throw new Error("document_upload_failed");
      }

      uploadedDocument = document;
    }

    if (!uploadedDocument) {
      return reply.code(400).send({ error: "file_required" });
    }

    const tags = collectTags(tagValues);

    if (tags.length === 0) {
      return reply.code(201).send({ document: serializeDocument(uploadedDocument) });
    }

    const [document] = await db
      .update(documents)
      .set({ tags })
      .where(eq(documents.id, uploadedDocument.id))
      .returning();

    return reply.code(201).send({ document: serializeDocument(document ?? uploadedDocument) });
  });

  app.get("/clients/:id/documents", { preHandler: requirePerm("document.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.clientId, id))
      .orderBy(desc(documents.uploadedAt));
    const groupsByCategory = new Map<string | null, (typeof documents.$inferSelect)[]>();

    for (const document of rows) {
      const group = groupsByCategory.get(document.categoryId) ?? [];
      group.push(document);
      groupsByCategory.set(document.categoryId, group);
    }

    return {
      groups: Array.from(groupsByCategory.entries()).map(([categoryId, groupDocuments]) => ({
        category_id: categoryId,
        documents: groupDocuments.map(serializeDocument)
      }))
    };
  });
}
