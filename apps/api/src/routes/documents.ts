import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db, documents } from "@bh/db";
import { and, count, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { deleteUpload, saveUpload } from "../lib/files";
import { getPagination, paginationQuery } from "../lib/pagination";
import { idParamsSchema, parseWithSchema } from "./hrUtils";

// 「文档」模块（检索页 / 客户资料库）只展示公司内部资料。
// EP/ICA/毕业证等业务文档存在同一张 documents 表但有各自的 subject_type，
// 通过白名单把它们挡在文档模块之外（数据不删，业务页仍走各自接口查看）。
export const INTERNAL_DOCUMENT_SUBJECT_TYPES = ["general", "company"] as const;

const documentQuerySchema = z
  .object({
    client_id: z.string().uuid().optional(),
    subject_type: z.string().trim().min(1).optional(),
    subject_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    folder_prefix: z.string().trim().min(1).optional(),
    tag: z.string().trim().min(1).optional(),
    filename: z.string().trim().min(1).optional(),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional()
  })
  .merge(paginationQuery);

const uploadFieldsSchema = z.object({
  subject_type: z.string().trim().min(1).optional(),
  subject_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  folder_path: z.string().trim().min(1).optional(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
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
    folder_path: row.folderPath,
    period: row.period,
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
    } else {
      // 检索页从不指定 subject_type → 收敛到公司内部资料；
      // 毕业证/公司tab 等会显式带 subject_type，走上面的分支原样放行。
      filters.push(inArray(documents.subjectType, [...INTERNAL_DOCUMENT_SUBJECT_TYPES]));
    }
    if (query.subject_id) {
      filters.push(eq(documents.subjectId, query.subject_id));
    }
    if (query.category_id) {
      filters.push(eq(documents.categoryId, query.category_id));
    }
    if (query.folder_prefix) {
      // 公司文件库按 folder_path 前缀过滤;转义 LIKE 通配符,只做前缀匹配。
      const escaped = query.folder_prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      filters.push(sql`${documents.folderPath} LIKE ${`${escaped}%`}`);
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

    const pagination = getPagination(query);
    const whereClause = filters.length > 0 ? and(...filters) : sql`true`;
    const rows = pagination.paginate
      ? await db
          .select()
          .from(documents)
          .where(whereClause)
          .orderBy(desc(documents.uploadedAt))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db
          .select()
          .from(documents)
          .where(whereClause)
          .orderBy(desc(documents.uploadedAt));

    if (!pagination.paginate) {
      return { documents: rows.map(serializeDocument) };
    }

    const [totalRow] = await db.select({ value: count() }).from(documents).where(whereClause);

    return {
      documents: rows.map(serializeDocument),
      total: totalRow?.value ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
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
        category_id: stringField(fields.category_id),
        folder_path: stringField(fields.folder_path),
        period: stringField(fields.period)
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
        folderPath: parsedFields.data.folder_path ?? null,
        period: parsedFields.data.period ?? null,
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

  app.delete("/documents/:id", { preHandler: requirePerm("document.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    if (row) {
      await db.delete(documents).where(eq(documents.id, id));
      await deleteUpload(row.storagePath);
    }
    return { ok: true } as const;
  });

  app.get("/clients/:id/documents", { preHandler: requirePerm("document.view") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const query = parseWithSchema(paginationQuery, request.query);
    const pagination = getPagination(query);
    const whereClause = and(
      eq(documents.clientId, id),
      inArray(documents.subjectType, [...INTERNAL_DOCUMENT_SUBJECT_TYPES])
    );
    const rows = pagination.paginate
      ? await db
          .select()
          .from(documents)
          .where(whereClause)
          .orderBy(desc(documents.uploadedAt))
          .limit(pagination.limit)
          .offset(pagination.offset)
      : await db
          .select()
          .from(documents)
          .where(whereClause)
          .orderBy(desc(documents.uploadedAt));
    const groupsByCategory = new Map<string | null, (typeof documents.$inferSelect)[]>();

    for (const document of rows) {
      const group = groupsByCategory.get(document.categoryId) ?? [];
      group.push(document);
      groupsByCategory.set(document.categoryId, group);
    }

    const groups = Array.from(groupsByCategory.entries()).map(([categoryId, groupDocuments]) => ({
      category_id: categoryId,
      documents: groupDocuments.map(serializeDocument)
    }));

    if (!pagination.paginate) {
      return { groups };
    }

    const [totalRow] = await db.select({ value: count() }).from(documents).where(whereClause);

    return {
      groups,
      total: totalRow?.value ?? 0,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  });
}
