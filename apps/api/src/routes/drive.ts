import { db, driveNodes } from "@bh/db";
import { driveTreeQuery, folderCreateSchema, idParams, nodePatchSchema } from "@bh/shared";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import {
  createFolder,
  createFolderUploadTree,
  findAnyNode,
  findNode,
  insertUploadedFiles,
  isFileTooLargeError,
  isFolderMoveCyclic,
  multipartParentSchema,
  parseParentId,
  readMultipartFolderUpload,
  readMultipartWithFiles,
  readMultipartWithFirstFile,
  sendDriveFileTooLarge,
  sendDriveNodeDownload,
  serializeNode,
  softDeleteNodeTree,
  unlinkStoragePath,
  validateParentFolder,
  type DriveNodeRow,
  type FolderUploadFile,
  type UploadedFile
} from "./driveUtils";
import { parseWithSchema, sendNotFound } from "./hrUtils";

function serializeTrashNode(row: DriveNodeRow, path: string, descendantCount: number) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    size: row.size,
    deleted_at: row.deletedAt,
    path,
    descendant_count: descendantCount
  };
}

// 计算所有"带 scope 的 root 及其后代"的 id 集合(宣传册要排除这些模块子树)
function collectScopedExclusion(rows: { id: string; parentId: string | null; scope: string | null }[]) {
  const childrenByParent = new Map<string | null, string[]>();
  for (const row of rows) {
    const siblings = childrenByParent.get(row.parentId) ?? [];
    siblings.push(row.id);
    childrenByParent.set(row.parentId, siblings);
  }
  const excluded = new Set<string>();
  const stack = rows.filter((row) => row.scope).map((row) => row.id);
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || excluded.has(id)) continue;
    excluded.add(id);
    for (const childId of childrenByParent.get(id) ?? []) stack.push(childId);
  }
  return excluded;
}

async function buildActiveParentPath(parentId: string | null) {
  const names: string[] = [];
  let currentId = parentId;

  while (currentId) {
    const [parent] = await db
      .select({ id: driveNodes.id, parentId: driveNodes.parentId, name: driveNodes.name })
      .from(driveNodes)
      .where(and(eq(driveNodes.id, currentId), isNull(driveNodes.deletedAt)))
      .limit(1);
    if (!parent) break;
    names.push(parent.name);
    currentId = parent.parentId;
  }

  return names.reverse().join("/");
}

async function countDeletedDescendants(id: string) {
  const result = await db.execute(sql`
    with recursive descendants as (
      select id, parent_id
      from drive_nodes
      where parent_id = ${id} and deleted_at is not null
      union all
      select child.id, child.parent_id
      from drive_nodes child
      join descendants on child.parent_id = descendants.id
      where child.deleted_at is not null
    )
    select count(*)::int as count
    from descendants
  `);
  return Number(result.rows[0]?.count ?? 0);
}

async function getTrashTopNode(id: string) {
  const node = await findAnyNode(id);
  if (!node?.deletedAt) return null;
  if (!node.parentId) return node;
  const parent = await findAnyNode(node.parentId);
  return parent && !parent.deletedAt ? node : null;
}

async function collectBatchFileStoragePaths(deletedBatch: string) {
  const result = await db.execute(sql`
    select storage_path
    from drive_nodes
    where deleted_batch = ${deletedBatch}
      and kind = 'file'
      and storage_path is not null
  `);
  return result.rows.map((row) => String(row.storage_path));
}

async function collectAllTrashFileStoragePaths() {
  const result = await db.execute(sql`
    select storage_path
    from drive_nodes
    where deleted_at is not null
      and kind = 'file'
      and storage_path is not null
  `);
  return result.rows.map((row) => String(row.storage_path));
}

export async function registerDriveRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/drive/tree", { preHandler: requirePerm("brochure.view") }, async (request) => {
    parseWithSchema(driveTreeQuery, request.query);
    const rows = await db
      .select()
      .from(driveNodes)
      .where(isNull(driveNodes.deletedAt))
      .orderBy(sql`case when ${driveNodes.kind} = 'folder' then 0 else 1 end`, asc(driveNodes.name));

    // 模块隔离:排除带 scope 的 root(EP案件/ICA案件/陆老师厨房 等)及其整棵子树,宣传册只看通用池
    const excluded = collectScopedExclusion(rows);
    return { nodes: rows.filter((row) => !excluded.has(row.id)).map((row) => serializeNode(row)) };
  });

  app.post("/drive/folders", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const body = parseWithSchema(folderCreateSchema, request.body);
    const parentId = parseParentId(body.parent_id);
    if (!(await validateParentFolder(parentId, reply))) return;

    const row = await createFolder(parentId, body.name, request.user.id);
    return reply.code(201).send({ node: serializeNode(row) });
  });

  app.post("/drive/files", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    let files: UploadedFile[] = [];

    try {
      const multipart = await readMultipartWithFiles(request);
      files = multipart.files;
      if (files.length === 0) return reply.code(400).send({ error: "file_required" });

      const body = parseWithSchema(multipartParentSchema, multipart.fields);
      const parentId = parseParentId(body.parent_id);
      if (!(await validateParentFolder(parentId, reply))) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const rows = await insertUploadedFiles(parentId, files, request.user.id);

      return reply.code(201).send({ nodes: rows.map((row) => serializeNode(row)) });
    } catch (error) {
      await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.post("/drive/upload-folder", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    let files: FolderUploadFile[] = [];

    try {
      const multipart = await readMultipartFolderUpload(request);
      files = multipart.files;
      if (files.length === 0) return reply.code(400).send({ error: "file_required" });

      const body = parseWithSchema(multipartParentSchema, multipart.fields);
      const parentId = parseParentId(body.parent_id);
      if (!(await validateParentFolder(parentId, reply))) {
        await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
        return;
      }

      const result = await createFolderUploadTree(parentId, files, request.user.id);

      return reply.code(201).send({
        created_folders: result.createdFolders,
        created_files: result.createdFiles,
        top_folders: result.topFolders.map((row) => serializeNode(row))
      });
    } catch (error) {
      await Promise.all(files.map((file) => unlinkStoragePath(file.storagePath)));
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      if (error instanceof Error && error.message === "invalid_relative_path") {
        return reply.code(400).send({ error: "invalid_relative_path" });
      }
      throw error;
    }
  });

  app.patch("/drive/nodes/:id", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const body = parseWithSchema(nodePatchSchema, request.body);
    const existing = await findNode(id);
    if (!existing) return sendNotFound(reply);

    const parentId = body.parent_id === undefined ? undefined : parseParentId(body.parent_id);
    if (parentId !== undefined) {
      if (!(await validateParentFolder(parentId, reply))) return;
      if (existing.kind === "folder" && (await isFolderMoveCyclic(id, parentId))) {
        return reply.code(400).send({ error: "cyclic_parent" });
      }
    }

    const [row] = await db
      .update(driveNodes)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
      .returning();
    if (!row) return sendNotFound(reply);
    return { node: serializeNode(row) };
  });

  app.post("/drive/nodes/:id/replace", { preHandler: requirePerm("brochure.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    let file: UploadedFile | null = null;

    try {
      const multipart = await readMultipartWithFirstFile(request);
      file = multipart.file;
      if (!file) return reply.code(400).send({ error: "file_required" });

      const existing = await findNode(id);
      if (!existing) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }
      if (existing.kind !== "file") {
        await unlinkStoragePath(file.storagePath);
        return reply.code(400).send({ error: "file_node_required" });
      }

      const [row] = await db
        .update(driveNodes)
        .set({
          name: file.filename,
          storagePath: file.storagePath,
          mime: file.mime,
          size: file.size,
          updatedAt: new Date()
        })
        .where(and(eq(driveNodes.id, id), isNull(driveNodes.deletedAt)))
        .returning();
      if (!row) {
        await unlinkStoragePath(file.storagePath);
        return sendNotFound(reply);
      }

      await unlinkStoragePath(existing.storagePath);
      return { node: serializeNode(row) };
    } catch (error) {
      await unlinkStoragePath(file?.storagePath);
      if (isFileTooLargeError(error)) {
        return sendDriveFileTooLarge(reply);
      }
      throw error;
    }
  });

  app.get("/drive/trash", { preHandler: requirePerm("brochure.admin") }, async () => {
    const rows = await db
      .select()
      .from(driveNodes)
      .where(
        and(
          isNotNull(driveNodes.deletedAt),
          sql`(${driveNodes.parentId} is null or exists (
            select 1
            from drive_nodes parent
            where parent.id = ${driveNodes.parentId}
              and parent.deleted_at is null
          ))`
        )
      )
      .orderBy(sql`${driveNodes.deletedAt} desc`, asc(driveNodes.name));

    // 模块隔离:回收站也排除带 scope 的模块子树(用全表 scope 闭包判断)
    const allRows = await db
      .select({ id: driveNodes.id, parentId: driveNodes.parentId, scope: driveNodes.scope })
      .from(driveNodes);
    const excluded = collectScopedExclusion(allRows);
    const visibleRows = rows.filter((row) => !excluded.has(row.id));

    const nodes = await Promise.all(
      visibleRows.map(async (row) => {
        const path = await buildActiveParentPath(row.parentId);
        const descendantCount = row.kind === "folder" ? await countDeletedDescendants(row.id) : 0;
        return serializeTrashNode(row, path, descendantCount);
      })
    );

    return { nodes };
  });

  app.post("/drive/trash/:id/restore", { preHandler: requirePerm("brochure.admin") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const root = await getTrashTopNode(id);
    if (!root) return sendNotFound(reply);
    if (!root.deletedBatch) return reply.code(400).send({ error: "deleted_batch_required" });
    const deletedBatch = root.deletedBatch;

    await db.transaction(async (tx) => {
      let restoreParentId = root.parentId;
      if (restoreParentId) {
        const [parent] = await tx.select().from(driveNodes).where(eq(driveNodes.id, restoreParentId)).limit(1);
        if (!parent || parent.deletedAt) {
          restoreParentId = null;
        }
      }

      if (restoreParentId !== root.parentId) {
        await tx.update(driveNodes).set({ parentId: restoreParentId, updatedAt: new Date() }).where(eq(driveNodes.id, root.id));
      }

      await tx
        .update(driveNodes)
        .set({ deletedAt: null, deletedBatch: null, updatedAt: new Date() })
        .where(eq(driveNodes.deletedBatch, deletedBatch));
    });

    return { ok: true };
  });

  app.delete("/drive/trash/:id", { preHandler: requirePerm("brochure.admin") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const root = await getTrashTopNode(id);
    if (!root) return sendNotFound(reply);
    if (!root.deletedBatch) return reply.code(400).send({ error: "deleted_batch_required" });

    const storagePaths = await collectBatchFileStoragePaths(root.deletedBatch);
    const [row] = await db.delete(driveNodes).where(eq(driveNodes.id, root.id)).returning({ id: driveNodes.id });
    if (!row) return sendNotFound(reply);
    await Promise.all(storagePaths.map((storagePath) => unlinkStoragePath(storagePath)));
    return { ok: true };
  });

  app.delete("/drive/trash", { preHandler: requirePerm("brochure.admin") }, async () => {
    const storagePaths = await collectAllTrashFileStoragePaths();
    await db.delete(driveNodes).where(isNotNull(driveNodes.deletedAt));
    await Promise.all(storagePaths.map((storagePath) => unlinkStoragePath(storagePath)));
    return { ok: true };
  });

  app.delete("/drive/nodes/:id", { preHandler: requirePerm("brochure.admin") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const existing = await findNode(id);
    if (!existing) return sendNotFound(reply);

    const deletedCount = await softDeleteNodeTree(id);
    if (deletedCount === 0) return sendNotFound(reply);
    return { ok: true };
  });

  app.get("/drive/nodes/:id/download", { preHandler: requirePerm("brochure.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParams, request.params);
    const sent = await sendDriveNodeDownload(id, reply);
    if (!sent) return sendNotFound(reply);
    return sent;
  });
}
