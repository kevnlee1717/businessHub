import { db } from "@bh/db";
import { sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    let database = true;

    try {
      await db.execute(sql`select 1`);
    } catch {
      database = false;
    }

    return {
      status: "ok",
      db: database
    };
  });
}
