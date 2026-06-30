import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db, employees, pool } from "../index";

config({ path: "../../.env" });

const updated = await db
  .update(employees)
  .set({ mustChangePassword: true })
  .where(sql`${employees.role} IS DISTINCT FROM 'owner'`)
  .returning({ id: employees.id });

console.log(`Marked ${updated.length} employees (excluding owner) as must_change_password=true`);

await pool.end();
