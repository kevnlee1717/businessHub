import { config } from "dotenv";
import { z } from "zod";

config({ path: "../../.env" });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  FACE_SERVICE_URL: z.string().url().optional(),
  IFM_BRIDGE_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(1),
  DEEPL_API_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);
