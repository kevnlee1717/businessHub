import { type FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./auth";
import { registerCompanyRoutes } from "./companies";
import { registerCompensationRoutes } from "./compensation";
import { registerEmployeeRoutes } from "./employees";
import { registerHealthRoutes } from "./health";
import { registerPositionRoutes } from "./positions";
import { registerTaskRoutes } from "./tasks";
import { registerWorkShiftRoutes } from "./workShifts";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes);
  await app.register(registerEmployeeRoutes);
  await app.register(registerCompanyRoutes);
  await app.register(registerPositionRoutes);
  await app.register(registerWorkShiftRoutes);
  await app.register(registerCompensationRoutes);
  await app.register(registerTaskRoutes);
}
