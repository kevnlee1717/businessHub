/**
 * ICA 拒信日期回填脚本
 *
 * 从 merged.json(子 agent 抽取的拒绝日期)把 rejected_at 回填到 case_submissions 表。
 * 只处理 decision='rejected' 且有 date 的条目，其余跳过。
 *
 * 用法:
 *   pnpm tsx src/scripts/backfillIcaExtraction.ts --dry-run   # 只打印将更新的记录
 *   pnpm tsx src/scripts/backfillIcaExtraction.ts             # 实跑回填
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { caseSubmissions, db, pool } from "@bh/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MERGED_JSON_PATH =
  "/tmp/claude-1000/-home-john-project-businessHub/4cf9b7aa-6421-4a98-9ac4-4af481a3a1bf/scratchpad/ica_extract/merged.json";

interface ExtractionEntry {
  decision: string | null;
  date: string | null;
  sourceFile: string;
  note: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("[dry-run] 模式：只打印将更新的记录，不写库");
  }

  // 1. 读取 merged.json
  const raw = readFileSync(MERGED_JSON_PATH, "utf-8");
  const data: Record<string, ExtractionEntry> = JSON.parse(raw);

  // 筛选出 rejected + 有日期的条目
  const toProcess = Object.entries(data).filter(
    ([, entry]) => entry.decision === "rejected" && entry.date
  );

  console.log(`\n合计 ${Object.keys(data).length} 个 AppealID，其中 rejected+有日期: ${toProcess.length} 个`);
  console.log("──────────────────────────────────────────────────────────");

  let attempted = 0;
  let succeeded = 0;
  let notMatched: string[] = [];

  for (const [appealId, entry] of toProcess) {
    attempted++;
    const rejectedAt = new Date(entry.date! + "T00:00:00Z");

    // 2. 按 appealId 找 case_submission（note 含该 appealId，result='rejected'）
    const rows = await db
      .select({ id: caseSubmissions.id, note: caseSubmissions.note })
      .from(caseSubmissions)
      .where(
        and(
          eq(caseSubmissions.result, "rejected"),
          sql`${caseSubmissions.note} like ${("%" + appealId + "%") as string}`
        )
      );

    if (rows.length === 0) {
      console.warn(`[WARN] 未匹配: ${appealId} — 库里没有 result=rejected 且 note 含此 ID 的记录`);
      notMatched.push(appealId);
      continue;
    }

    if (rows.length > 1) {
      console.warn(`[WARN] ${appealId} 匹配到 ${rows.length} 条记录，取第一条 id=${rows[0]!.id}`);
    }

    const row = rows[0]!;

    if (dryRun) {
      console.log(`[dry-run] 将更新: id=${row.id} | appealId=${appealId} | rejectedAt=${entry.date}`);
    } else {
      await db
        .update(caseSubmissions)
        .set({ rejectedAt })
        .where(eq(caseSubmissions.id, row.id));
      console.log(`[OK] 已回填: id=${row.id} | appealId=${appealId} | rejectedAt=${entry.date}`);
    }

    succeeded++;
  }

  console.log("──────────────────────────────────────────────────────────");
  console.log(`统计:`);
  console.log(`  尝试回填: ${attempted}`);
  console.log(`  成功匹配并${dryRun ? "（将）" : ""}更新: ${succeeded}`);
  console.log(`  未匹配: ${notMatched.length}`);
  if (notMatched.length > 0) {
    console.log(`  未匹配 AppealID 列表: ${notMatched.join(", ")}`);
  }

  if (dryRun) {
    console.log("\n[dry-run] 未写库，去掉 --dry-run 后实跑");
  }
}

main().finally(() => pool.end());
