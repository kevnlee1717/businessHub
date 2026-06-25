import { type FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./auth";
import { registerHealthRoutes } from "./health";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes);
}
