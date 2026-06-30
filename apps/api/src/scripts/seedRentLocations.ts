/**
 * 建租房地点 + 把已导入的「租房&租金」documents 归位到 rent_files。
 *
 * 运行(从 apps/api):
 *   pnpm tsx src/scripts/seedRentLocations.ts          # 增量(已归位的文件跳过)
 *   pnpm tsx src/scripts/seedRentLocations.ts --reset  # 清空 rent_files + rent_locations 重建
 *
 * 月份/标签/付款日为机械解析的最佳猜测,后续可在 UI 里改。
 */
import { db, documents, pool, rentFiles, rentLocations } from "@bh/db";
import { eq, like } from "drizzle-orm";

const RESET = process.argv.includes("--reset");

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
};

// 地点:由 folder_path 决定。月度租金并进 Penisula大楼。
function locationNameFor(folderPath: string): string | null {
  if (folderPath.startsWith("租房&租金/101办公室")) return "101办公室";
  if (folderPath.startsWith("租房&租金/Penisula大楼")) return "Penisula大楼";
  if (folderPath.startsWith("租房&租金/月度租金")) return "Penisula大楼";
  if (folderPath.startsWith("租房&租金/学院租约")) return "学院";
  return null;
}

// 从 folder_path 的 6 位月份段解析 period(月度租金/202603、Penisula大楼/202601)。
function periodFromFolder(folderPath: string): string | null {
  const m = folderPath.match(/(20\d{2})(0[1-9]|1[0-2])(?:\/|$)/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// 从文件名解析 period。
function periodFromName(name: string): string | null {
  const lower = name.toLowerCase();
  // "... JAN 2025", "RENTAL INVOICE AUG 2025"
  let m = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b[^0-9]*?(20\d{2})/);
  if (m) return `${m[2]}-${MONTHS[m[1]!]}`;
  // "PENINSULA PLZ 10 JAN - 9 FEB 2026" → 取第一个月 + 年
  m = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*?(20\d{2})/);
  if (m) return `${m[2]}-${MONTHS[m[1]!]}`;
  // "pay02-dec" / "pay05-apr":dec→2024,其余→2025(101办公室租约期)
  m = lower.match(/pay\d*-\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (m) {
    const mm = MONTHS[m[1]!]!;
    const year = mm === "12" ? "2024" : "2025";
    return `${year}-${mm}`;
  }
  return null;
}

function tagFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("deposit") || name.includes("押金")) return "押金";
  if (/tenan|tenen|tenac/.test(lower) || lower.includes("signed") || lower.includes("singed") || name.includes("租约"))
    return "租约";
  if (lower.startsWith("stampcert") || /^tn\d/i.test(name) || name.includes("交税") || lower.includes("stamp"))
    return "交税证明";
  return "其他";
}

// 从文件名解析付款日期:微信图片_YYYYMMDD…、WhatsApp Image YYYY-MM-DD。
function paidAtFromName(name: string): Date | null {
  let m = name.match(/(20\d{2})(0[1-9]|1[0-2])([0-3]\d)/); // 微信图片_20260115…
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  m = name.match(/(20\d{2})-(\d{2})-(\d{2})/); // WhatsApp Image 2025-05-24
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return null;
}

async function ensureLocation(name: string, sortOrder: number): Promise<string> {
  const [existing] = await db.select().from(rentLocations).where(eq(rentLocations.name, name));
  if (existing) return existing.id;
  const [row] = await db.insert(rentLocations).values({ name, sortOrder }).returning();
  return row!.id;
}

async function main() {
  if (RESET) {
    await db.delete(rentFiles);
    await db.delete(rentLocations);
    console.log("--reset: 已清空 rent_files + rent_locations");
  }

  const locationIds: Record<string, string> = {
    "101办公室": await ensureLocation("101办公室", 1),
    "Penisula大楼": await ensureLocation("Penisula大楼", 2),
    学院: await ensureLocation("学院", 3)
  };

  const docs = await db
    .select({ id: documents.id, filename: documents.filename, folderPath: documents.folderPath })
    .from(documents)
    .where(like(documents.folderPath, "租房&租金%"));

  const existingLinks = await db.select({ documentId: rentFiles.documentId }).from(rentFiles);
  const linked = new Set(existingLinks.map((r) => r.documentId));

  let inserted = 0;
  const byLoc = new Map<string, number>();

  for (const doc of docs) {
    if (linked.has(doc.id)) continue;
    const folderPath = doc.folderPath ?? "";
    const locName = locationNameFor(folderPath);
    if (!locName) {
      console.warn(`  [无地点] ${folderPath} / ${doc.filename}`);
      continue;
    }
    const locationId = locationIds[locName]!;

    const period = periodFromFolder(folderPath) ?? periodFromName(doc.filename);
    const docTag = period ? null : tagFromName(doc.filename);
    const paidAt = paidAtFromName(doc.filename) ?? (period ? new Date(`${period}-01T00:00:00Z`) : null);

    await db.insert(rentFiles).values({
      locationId,
      documentId: doc.id,
      period,
      docTag,
      paidAt
    });
    inserted++;
    byLoc.set(locName, (byLoc.get(locName) ?? 0) + 1);
  }

  console.log(`\n==== 归位完成 ====`);
  console.log(`新增 rent_files ${inserted} 条`);
  for (const [loc, n] of [...byLoc.entries()].sort()) console.log(`  ${loc}: ${n}`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
