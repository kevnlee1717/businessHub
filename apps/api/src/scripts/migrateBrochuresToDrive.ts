import {
  brochureCategories,
  brochureIndustries,
  brochureVersions,
  brochures,
  db,
  driveNodes,
  pool
} from "@bh/db";
import { asc } from "drizzle-orm";

type Stats = {
  folders: number;
  files: number;
  skipped: number;
};

async function main() {
  const stats: Stats = { folders: 0, files: 0, skipped: 0 };

  await db.transaction(async (tx) => {
    await tx.delete(driveNodes);

    const industries = await tx
      .select()
      .from(brochureIndustries)
      .orderBy(asc(brochureIndustries.sortOrder), asc(brochureIndustries.name));
    const categories = await tx
      .select()
      .from(brochureCategories)
      .orderBy(asc(brochureCategories.sortOrder), asc(brochureCategories.name));
    const brochureRows = await tx
      .select()
      .from(brochures)
      .orderBy(asc(brochures.sortOrder), asc(brochures.name));
    const versionRows = await tx.select().from(brochureVersions);

    const industryFolders = new Map<string, string>();
    const categoryFolders = new Map<string, string>();
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const versionsById = new Map(versionRows.map((version) => [version.id, version]));
    let uncategorizedFolderId: string | null = null;

    for (const industry of industries) {
      const [folder] = await tx
        .insert(driveNodes)
        .values({
          parentId: null,
          kind: "folder",
          name: industry.name,
          sortOrder: industry.sortOrder,
          createdBy: null,
          updatedAt: new Date()
        })
        .returning({ id: driveNodes.id });
      if (!folder) throw new Error("drive_industry_folder_create_failed");
      industryFolders.set(industry.id, folder.id);
      stats.folders += 1;
    }

    async function ensureUncategorizedFolder() {
      if (uncategorizedFolderId) return uncategorizedFolderId;

      const [folder] = await tx
        .insert(driveNodes)
        .values({
          parentId: null,
          kind: "folder",
          name: "未分类",
          sortOrder: 0,
          createdBy: null,
          updatedAt: new Date()
        })
        .returning({ id: driveNodes.id });
      if (!folder) throw new Error("drive_uncategorized_folder_create_failed");
      uncategorizedFolderId = folder.id;
      stats.folders += 1;
      return folder.id;
    }

    async function ensureCategoryFolder(industryId: string, categoryId: string) {
      const key = `${industryId}:${categoryId}`;
      const existing = categoryFolders.get(key);
      if (existing) return existing;

      const parentId = industryFolders.get(industryId);
      const category = categoriesById.get(categoryId);
      if (!parentId || !category) return parentId ?? ensureUncategorizedFolder();

      const [folder] = await tx
        .insert(driveNodes)
        .values({
          parentId,
          kind: "folder",
          name: category.name,
          sortOrder: category.sortOrder,
          createdBy: null,
          updatedAt: new Date()
        })
        .returning({ id: driveNodes.id });
      if (!folder) throw new Error("drive_category_folder_create_failed");
      categoryFolders.set(key, folder.id);
      stats.folders += 1;
      return folder.id;
    }

    for (const brochure of brochureRows) {
      const currentVersion = brochure.currentVersionId ? versionsById.get(brochure.currentVersionId) : null;
      if (!currentVersion) {
        stats.skipped += 1;
        console.warn(`skip brochure without current version: id=${brochure.id}, name=${brochure.name}`);
        continue;
      }

      const parentId = brochure.industryId
        ? brochure.categoryId
          ? await ensureCategoryFolder(brochure.industryId, brochure.categoryId)
          : industryFolders.get(brochure.industryId) ?? (await ensureUncategorizedFolder())
        : await ensureUncategorizedFolder();

      const [file] = await tx
        .insert(driveNodes)
        .values({
          parentId,
          kind: "file",
          name: currentVersion.filename,
          storagePath: currentVersion.storagePath,
          mime: currentVersion.mime,
          size: currentVersion.size,
          sortOrder: brochure.sortOrder,
          createdBy: null,
          updatedAt: new Date()
        })
        .returning({ id: driveNodes.id });
      if (!file) throw new Error("drive_file_node_create_failed");
      stats.files += 1;
    }
  });

  console.log(
    `brochures migrated to drive_nodes: folders=${stats.folders}, files=${stats.files}, skipped=${stats.skipped}`
  );
}

try {
  await main();
} finally {
  await pool.end();
}
