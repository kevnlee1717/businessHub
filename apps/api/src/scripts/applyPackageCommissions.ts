import { readFile } from "node:fs/promises";
import { pool } from "@bh/db";

type Args = {
  dryRun: boolean;
};

const migrationUrl = new URL("../../../../packages/db/migrations/0054_ep_package_commission.sql", import.meta.url);

function parseArgs(argv: string[]): Args {
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun };
}

async function loadMigrationStatements() {
  const sql = await readFile(migrationUrl, "utf8");
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyDdl(dryRun: boolean) {
  const statements = await loadMigrationStatements();

  if (dryRun) {
    console.log(`ddl dry-run: ${statements.length} statements would be applied from 0054_ep_package_commission.sql`);
    return;
  }

  for (const [index, statement] of statements.entries()) {
    await pool.query(statement);
    console.log(`ddl ok: ${index + 1}/${statements.length}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(args.dryRun ? "Mode: dry-run (no database writes)" : "Mode: apply");

  await applyDdl(args.dryRun);
}

try {
  await main();
} finally {
  await pool.end();
}
