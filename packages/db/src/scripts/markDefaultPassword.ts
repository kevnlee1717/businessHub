import { config } from "dotenv";
import { db, employees, pool } from "../index";

config({ path: "../../.env" });

const updated = await db
  .update(employees)
  .set({ mustChangePassword: true })
  .returning({ id: employees.id });

console.log(`Marked ${updated.length} employees as must_change_password=true`);

await pool.end();
