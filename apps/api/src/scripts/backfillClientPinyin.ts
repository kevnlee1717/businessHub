// 给存量"中文名 + 英文名为空"的客户回填拼音英文名(供双语搜索)。
// 运行:在 apps/api 目录下 `pnpm backfill:client-pinyin`(读 repo 根 .env 的 DATABASE_URL)。
import { clients, db, pool } from "@bh/db";
import { eq } from "drizzle-orm";
import { pinyin } from "pinyin-pro";

const CJK_RE = /[一-鿿]/;

function toPinyinName(name: string): string {
  return pinyin(name, { toneType: "none", type: "array" })
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

const rows = await db.select().from(clients);
let updated = 0;
for (const client of rows) {
  const needs = CJK_RE.test(client.name) && (!client.nameEn || client.nameEn.trim() === "");
  if (!needs) {
    continue;
  }
  const nameEn = toPinyinName(client.name);
  await db.update(clients).set({ nameEn }).where(eq(clients.id, client.id));
  updated += 1;
  console.log(`  ${client.name} -> ${nameEn}`);
}

console.log(`backfilled ${updated} / ${rows.length} clients`);
await pool.end();
