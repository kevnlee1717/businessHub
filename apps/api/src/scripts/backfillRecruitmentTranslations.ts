import { db, pool, recruitmentIndustries, recruitmentJobs, translations } from "@bh/db";
import { and, eq } from "drizzle-orm";
import { saveTranslation } from "../lib/translationStore";

const RECRUITMENT_JOB_ENTITY = "recruitment_job";
const RECRUITMENT_INDUSTRY_ENTITY = "recruitment_industry";

const jobFields = [
  { field: "title", getText: (row: typeof recruitmentJobs.$inferSelect) => row.title },
  { field: "jobContent", getText: (row: typeof recruitmentJobs.$inferSelect) => row.jobContent },
  { field: "requirements", getText: (row: typeof recruitmentJobs.$inferSelect) => row.requirements },
  { field: "salaryNote", getText: (row: typeof recruitmentJobs.$inferSelect) => row.salaryNote }
] as const;

type Stats = {
  rows: number;
  filled: number;
  skippedExisting: number;
  skippedEmpty: number;
};

async function hasTranslation(entityType: string, entityId: string, field: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(
      and(
        eq(translations.entityType, entityType),
        eq(translations.entityId, entityId),
        eq(translations.field, field)
      )
    )
    .limit(1);

  return Boolean(existing);
}

async function backfillJobTranslations(): Promise<Stats> {
  const rows = await db.select().from(recruitmentJobs);
  const stats: Stats = { rows: rows.length, filled: 0, skippedExisting: 0, skippedEmpty: 0 };

  for (const row of rows) {
    for (const field of jobFields) {
      const text = field.getText(row)?.trim();
      if (!text) {
        stats.skippedEmpty += 1;
        continue;
      }

      if (await hasTranslation(RECRUITMENT_JOB_ENTITY, row.id, field.field)) {
        stats.skippedExisting += 1;
        continue;
      }

      await saveTranslation(RECRUITMENT_JOB_ENTITY, row.id, field.field, text);
      stats.filled += 1;
      console.log(`[jobs] filled ${stats.filled}: ${row.id} ${field.field}`);
    }
  }

  return stats;
}

async function backfillIndustryTranslations(): Promise<Stats> {
  const rows = await db.select().from(recruitmentIndustries);
  const stats: Stats = { rows: rows.length, filled: 0, skippedExisting: 0, skippedEmpty: 0 };

  for (const row of rows) {
    const text = row.name.trim();
    if (!text) {
      stats.skippedEmpty += 1;
      continue;
    }

    if (await hasTranslation(RECRUITMENT_INDUSTRY_ENTITY, row.id, "name")) {
      stats.skippedExisting += 1;
      continue;
    }

    await saveTranslation(RECRUITMENT_INDUSTRY_ENTITY, row.id, "name", text);
    stats.filled += 1;
    console.log(`[industries] filled ${stats.filled}: ${row.id} name`);
  }

  return stats;
}

function printStats(label: string, stats: Stats) {
  console.log(
    `${label}: rows=${stats.rows}, filled=${stats.filled}, skippedExisting=${stats.skippedExisting}, skippedEmpty=${stats.skippedEmpty}`
  );
}

async function main() {
  console.log("Backfilling recruitment translations...");
  const jobStats = await backfillJobTranslations();
  const industryStats = await backfillIndustryTranslations();

  printStats("jobs", jobStats);
  printStats("industries", industryStats);
  console.log(
    `total: rows=${jobStats.rows + industryStats.rows}, filled=${jobStats.filled + industryStats.filled}, skippedExisting=${jobStats.skippedExisting + industryStats.skippedExisting}, skippedEmpty=${jobStats.skippedEmpty + industryStats.skippedEmpty}`
  );
}

try {
  await main();
} finally {
  await pool.end();
}
