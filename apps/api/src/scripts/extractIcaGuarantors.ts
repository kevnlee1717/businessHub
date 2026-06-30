/**
 * ICA 担保人提取导入脚本
 *
 * 数据源: ./data/ica-guarantor-map.json (由 form14.pdf 子agent 提取合并而来)
 *   - matches: 把担保人写回缺担保人的 ICA 案件(按 case_id 定位,仅当 guarantor_id 为空才写)
 *   - corrections: 把库里占位代号担保人(CAT/S9408/...)还原成真名 + 补 NRIC;
 *                  若真名/NRIC 已存在另一担保人 → 合并(把代号的案件改挂到真担保人, 删代号行)
 *   - notFound: 源文档里也提不出担保人的客户, 仅打印, 不写库(留空 = 待补)
 *
 * 全局去重键: NRIC 优先, 无 NRIC 用归一化姓名. 邮箱写入 guarantors.note, 密码绝不写入.
 *
 * 用法:
 *   pnpm tsx src/scripts/extractIcaGuarantors.ts --dry-run   # 只打印计划, 零副作用
 *   pnpm tsx src/scripts/extractIcaGuarantors.ts             # 实跑(写 dev 库)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cases, db, guarantors, pool } from "@bh/db";
import { eq, isNull, and } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dirname, "data", "ica-guarantor-map.json");

const dryRun = process.argv.includes("--dry-run");

const normName = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, " ");
const normNric = (s: string | null | undefined): string =>
  s ? s.trim().toUpperCase().replace(/\s+/g, "") : "";

type MatchEntry = {
  client: string;
  case_id: string;
  guarantor: { name: string; nric: string; relation: string; contact: string; email: string };
  ownSponsor: boolean;
  confidence: string;
};
type CorrectionEntry = {
  code: string;
  name: string;
  nric: string;
  contact: string;
  email: string;
  viaClient: string;
};
type MapFile = {
  matches: MatchEntry[];
  corrections: CorrectionEntry[];
  notFound: string[];
};

type GRow = { id: string; name: string; nric: string | null; note: string | null };

/** 把 email 合进 note(已有就不重复), 不存密码 */
function mergeEmailIntoNote(note: string | null, email: string): string | null {
  if (!email) {
    return note;
  }
  if (note && note.includes(email)) {
    return note;
  }
  const line = `邮箱: ${email}`;
  return note ? `${note} | ${line}` : line;
}

async function main(): Promise<void> {
  const map: MapFile = JSON.parse(readFileSync(MAP_PATH, "utf8"));

  // 担保人注册表: 按 NRIC / 归一化姓名 索引现有行
  const rows = (await db
    .select({ id: guarantors.id, name: guarantors.name, nric: guarantors.nric, note: guarantors.note })
    .from(guarantors)) as GRow[];
  const byNric = new Map<string, GRow>();
  const byName = new Map<string, GRow>();
  for (const g of rows) {
    if (g.nric) {
      byNric.set(normNric(g.nric), g);
    }
    byName.set(normName(g.name), g);
  }

  const log = (s: string): void => console.log(s);
  let renamed = 0;
  let mergedAway = 0;
  let created = 0;
  let linked = 0;

  /** 解析/落地一个担保人身份(name+nric+email), 返回其 id. 负责按 NRIC/姓名 去重. */
  async function resolveGuarantor(name: string, nric: string, email: string): Promise<string> {
    const nk = normNric(nric);
    const nm = normName(name);
    let row = (nk && byNric.get(nk)) || byName.get(nm);
    if (row) {
      // 补全缺失的 NRIC / 邮箱
      const newNric = row.nric || (nric ? nric.trim() : null);
      const newNote = mergeEmailIntoNote(row.note, email);
      if ((newNric !== row.nric || newNote !== row.note) && !dryRun) {
        await db
          .update(guarantors)
          .set({ nric: newNric, note: newNote, updatedAt: new Date() })
          .where(eq(guarantors.id, row.id));
      }
      const updated: GRow = { id: row.id, name: row.name, nric: newNric, note: newNote };
      if (nk) {
        byNric.set(nk, updated);
      }
      byName.set(nm, updated);
      return row.id;
    }
    // 新建
    log(`  [新建担保人] ${name}${nk ? ` (${nk})` : ""}`);
    created++;
    if (dryRun) {
      const fake: GRow = { id: `DRYRUN-${nm}`, name, nric: nric || null, note: mergeEmailIntoNote(null, email) };
      if (nk) {
        byNric.set(nk, fake);
      }
      byName.set(nm, fake);
      return fake.id;
    }
    const [ins] = await db
      .insert(guarantors)
      .values({ name: name.trim(), nric: nric ? nric.trim() : null, note: mergeEmailIntoNote(null, email) })
      .returning({ id: guarantors.id });
    const newRow: GRow = { id: ins!.id, name: name.trim(), nric: nric || null, note: mergeEmailIntoNote(null, email) };
    if (nk) {
      byNric.set(nk, newRow);
    }
    byName.set(nm, newRow);
    return ins!.id;
  }

  // ---- 1) corrections: 还原占位代号 ----
  log(`\n=== Corrections (占位代号还原) ===`);
  for (const c of map.corrections) {
    const junk = byName.get(normName(c.code));
    if (!junk) {
      log(`  [跳过] 代号 "${c.code}" 不在 guarantors 表(可能已处理)`);
      continue;
    }
    const nk = normNric(c.nric);
    const existingReal = (nk && byNric.get(nk)) || byName.get(normName(c.name));
    if (existingReal && existingReal.id !== junk.id) {
      // 合并: junk 的案件改挂 existingReal, 删 junk
      log(`  [合并] "${c.code}" → 已存在真担保人 ${existingReal.name}; 改挂案件并删除代号行`);
      mergedAway++;
      if (!dryRun) {
        await db.update(cases).set({ guarantorId: existingReal.id, guarantorName: existingReal.name, updatedAt: new Date() }).where(eq(cases.guarantorId, junk.id));
        await db.delete(guarantors).where(eq(guarantors.id, junk.id));
      }
      byName.delete(normName(c.code));
    } else {
      // 就地改名 + 补 NRIC/邮箱
      log(`  [改名] "${c.code}" → ${c.name}${nk ? ` (${nk})` : ""}`);
      renamed++;
      const newNote = mergeEmailIntoNote(junk.note, c.email);
      if (!dryRun) {
        await db.update(guarantors).set({ name: c.name.trim(), nric: c.nric ? c.nric.trim() : null, note: newNote, updatedAt: new Date() }).where(eq(guarantors.id, junk.id));
        await db.update(cases).set({ guarantorName: c.name.trim(), updatedAt: new Date() }).where(eq(cases.guarantorId, junk.id));
      }
      const updated: GRow = { id: junk.id, name: c.name.trim(), nric: c.nric || null, note: newNote };
      byName.delete(normName(c.code));
      byName.set(normName(c.name), updated);
      if (nk) {
        byNric.set(nk, updated);
      }
    }
  }

  // ---- 2) matches: 回填缺担保人的案件 ----
  log(`\n=== Matches (回填案件担保人) ===`);
  for (const m of map.matches) {
    const g = m.guarantor;
    const gid = await resolveGuarantor(g.name, g.nric, g.email);
    log(`  [挂载] ${m.client} → ${g.name} (${normNric(g.nric) || "无NRIC"})${m.ownSponsor ? " [own sponsor]" : ""}`);
    linked++;
    if (!dryRun) {
      // 仅当该案件 guarantor_id 仍为空才写, 绝不覆盖已有关联
      await db
        .update(cases)
        .set({
          guarantorId: gid,
          guarantorName: g.name.trim(),
          guarantorRelation: g.relation || "",
          guarantorContact: g.contact || g.email || "",
          updatedAt: new Date()
        })
        .where(and(eq(cases.id, m.case_id), isNull(cases.guarantorId)));
    }
  }

  // ---- 3) notFound: 留空待补 ----
  log(`\n=== Not Found (留空, 待补) ===`);
  log(`  ${map.notFound.join(", ")}`);

  log(
    `\n汇总${dryRun ? "(DRY-RUN, 未写库)" : ""}: ` +
      `corrections 改名 ${renamed} / 合并 ${mergedAway}; matches 挂载 ${linked} (新建担保人 ${created}); notFound ${map.notFound.length}`
  );
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    return pool.end().finally(() => process.exit(1));
  });
