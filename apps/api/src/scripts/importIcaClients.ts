/**
 * ICA 申诉资料批量导入脚本
 *
 * 数据源: ~/ae/{2025,2026}/<Mon YYYY>/<案件文件夹>/  (+ ~/ae/Hotel/ 补挂)
 * 模型: 一客户一案件(business_type='ica') + 每个月文件夹一条 case_submission(一轮申诉)
 *
 * 仿 importEpClients.ts，但:
 *   - 不挂任何 billing
 *   - 数据源是遍历真实目录(而非读 json)
 *   - 一客户聚合跨月文件夹(clientDedupKey)
 *
 * 用法:
 *   pnpm tsx src/scripts/importIcaClients.ts --dry-run   # 只打印计划，零副作用
 *   pnpm tsx src/scripts/importIcaClients.ts             # 实跑(写 dev 库 + 拷文件)
 *   pnpm tsx src/scripts/importIcaClients.ts --purge     # 删除本脚本导入的 ICA 数据
 */
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import {
  caseStepDocuments,
  caseSteps,
  caseSubmissions,
  cases,
  clients,
  db,
  documents,
  pool,
  templateSteps,
  workflowTemplates
} from "@bh/db";
import { classifyFile, clientDedupKey, parseCaseFolderName } from "@bh/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadRoot = join(__dirname, "../../../..", "uploads");

const AE_ROOT = process.env.AE_ROOT ?? join(process.env.HOME ?? "/home/john", "ae");
const YEARS = ["2025", "2026"];
const SKIP_FOLDERS = new Set(["Hotel", "untitled folder"]);

/** AppleDouble / 系统垃圾文件 */
function isNoise(name: string): boolean {
  return name.startsWith("._") || name === ".DS_Store" || name === ".localized";
}

/** 标准槽名 → 步骤号(case_steps.stepOrder) */
const SLOT_STEP: Record<string, number> = {
  护照: 2,
  "身份证/NRIC": 2,
  户口本: 2,
  在职证明: 2,
  新加坡酒店证明: 2,
  "ICA 拒信": 2,
  "其他/证据材料": 2,
  申诉信: 3,
  "Form 14": 4,
  担保人材料: 5
};

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function monthToDate(month: string): Date {
  const m = month.match(/([a-z]{3})\s*(\d{4})/i);
  if (!m) {
    return new Date();
  }
  return new Date(Date.UTC(Number(m[2]!), MONTHS[m[1]!.toLowerCase()] ?? 0, 1));
}

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type ParsedCase = ReturnType<typeof parseCaseFolderName>;
type SavedDocument = typeof documents.$inferSelect;

type Args = {
  dryRun: boolean;
  purge: boolean;
};

type RoundFolder = {
  absPath: string;
  folderName: string;
  month: string;
  parsed: ParsedCase;
};

type ClientGroup = {
  key: string;
  displayName: string;
  rounds: RoundFolder[];
};

type Stats = {
  clientsCreated: number;
  clientsReused: number;
  casesCreated: number;
  casesReused: number;
  submissionsCreated: number;
  submissionsSkipped: number;
  filesCopied: number;
  filesLinked: number;
  filesMissing: number;
  hotelMatched: number;
  hotelUnmatched: number;
  resultDist: Record<string, number>;
  slotDist: Record<string, number>;
  casesPurged: number;
  clientsPurged: number;
  documentsPurged: number;
  warnings: number;
};

function newStats(): Stats {
  return {
    clientsCreated: 0,
    clientsReused: 0,
    casesCreated: 0,
    casesReused: 0,
    submissionsCreated: 0,
    submissionsSkipped: 0,
    filesCopied: 0,
    filesLinked: 0,
    filesMissing: 0,
    hotelMatched: 0,
    hotelUnmatched: 0,
    resultDist: {},
    slotDist: {},
    casesPurged: 0,
    clientsPurged: 0,
    documentsPurged: 0,
    warnings: 0
  };
}

function parseArgs(argv: string[]): Args {
  let dryRun = false;
  let purge = false;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--purge") {
      purge = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { dryRun, purge };
}

function getMime(filename: string): string {
  const extension = extname(filename).toLowerCase();
  const mimeByExtension: Record<string, string> = {
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip"
  };
  return mimeByExtension[extension] ?? "application/octet-stream";
}

/** 递归列出文件夹下所有真实文件(跳过 NOISE)，返回相对路径(用于显示)与绝对路径 */
async function listFilesRecursive(root: string): Promise<{ abs: string; name: string }[]> {
  const out: { abs: string; name: string }[] = [];
  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (isNoise(entry)) {
        continue;
      }
      const abs = join(dir, entry);
      let st;
      try {
        st = await stat(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        await walk(abs);
      } else if (st.isFile()) {
        out.push({ abs, name: entry });
      }
    }
  }
  await walk(root);
  return out;
}

/** Step 1: 遍历目录 + 按拼音名聚合成客户组 */
async function collectGroups(): Promise<Map<string, ClientGroup>> {
  const groups = new Map<string, ClientGroup>();
  for (const year of YEARS) {
    const yearDir = join(AE_ROOT, year);
    let months: string[];
    try {
      months = await readdir(yearDir);
    } catch {
      continue;
    }
    for (const month of months) {
      if (isNoise(month) || SKIP_FOLDERS.has(month)) {
        continue;
      }
      const monthDir = join(yearDir, month);
      let monthStat;
      try {
        monthStat = await stat(monthDir);
      } catch {
        continue;
      }
      if (!monthStat.isDirectory()) {
        continue;
      }
      const folders = await readdir(monthDir);
      for (const folder of folders) {
        if (isNoise(folder) || SKIP_FOLDERS.has(folder)) {
          continue;
        }
        const abs = join(monthDir, folder);
        let folderStat;
        try {
          folderStat = await stat(abs);
        } catch {
          continue;
        }
        if (!folderStat.isDirectory()) {
          continue;
        }
        const parsed = parseCaseFolderName(folder);
        if (!parsed.name) {
          continue;
        }
        const key = clientDedupKey(parsed.name);
        const group = groups.get(key) ?? { key, displayName: parsed.name, rounds: [] };
        group.rounds.push({ absPath: abs, folderName: folder, month, parsed });
        groups.set(key, group);
      }
    }
  }
  // 每个客户的轮次按月份升序排
  for (const group of groups.values()) {
    group.rounds.sort((a, b) => monthToDate(a.month).getTime() - monthToDate(b.month).getTime());
  }
  return groups;
}

function buildSubmissionNote(round: RoundFolder): string {
  const { folderName, parsed } = round;
  let note = folderName;
  if (parsed.owner) {
    note += ` | 经办:${parsed.owner}`;
  }
  if (parsed.appealId) {
    note += ` | ${parsed.appealId}`;
  }
  return note;
}

/** 解析出的姓名是否可疑(需人工核对) */
function suspiciousReason(displayName: string): string | null {
  const reasons: string[] = [];
  if (/\d/.test(displayName)) {
    reasons.push("含数字");
  }
  if (/\b(BANNED|CANCEL|REFUSED|REJECTED?|APPROVED|PENDING|GRANTED|MOM|MON|TUES?|WED|THU|FRI|SAT|SUN|RESUBMIT|ADDITIONAL)\b/i.test(displayName)) {
    reasons.push("含状态/星期/MOM 等噪声词");
  }
  const letters = displayName.replace(/[^A-Za-z一-龥]/g, "");
  if (letters.length < 3) {
    reasons.push("过短");
  }
  if (displayName.length > 30) {
    reasons.push("过长");
  }
  return reasons.length > 0 ? reasons.join("; ") : null;
}

// ─── 实跑写库辅助 ───────────────────────────────────────────────────────────

async function ensureClient(tx: DbLike, name: string, stats: Stats) {
  const [existing] = await tx.select().from(clients).where(eq(clients.name, name)).limit(1);
  if (existing) {
    stats.clientsReused += 1;
    return existing;
  }
  const [created] = await tx.insert(clients).values({ name, note: "ICA 批量导入" }).returning();
  if (!created) {
    throw new Error(`client_create_failed: ${name}`);
  }
  stats.clientsCreated += 1;
  return created;
}

async function selectIcaTemplate(tx: DbLike) {
  const [template] = await tx
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.businessType, "ica"))
    .limit(1);
  if (!template) {
    throw new Error("workflow_template_not_found: ica (先跑 seed / applyIcaTemplate)");
  }
  const stepRows = await tx
    .select()
    .from(templateSteps)
    .where(eq(templateSteps.templateId, template.id))
    .orderBy(asc(templateSteps.stepOrder));
  return { template, templateStepRows: stepRows };
}

async function cloneSteps(
  tx: DbLike,
  caseId: string,
  templateStepRows: (typeof templateSteps.$inferSelect)[]
) {
  for (const templateStep of templateStepRows) {
    const [step] = await tx
      .insert(caseSteps)
      .values({
        caseId,
        stepOrder: templateStep.stepOrder,
        name: templateStep.name,
        nameEn: templateStep.nameEn,
        description: templateStep.description,
        collections: templateStep.collections,
        assigneeId: null
      })
      .returning();
    if (!step) {
      throw new Error(`case_step_snapshot_failed: ${caseId}`);
    }
    for (const item of templateStep.requiredDocuments) {
      await tx.insert(caseStepDocuments).values({
        caseStepId: step.id,
        docName: item.name,
        docNameEn: item.name_en,
        categoryId: item.category_id ?? null,
        isRequired: item.required ?? true,
        status: "missing"
      });
    }
  }
}

/** 找/建该客户的 ica case；返回 { caseId, reused } */
async function ensureIcaCase(tx: DbLike, clientId: string, stats: Stats) {
  const [existing] = await tx
    .select()
    .from(cases)
    .where(and(eq(cases.clientId, clientId), eq(cases.businessType, "ica")))
    .limit(1);
  if (existing) {
    stats.casesReused += 1;
    return { caseId: existing.id, reused: true };
  }
  const { templateStepRows } = await selectIcaTemplate(tx);
  const [caseRow] = await tx
    .insert(cases)
    .values({ businessType: "ica", clientId, currentStep: 0, status: "in_progress" })
    .returning();
  if (!caseRow) {
    throw new Error(`case_create_failed: client=${clientId}`);
  }
  await cloneSteps(tx, caseRow.id, templateStepRows);
  stats.casesCreated += 1;
  return { caseId: caseRow.id, reused: false };
}

/** stepOrder → stepId 映射 */
async function loadStepMap(tx: DbLike, caseId: string): Promise<Map<number, string>> {
  const rows = await tx.select().from(caseSteps).where(eq(caseSteps.caseId, caseId));
  return new Map(rows.map((r) => [r.stepOrder, r.id]));
}

async function saveFileLikeUpload(
  tx: DbLike,
  sourcePath: string,
  originalFilename: string,
  stepId: string,
  clientId: string,
  tag: string,
  stats: Stats
): Promise<SavedDocument> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const directory = join(uploadRoot, year, month);
  await mkdir(directory, { recursive: true });

  const storedFilename = `${randomUUID()}${extname(originalFilename)}`;
  const absolutePath = join(directory, storedFilename);
  const storagePath = posix.join("uploads", year, month, storedFilename);
  const fileStat = await stat(sourcePath);

  await copyFile(sourcePath, absolutePath);

  const [document] = await tx
    .insert(documents)
    .values({
      storagePath,
      filename: originalFilename,
      mime: getMime(originalFilename),
      size: fileStat.size,
      uploadedBy: null,
      subjectType: "case_step",
      subjectId: stepId,
      clientId,
      categoryId: null,
      tags: [tag]
    })
    .returning();
  if (!document) {
    throw new Error(`document_insert_failed: ${sourcePath}`);
  }
  stats.filesCopied += 1;
  return document;
}

async function attachFileToStep(
  tx: DbLike,
  stepId: string,
  clientId: string,
  sourcePath: string,
  originalFilename: string,
  slot: string,
  tag: string,
  copiedFiles: Map<string, SavedDocument>,
  stats: Stats
) {
  const document =
    copiedFiles.get(sourcePath) ??
    (await saveFileLikeUpload(tx, sourcePath, originalFilename, stepId, clientId, tag, stats));
  copiedFiles.set(sourcePath, document);

  const [slotRow] = await tx
    .insert(caseStepDocuments)
    .values({
      caseStepId: stepId,
      docName: `${slot} · ${originalFilename}`,
      docNameEn: null,
      categoryId: null,
      isRequired: false,
      documentId: document.id,
      documentIds: [document.id],
      status: "uploaded"
    })
    .returning();
  if (!slotRow) {
    throw new Error(`case_step_document_create_failed: ${stepId}`);
  }
  stats.filesLinked += 1;
}

/** 实跑导入单个客户(包在一个事务里) */
async function importGroup(group: ClientGroup, stats: Stats) {
  await db.transaction(async (tx) => {
    const clientRow = await ensureClient(tx, group.displayName, stats);
    const { caseId } = await ensureIcaCase(tx, clientRow.id, stats);
    const stepMap = await loadStepMap(tx, caseId);
    const copiedFiles = new Map<string, SavedDocument>();

    // 已存在的 submission(按 note 前缀=folderName 查重)
    const existingSubs = await tx.select().from(caseSubmissions).where(eq(caseSubmissions.caseId, caseId));

    for (const round of group.rounds) {
      const note = buildSubmissionNote(round);
      const dup = existingSubs.some((s) => (s.note ?? "").startsWith(round.folderName));
      if (dup) {
        stats.submissionsSkipped += 1;
        continue;
      }

      await tx.insert(caseSubmissions).values({
        caseId,
        submittedAt: monthToDate(round.month),
        result: round.parsed.status,
        rejectedAt: null,
        note
      });
      stats.submissionsCreated += 1;
      stats.resultDist[round.parsed.status] = (stats.resultDist[round.parsed.status] ?? 0) + 1;

      const files = await listFilesRecursive(round.absPath);
      for (const file of files) {
        const { slot } = classifyFile(file.name);
        const stepOrder = SLOT_STEP[slot];
        if (stepOrder === undefined) {
          stats.warnings += 1;
          console.warn(`  warning: 未知 slot(${slot}), 跳过文件 ${file.name}`);
          continue;
        }
        const stepId = stepMap.get(stepOrder);
        if (!stepId) {
          stats.warnings += 1;
          console.warn(`  warning: step #${stepOrder} (${slot}) 未找到, 跳过文件 ${file.name}`);
          continue;
        }
        try {
          await stat(file.abs);
        } catch {
          stats.filesMissing += 1;
          stats.warnings += 1;
          continue;
        }
        await attachFileToStep(
          tx,
          stepId,
          clientRow.id,
          file.abs,
          file.name,
          slot,
          round.folderName,
          copiedFiles,
          stats
        );
        stats.slotDist[slot] = (stats.slotDist[slot] ?? 0) + 1;
      }
    }
  });
}

/** Step 4: Hotel/ 文件补挂到对应客户步骤2「新加坡酒店证明」槽 */
async function attachHotelFiles(groups: Map<string, ClientGroup>, dryRun: boolean, stats: Stats) {
  const hotelDir = join(AE_ROOT, "Hotel");
  let files: { abs: string; name: string }[];
  try {
    files = await listFilesRecursive(hotelDir);
  } catch {
    return;
  }
  for (const file of files) {
    // 从文件名提取拼音名: 取「新加坡 / 酒店」之前的拉丁字母段
    const latin = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[一-龥].*$/, "") // 去掉第一个中文字符及之后
      .replace(/\(.*?\)/g, " ")
      .trim();
    if (!latin || latin.replace(/[^A-Za-z]/g, "").length < 3) {
      stats.hotelUnmatched += 1;
      console.warn(`  hotel: 无法从文件名提取客户名, 跳过: ${file.name}`);
      continue;
    }
    const key = clientDedupKey(latin);
    const group = groups.get(key);
    if (!group) {
      stats.hotelUnmatched += 1;
      console.warn(`  hotel: 未匹配到已建客户(${key}), 跳过: ${file.name}`);
      continue;
    }
    stats.hotelMatched += 1;
    stats.slotDist["新加坡酒店证明"] = (stats.slotDist["新加坡酒店证明"] ?? 0) + 1;
    if (dryRun) {
      continue;
    }
    // 实跑: 找该客户 case 的步骤2 stepId 挂上
    await db.transaction(async (tx) => {
      const [clientRow] = await tx.select().from(clients).where(eq(clients.name, group.displayName)).limit(1);
      if (!clientRow) {
        stats.warnings += 1;
        return;
      }
      const [caseRow] = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.clientId, clientRow.id), eq(cases.businessType, "ica")))
        .limit(1);
      if (!caseRow) {
        stats.warnings += 1;
        return;
      }
      const stepMap = await loadStepMap(tx, caseRow.id);
      const stepId = stepMap.get(2);
      if (!stepId) {
        stats.warnings += 1;
        return;
      }
      await attachFileToStep(
        tx,
        stepId,
        clientRow.id,
        file.abs,
        file.name,
        "新加坡酒店证明",
        "Hotel",
        new Map(),
        stats
      );
    });
  }
}

// ─── dry-run: 纯统计，零写库零拷贝 ──────────────────────────────────────────

async function runDryRun(groups: Map<string, ClientGroup>, stats: Stats) {
  console.log("Mode: dry-run (零写库 / 零拷文件)\n");

  let totalFiles = 0;
  const suspicious: { name: string; reason: string; rounds: string[] }[] = [];
  const clientLines: string[] = [];

  for (const group of groups.values()) {
    stats.clientsCreated += 1;
    stats.casesCreated += 1;
    const roundDescs: string[] = [];
    for (const round of group.rounds) {
      stats.submissionsCreated += 1;
      stats.resultDist[round.parsed.status] = (stats.resultDist[round.parsed.status] ?? 0) + 1;
      const files = await listFilesRecursive(round.absPath);
      totalFiles += files.length;
      for (const file of files) {
        const { slot } = classifyFile(file.name);
        stats.slotDist[slot] = (stats.slotDist[slot] ?? 0) + 1;
      }
      roundDescs.push(`${round.month}:${round.parsed.status}${round.parsed.round ? `(${round.parsed.round}轮)` : ""}`);
    }
    clientLines.push(`  - ${group.displayName} | 轮次=${group.rounds.length} | ${roundDescs.join(", ")}`);
    const reason = suspiciousReason(group.displayName);
    if (reason) {
      suspicious.push({
        name: group.displayName,
        reason,
        rounds: group.rounds.map((r) => r.folderName)
      });
    }
  }

  // Hotel 补挂(dry-run 只统计匹配/未匹配)
  await attachHotelFiles(groups, true, stats);

  console.log("===== 聚合客户清单(displayName | 轮次数 | 各轮 月份:状态) =====");
  for (const line of clientLines) {
    console.log(line);
  }

  console.log("\n===== 可疑姓名(需人工核对) =====");
  if (suspicious.length === 0) {
    console.log("  (无)");
  } else {
    for (const s of suspicious) {
      console.log(`  ⚠ ${s.name} [${s.reason}]  ←  ${s.rounds.join(" / ")}`);
    }
  }

  console.log("\n===== result 分布(submission) =====");
  for (const [result, count] of Object.entries(stats.resultDist).sort()) {
    console.log(`  ${result}: ${count}`);
  }

  console.log("\n===== 文件按 slot 分布 =====");
  for (const [slot, count] of Object.entries(stats.slotDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slot}: ${count}`);
  }

  console.log("\n===== 汇总 =====");
  console.log(`  将建 client: ${stats.clientsCreated}`);
  console.log(`  将建 case:   ${stats.casesCreated}`);
  console.log(`  将建 submission: ${stats.submissionsCreated}`);
  console.log(`  总文件数(案件文件夹内): ${totalFiles}`);
  console.log(`  Hotel 文件: 匹配=${stats.hotelMatched} 未匹配=${stats.hotelUnmatched}`);
  console.log(`  可疑姓名数: ${suspicious.length}`);
}

// ─── purge: 删除本脚本导入的 ICA 数据 ───────────────────────────────────────

async function runPurge(stats: Stats) {
  console.log("Mode: purge (删除所有 business_type='ica' 的 case 及其级联数据)\n");
  await db.transaction(async (tx) => {
    const icaCases = await tx.select().from(cases).where(eq(cases.businessType, "ica"));
    const caseIds = icaCases.map((c) => c.id);
    if (caseIds.length === 0) {
      console.log("  无 ICA case, 无需 purge");
      return;
    }
    const stepRows = await tx.select().from(caseSteps).where(inArray(caseSteps.caseId, caseIds));
    const stepIds = stepRows.map((s) => s.id);

    // 收集要删的 documents(subjectId=stepId 或被 slot 引用)
    const subjectDocs =
      stepIds.length > 0 ? await tx.select().from(documents).where(inArray(documents.subjectId, stepIds)) : [];
    const docIds = [...new Set(subjectDocs.map((d) => d.id))];

    if (stepIds.length > 0) {
      await tx.delete(caseStepDocuments).where(inArray(caseStepDocuments.caseStepId, stepIds));
    }
    if (docIds.length > 0) {
      await tx.delete(documents).where(inArray(documents.id, docIds));
    }
    await tx.delete(caseSubmissions).where(inArray(caseSubmissions.caseId, caseIds));
    if (stepIds.length > 0) {
      await tx.delete(caseSteps).where(inArray(caseSteps.id, stepIds));
    }
    // 收集受影响 client(只删导入标记的，且无其它 case 残留)
    const clientIds = [...new Set(icaCases.map((c) => c.clientId).filter((id): id is string => Boolean(id)))];
    await tx.delete(cases).where(inArray(cases.id, caseIds));

    stats.casesPurged = caseIds.length;
    stats.documentsPurged = docIds.length;

    for (const clientId of clientIds) {
      const [remaining] = await tx.select({ id: cases.id }).from(cases).where(eq(cases.clientId, clientId)).limit(1);
      if (!remaining) {
        const [c] = await tx.select().from(clients).where(eq(clients.id, clientId)).limit(1);
        if (c && c.note === "ICA 批量导入") {
          await tx.delete(clients).where(eq(clients.id, clientId));
          stats.clientsPurged += 1;
        }
      }
    }
  });
  console.log(
    `  purged: cases=${stats.casesPurged}, documents=${stats.documentsPurged}, clients=${stats.clientsPurged}`
  );
}

function printSummary(stats: Stats) {
  console.log(
    `\nsummary: clientsCreated=${stats.clientsCreated}, clientsReused=${stats.clientsReused}, ` +
      `casesCreated=${stats.casesCreated}, casesReused=${stats.casesReused}, ` +
      `submissionsCreated=${stats.submissionsCreated}, submissionsSkipped=${stats.submissionsSkipped}, ` +
      `filesCopied=${stats.filesCopied}, filesLinked=${stats.filesLinked}, filesMissing=${stats.filesMissing}, ` +
      `hotelMatched=${stats.hotelMatched}, hotelUnmatched=${stats.hotelUnmatched}, warnings=${stats.warnings}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stats = newStats();

  console.log(`AE_ROOT: ${AE_ROOT}`);

  if (args.purge) {
    await runPurge(stats);
    return;
  }

  const groups = await collectGroups();
  console.log(`聚合客户组: ${groups.size}\n`);

  if (args.dryRun) {
    await runDryRun(groups, stats);
    printSummary(stats);
    return;
  }

  // 实跑
  for (const group of groups.values()) {
    try {
      await importGroup(group, stats);
    } catch (error) {
      stats.warnings += 1;
      console.error(`client failed and rolled back: ${group.displayName}`);
      console.error(error);
    }
  }
  await attachHotelFiles(groups, false, stats);
  printSummary(stats);
}

try {
  await main();
} finally {
  await pool.end();
}
