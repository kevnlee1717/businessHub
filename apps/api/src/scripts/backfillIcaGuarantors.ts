/**
 * ICA 担保人回填脚本
 *
 * 从 case_submissions.note 中提取"经办:CODE"代号，按代号映射到担保人，
 * 在 guarantors 表按姓名去重（已存在复用），关联到对应 ICA case。
 * 邮箱写入 guarantors.note，密码绝不写入。
 *
 * 用法:
 *   pnpm tsx src/scripts/backfillIcaGuarantors.ts --dry-run   # 只打印统计，不写库
 *   pnpm tsx src/scripts/backfillIcaGuarantors.ts             # 实跑
 */

import { eq, sql } from "drizzle-orm";
import { cases, caseSubmissions, guarantors, db, pool } from "@bh/db";
import { clientDedupKey } from "@bh/shared";

// ─── 代号 → 担保人映射 ──────────────────────────────────────────────────────
const CODE_MAP: Record<string, { name: string; email: string }> = {
  AI: { name: "Kang Ai Lee", email: "15362881901@163.com" },
  TAN: { name: "Tan Kong Hung", email: "15362881901@sina.cn" },
  BAO: { name: "Tan Bao Xiang", email: "215506386@qq.com" },
  "JI YQ": { name: "KEE YAW KEONG (JI YAQIANG)", email: "15264878959@163.com" },
  "GOH KS": { name: "GOH KIM SWEE", email: "3204308638@qq.com" },
};

/** 归一化代号：去首尾空格 + 大写 */
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** 从单条 note 提取经办代号（可能为空） */
function extractCode(note: string): string | null {
  const m = note.match(/经办[:：]\s*([^|]+?)(?:\s*\||$)/u);
  if (!m) return null;
  // 去首尾空白，再过滤掉 Unicode PUA/不可见字符，保留 ASCII 字母/数字/空格
  const code = (m[1] ?? "")
    .trim()
    .replace(/[^\x20-\x7E]/g, "") // 只保留可打印 ASCII
    .trim();
  return code || null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("[dry-run] 模式：只打印统计，不写库\n");
  }

  // 1. 拿所有 ICA case 的 submission notes（按时间升序，最后一条最新）
  const rows = await db.execute(sql`
    SELECT
      c.id        AS case_id,
      cs.note     AS note,
      cs.created_at AS created_at
    FROM cases c
    LEFT JOIN case_submissions cs ON cs.case_id = c.id
    WHERE c.business_type = 'ica'
    ORDER BY c.id, cs.created_at ASC
  `);

  // 2. 逐 case 聚合所有代号，取出现最多的；并列取最近一轮
  const caseCodeMap = new Map<string, string>(); // caseId → winnerCode
  const caseSubmMap = new Map<
    string,
    Array<{ note: string | null; createdAt: Date | null }>
  >();

  for (const row of rows.rows) {
    const caseId = row.case_id as string;
    if (!caseSubmMap.has(caseId)) caseSubmMap.set(caseId, []);
    caseSubmMap.get(caseId)!.push({
      note: row.note as string | null,
      createdAt: row.created_at as Date | null,
    });
  }

  for (const [caseId, submissions] of caseSubmMap) {
    const codeFreq = new Map<string, number>();
    const codeLastIdx = new Map<string, number>(); // 最晚出现的索引
    for (let i = 0; i < submissions.length; i++) {
      const note = submissions[i]?.note;
      if (!note) continue;
      const code = extractCode(note);
      if (!code) continue;
      const norm = normalizeCode(code);
      codeFreq.set(norm, (codeFreq.get(norm) ?? 0) + 1);
      codeLastIdx.set(norm, i); // 覆盖即最新
    }
    if (codeFreq.size === 0) continue;

    // 找频次最高的，并列取最后出现索引最大的
    let winner: string | null = null;
    let winnerFreq = 0;
    let winnerLastIdx = -1;
    for (const [code, freq] of codeFreq) {
      const lastIdx = codeLastIdx.get(code) ?? 0;
      if (
        freq > winnerFreq ||
        (freq === winnerFreq && lastIdx > winnerLastIdx)
      ) {
        winner = code;
        winnerFreq = freq;
        winnerLastIdx = lastIdx;
      }
    }
    if (winner) caseCodeMap.set(caseId, winner);
  }

  // 3. 建担保人计划（去重聚合）
  //    key = clientDedupKey(name)，value = { name, email | null, caseIds[] }
  type GuarantorPlan = {
    name: string;
    email: string | null;
    noteText: string;
    caseIds: string[];
    unknown: boolean; // true = 代号未命中 CODE_MAP
    rawCode: string;
  };

  const planByDedup = new Map<string, GuarantorPlan>();

  const allCaseIds = [...caseSubmMap.keys()];
  const skippedCaseIds: string[] = []; // 无代号

  for (const caseId of allCaseIds) {
    const code = caseCodeMap.get(caseId);
    if (!code) {
      skippedCaseIds.push(caseId);
      continue;
    }
    const mapped = CODE_MAP[code]; // 用归一化后的 code 查表
    const name = mapped ? mapped.name : code; // 未命中 → name = 原始代号
    const email = mapped ? mapped.email : null;
    const unknown = !mapped;
    const noteText = email
      ? `邮箱: ${email}`
      : `代号未匹配名单，疑似经办人/未知担保人，待核实`;
    const dk = clientDedupKey(name);

    if (!planByDedup.has(dk)) {
      planByDedup.set(dk, { name, email, noteText, caseIds: [], unknown, rawCode: code });
    }
    planByDedup.get(dk)!.caseIds.push(caseId);
  }

  // 4. 打印 dry-run 统计
  console.log(`ICA case 总数：${allCaseIds.length}`);
  console.log(`有代号 case 数：${caseCodeMap.size}`);
  console.log(`无代号跳过 case 数：${skippedCaseIds.length}`);
  console.log(`\n将建/复用担保人 ${planByDedup.size} 位：`);
  for (const [dk, plan] of planByDedup) {
    const emailStr = plan.email ? `邮箱=${plan.email}` : `邮箱=无(未知)`;
    const unknownStr = plan.unknown ? " [代号未命中 CODE_MAP]" : "";
    console.log(
      `  [${plan.rawCode}] → ${plan.name} | ${emailStr} | 担保 ${plan.caseIds.length} 个 case${unknownStr}`
    );
  }

  if (dryRun) {
    console.log("\n[dry-run] 结束，未写库。");
    await pool.end();
    return;
  }

  // ─── 实跑 ─────────────────────────────────────────────────────────────────

  // 5. 加载已有担保人（name dedupKey → id）
  const existingGuarantors = await db.select({ id: guarantors.id, name: guarantors.name }).from(guarantors);
  const existingByDedup = new Map<string, string>(); // dedupKey → id
  for (const g of existingGuarantors) {
    existingByDedup.set(clientDedupKey(g.name), g.id);
  }

  // 6. 建担保人 & 关联 case
  let insertedCount = 0;
  let reusedCount = 0;
  let updatedCases = 0;

  for (const [dk, plan] of planByDedup) {
    let guarantorId: string;

    if (existingByDedup.has(dk)) {
      guarantorId = existingByDedup.get(dk)!;
      reusedCount++;
    } else {
      const insertResult = await db
        .insert(guarantors)
        .values({ name: plan.name, note: plan.noteText })
        .returning({ id: guarantors.id });
      const inserted = insertResult[0];
      if (!inserted) throw new Error(`担保人插入失败: ${plan.name}`);
      guarantorId = inserted.id;
      existingByDedup.set(dk, guarantorId);
      insertedCount++;
    }

    // 关联 case
    for (const caseId of plan.caseIds) {
      await db
        .update(cases)
        .set({
          guarantorId,
          guarantorName: plan.name,
          guarantorContact: plan.email ?? "",
        })
        .where(eq(cases.id, caseId));
      updatedCases++;
    }
  }

  console.log(
    `\n实跑完成：新建担保人 ${insertedCount}，复用已有担保人 ${reusedCount}，更新 case ${updatedCases} 条。`
  );
  console.log(`无代号跳过 ${skippedCaseIds.length} 个 case。`);

  await pool.end();
}

main().catch((err) => {
  console.error("脚本出错：", err);
  process.exit(1);
});
