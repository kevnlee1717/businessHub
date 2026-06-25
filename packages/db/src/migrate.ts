import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

config({ path: "../../.env" });

await migrate(db, { migrationsFolder: "./migrations" });
await pool.end();

console.log("Database migrations completed");
