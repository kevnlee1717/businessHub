import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

config({ path: "../../.env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new pg.Pool({
  connectionString: databaseUrl
});

export const db = drizzle(pool, { schema });

export * from "./schema/index";
export { icaTemplateSteps } from "./seeds/icaTemplateSteps";
export type { IcaTemplateStep } from "./seeds/icaTemplateSteps";
