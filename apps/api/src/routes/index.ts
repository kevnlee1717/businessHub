import { type FastifyInstance } from "fastify";
import { registerAttendanceRoutes } from "./attendance";
import { registerAuthRoutes } from "./auth";
import { registerCompanyRoutes } from "./companies";
import { registerCompensationRoutes } from "./compensation";
import { registerEmployeeRoutes } from "./employees";
import { registerHealthRoutes } from "./health";
import { registerKpiRoutes } from "./kpi";
import { registerPayslipRoutes } from "./payslip";
import { registerPerformanceRoutes } from "./performance";
import { registerPositionRoutes } from "./positions";
import { registerStatutoryRoutes } from "./statutory";
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
  await app.register(registerAttendanceRoutes);
  await app.register(registerKpiRoutes);
  await app.register(registerPerformanceRoutes);
  await app.register(registerStatutoryRoutes);
  await app.register(registerPayslipRoutes);
}
