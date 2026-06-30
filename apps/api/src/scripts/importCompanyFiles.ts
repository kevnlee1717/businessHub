/**
 * 把 ~/cf 公司内部文件录入 documents 表(subject_type='company' + folder_path)。
 *
 * 运行(从 apps/api 目录):
 *   pnpm tsx src/scripts/importCompanyFiles.ts            # 增量导入(已存在的同内容文件跳过)
 *   pnpm tsx src/scripts/importCompanyFiles.ts --reset    # 先清空旧的公司文件库再全量重导
 *   CF_DIR=/path/to/cf pnpm tsx src/scripts/importCompanyFiles.ts
 *
 * folder_path 形如 "合同&发票/EP",首段必须与 web 端 companyFileSections.ts 的 folderPrefix 一致。
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import { dirname, extname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { db, documents, pool } from "@bh/db";
import { and, eq, isNotNull } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");
const uploadRoot = join(repoRoot, "uploads");
const CF_DIR = process.env.CF_DIR ?? join(homedir(), "cf");
const RESET = process.argv.includes("--reset");

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".url": "text/plain"
};

// 去掉编目式 "NN-" 前缀(如 "01-食阁" → "食阁"),保留 "101 办公室"、"B01-学院"。
function clean(segment: string): string {
  return segment.replace(/^\d{1,2}-\s*/, "").trim();
}

type Classified = { section: string; sub: string[] } | null;

// dirs = 相对 CF_DIR 的目录段(不含文件名);返回 section 前缀 + 子文件夹链。
function classify(dirs: string[], filename: string): Classified {
  const top = dirs[0];

  if (top === "02-开支-收据与合同") {
    const sub = dirs[1];
    if (sub === "01-办公室") {
      const place = (dirs[2] ?? "").trim();
      if (/penisula|peninsula/i.test(place)) {
        return { section: "租房&租金", sub: ["Penisula大楼", ...dirs.slice(3).map(clean).filter(Boolean)] };
      }
      return { section: "租房&租金", sub: ["101办公室"] };
    }
    if (sub === "02-骊骊姐工资") return { section: "工资", sub: ["骊骊姐"] };
    if (sub === "03-恺德学院") {
      // 恺德学院的注资/申请费/注册秘书都是费用收据 → 发票 tab。
      return { section: "发票", sub: ["恺德学院", ...dirs.slice(2).map(clean).filter(Boolean)] };
    }
    // 04-Cecilia 工资 / 05-程程工资(目前为空)
    return { section: "工资", sub: [clean(sub ?? "")].filter(Boolean) };
  }

  if (top === "新加坡办公室租金") {
    return { section: "租房&租金", sub: ["月度租金", ...dirs.slice(1).map(clean).filter(Boolean)] };
  }

  if (top === "骊骊姐工资") {
    return { section: "工资", sub: ["骊骊姐月度", ...dirs.slice(1).map(clean).filter(Boolean)] };
  }

  if (top === "03-各类合同&发票") {
    const map: Record<string, string> = {
      "01-EP": "EP",
      "02-生意加盟": "生意加盟",
      "03-生意转让": "生意转让",
      "04-独家授权协议": "独家授权",
      "05-租房合同": "租房合同",
      "06-私立学校": "私立学校",
      "07-教培": "教培"
    };
    const name = map[dirs[1] ?? ""] ?? clean(dirs[1] ?? "");
    // 合同&发票 拆两个 tab:文件名像发票/收据的进「发票」,其余进「合同」。
    const section = /\binv\b|invoice|发票|收据|receipt/i.test(filename) ? "发票" : "合同";
    return { section, sub: [name, ...dirs.slice(2).map(clean).filter(Boolean)].filter(Boolean) };
  }

  if (top === "04-各类设计图") {
    return { section: "收费标准", sub: dirs.slice(1).map(clean).filter(Boolean) };
  }

  if (top === "05-各类证明文件") {
    // 工资证明归「工资」tab,其余归「证明&模板」。
    if (filename.includes("工资证明")) {
      return { section: "工资", sub: ["工资证明"] };
    }
    return { section: "证明&模板", sub: [] };
  }

  if (top === "B01-学院") {
    // 学院租约(tenancy/floor/signed)归入「租房&租金」。
    return { section: "租房&租金", sub: ["学院租约"] };
  }

  return null;
}

async function walk(dir: string, base: string, out: { abs: string; rel: string[] }[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, base, out);
    } else if (entry.isFile()) {
      const rel = abs.slice(base.length + 1).split("/");
      out.push({ abs, rel });
    }
  }
}

async function main() {
  console.log(`CF_DIR = ${CF_DIR}`);
  console.log(`uploadRoot = ${uploadRoot}`);

  if (RESET) {
    const old = await db
      .select({ id: documents.id, storagePath: documents.storagePath })
      .from(documents)
      .where(and(eq(documents.subjectType, "company"), isNotNull(documents.folderPath)));
    console.log(`--reset: 清理 ${old.length} 条旧公司文件库记录及落盘文件`);
    for (const row of old) {
      try {
        await unlink(join(repoRoot, row.storagePath));
      } catch {
        // 文件可能已不在,忽略
      }
    }
    await db.delete(documents).where(and(eq(documents.subjectType, "company"), isNotNull(documents.folderPath)));
  }

  const files: { abs: string; rel: string[] }[] = [];
  await walk(CF_DIR, CF_DIR, files);
  console.log(`扫描到 ${files.length} 个文件(已排除 .DS_Store)`);

  const seenHashes = new Set<string>();
  const { year, month } = currentYearMonth();
  const destDir = join(uploadRoot, year, month);
  await mkdir(destDir, { recursive: true });

  let imported = 0;
  let skippedDup = 0;
  let unmapped = 0;
  const bySection = new Map<string, number>();

  for (const file of files) {
    const dirs = file.rel.slice(0, -1);
    const filename = file.rel[file.rel.length - 1];
    if (!filename) continue;
    const cls = classify(dirs, filename);
    if (!cls) {
      unmapped++;
      console.warn(`  [未映射] ${file.rel.join("/")}`);
      continue;
    }

    const buffer = await readFile(file.abs);
    const hash = createHash("sha256").update(buffer).digest("hex");
    if (seenHashes.has(hash)) {
      skippedDup++;
      console.log(`  [去重跳过] ${file.rel.join("/")}`);
      continue;
    }
    seenHashes.add(hash);

    const folderPath = [cls.section, ...cls.sub].join("/");
    const ext = extname(filename);
    const storedName = `${randomUUID()}${ext}`;
    await copyFile(file.abs, join(destDir, storedName));
    const storagePath = posix.join("uploads", year, month, storedName);
    const fileStat = await stat(file.abs);

    await db.insert(documents).values({
      storagePath,
      filename,
      mime: MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream",
      size: fileStat.size,
      uploadedBy: null,
      subjectType: "company",
      subjectId: null,
      folderPath,
      clientId: null,
      categoryId: null
    });

    imported++;
    bySection.set(cls.section, (bySection.get(cls.section) ?? 0) + 1);
  }

  console.log("\n==== 导入完成 ====");
  console.log(`导入 ${imported} 条,去重跳过 ${skippedDup} 条,未映射 ${unmapped} 条`);
  for (const [section, n] of [...bySection.entries()].sort()) {
    console.log(`  ${section}: ${n}`);
  }
}

function currentYearMonth() {
  const now = new Date();
  return { year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, "0") };
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
