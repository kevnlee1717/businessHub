import {
  type AttendanceClockInput,
  type AttendanceKind,
  type AttendanceDayStatus,
  type ClockPointCreateInput,
  type ClockPointUpdateInput,
  type CommissionType,
  type CompanyCreateInput,
  type CompanyUpdateInput,
  type CompensationTemplateInput,
  type Currency,
  type EmployeeCompensationInput,
  type EmployeeCreateInput,
  type EmployeeStatus,
  type EmployeeUpdateInput,
  type EmploymentType,
  type IndustryCreateInput,
  type IndustryUpdateInput,
  type KpiTargetInput,
  type PerformanceOverrideInput,
  type PayslipGenerateInput,
  type PayslipStatus,
  type PositionCreateInput,
  type PositionUpdateInput,
  type PayrollScheme,
  type Role,
  type SiteVisitFaceStatus,
  type SiteVisitOverrideInput,
  type SiteVisitStatus,
  type StatutoryPaymentInput,
  type StatutoryType,
  type WorkShiftCreateInput,
  type WorkShiftUpdateInput
} from "@bh/shared";
import { api } from "./client";

export type Employee = {
  id: string;
  name: string;
  name_en?: string | null;
  email: string;
  phone?: string | null;
  role?: Role | null;
  company_id?: string | null;
  position_id?: string | null;
  position_name?: string | null;
  shift_id?: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  join_date?: string | null;
  payroll_scheme?: PayrollScheme | null;
  salary_currency: Currency;
  gps_tracking_enabled?: boolean | null;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  name_en?: string | null;
  uen?: string | null;
  industry_id?: string | null;
  shift_id?: string | null;
  status?: string | null;
  note?: string | null;
  created_at: string;
};

export type Industry = {
  id: string;
  name: string;
  name_en?: string | null;
  active: boolean;
  created_at: string;
};

export type Position = {
  id: string;
  name: string;
  name_en?: string | null;
  note?: string | null;
  permissions: string[];
  data_scope: "all" | "company" | "self";
  is_system: boolean;
  sort_order: number;
  created_at: string;
};

export type WorkShift = {
  id: string;
  name: string;
  start_min: number;
  end_min: number;
  allowed_late_count: number;
  is_default: boolean;
  created_at: string;
};

export type ClockPoint = {
  id: string;
  name: string;
  name_en?: string | null;
  lat: string;
  lng: string;
  radius_m: number;
  company_id?: string | null;
  active: boolean;
  created_at: string;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  workDate: string;
  kind: AttendanceKind;
  clockedAt: string;
  clockPointId?: string | null;
  lat?: string | null;
  lng?: string | null;
  distanceM?: string | null;
  inGeofence?: boolean | null;
  deviationMinutes?: number | null;
  reason?: string | null;
  method?: string | null;
  onBehalfUserId?: string | null;
  createdAt: string;
};

export type AttendanceDay = {
  id: string;
  employeeId: string;
  workDate: string;
  clockInId?: string | null;
  clockOutId?: string | null;
  status?: AttendanceDayStatus | null;
  updatedAt: string;
};

export type Payslip = {
  id: string;
  employeeId: string;
  period: string;
  payday?: number | null;
  baseSalary: string;
  attendanceBonusPaid: string;
  taskCompletionBonusPaid: string;
  taskSatisfactionBonusPaid: string;
  kpiBonusPaid: string;
  commissionTotal: string;
  gross: string;
  netPay: string;
  currency: Currency;
  status: PayslipStatus;
  paidAt?: string | null;
  paidBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StatutoryPayment = {
  id: string;
  type: StatutoryType;
  period: string;
  employeeId?: string | null;
  amount: string;
  paidAt?: string | null;
  reference?: string | null;
  createdAt: string;
};

type MoneyValue = string | null;

export type CompensationTemplate = {
  id: string;
  company_id: string;
  company_name?: string | null;
  position_id: string;
  position_name?: string | null;
  base_salary?: MoneyValue;
  salary_currency?: Currency | null;
  attendance_bonus?: MoneyValue;
  task_completion_bonus?: MoneyValue;
  task_satisfaction_bonus?: MoneyValue;
  kpi_bonus?: MoneyValue;
  default_commission_type?: CommissionType | null;
  default_commission_value?: MoneyValue;
  payday?: number | null;
  created_at: string;
  updated_at: string;
};

export type CompensationTemplateRecord = {
  id: string;
  companyId: string;
  positionId: string;
  baseSalary?: MoneyValue;
  salaryCurrency?: Currency | null;
  attendanceBonus?: MoneyValue;
  taskCompletionBonus?: MoneyValue;
  taskSatisfactionBonus?: MoneyValue;
  kpiBonus?: MoneyValue;
  defaultCommissionType?: CommissionType | null;
  defaultCommissionValue?: MoneyValue;
  payday?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeCompensation = {
  id: string;
  employeeId: string;
  baseSalary?: MoneyValue;
  salaryCurrency?: Currency | null;
  attendanceBonus?: MoneyValue;
  taskCompletionBonus?: MoneyValue;
  taskSatisfactionBonus?: MoneyValue;
  kpiBonus?: MoneyValue;
  defaultCommissionType?: CommissionType | null;
  defaultCommissionValue?: MoneyValue;
  payday?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedCompensationSource = "employee" | "template" | "none";

export type ResolvedCompensationField = {
  value: string | number | null;
  source: ResolvedCompensationSource;
};

export type ResolvedCompensation = {
  employee_id: string;
  template_id: string | null;
  compensation: {
    base_salary: ResolvedCompensationField;
    salary_currency: ResolvedCompensationField;
    attendance_bonus: ResolvedCompensationField;
    task_completion_bonus: ResolvedCompensationField;
    task_satisfaction_bonus: ResolvedCompensationField;
    kpi_bonus: ResolvedCompensationField;
    default_commission_type: ResolvedCompensationField;
    default_commission_value: ResolvedCompensationField;
    payday: ResolvedCompensationField;
  };
};

export type KpiTarget = {
  id: string;
  employeeId: string;
  period: string;
  metric: string;
  target: string;
  actual?: string | null;
  achievementPct?: string | null;
};

export type PerformanceScore = {
  id: string;
  employeeId: string;
  period: string;
  attendanceQualifiedAuto?: boolean | null;
  attendanceQualifiedOverride?: boolean | null;
  taskCompletionPctAuto?: string | null;
  taskCompletionPctOverride?: string | null;
  taskSatisfactionPctAuto?: string | null;
  taskSatisfactionPctOverride?: string | null;
  kpiPctAuto?: string | null;
  kpiPctOverride?: string | null;
  effective: {
    attendance_qualified: boolean | null;
    task_completion_pct: string | null;
    task_satisfaction_pct: string | null;
    kpi_pct: string | null;
  };
};

export type SiteVisit = {
  id: string;
  employee_id: string;
  client_id?: string | null;
  captured_at?: string | null;
  synced_at?: string | null;
  lat?: string | null;
  lng?: string | null;
  accuracy?: string | null;
  address?: string | null;
  selfie_document_id?: string | null;
  site_photo_document_ids: string[];
  face_challenge_id?: string | null;
  face_status?: SiteVisitFaceStatus | null;
  face_similarity?: string | null;
  distance_to_lead_m?: string | null;
  note?: string | null;
  status: SiteVisitStatus;
  reject_reason?: string | null;
  overridden_by?: string | null;
  overridden_at?: string | null;
  created_at: string;
};

export function listEmployees(): Promise<{ employees: Employee[] }> {
  return api<{ employees: Employee[] }>("/employees");
}

export function createEmployee(body: EmployeeCreateInput): Promise<{ employee: Employee }> {
  return api<{ employee: Employee }>("/employees", {
    method: "POST",
    body
  });
}

export function updateEmployee(
  id: string,
  body: EmployeeUpdateInput
): Promise<{ employee: Employee }> {
  return api<{ employee: Employee }>(`/employees/${id}`, {
    method: "PATCH",
    body
  });
}

export function listCompanies(): Promise<{ companies: Company[] }> {
  return api<{ companies: Company[] }>("/companies");
}

export function createCompany(body: CompanyCreateInput): Promise<{ company: Company }> {
  return api<{ company: Company }>("/companies", {
    method: "POST",
    body
  });
}

export function updateCompany(
  id: string,
  body: CompanyUpdateInput
): Promise<{ company: Company }> {
  return api<{ company: Company }>(`/companies/${id}`, {
    method: "PATCH",
    body
  });
}

export function listIndustries(): Promise<{ industries: Industry[] }> {
  return api<{ industries: Industry[] }>("/industries");
}

export function createIndustry(body: IndustryCreateInput): Promise<{ industry: Industry }> {
  return api<{ industry: Industry }>("/industries", {
    method: "POST",
    body
  });
}

export function updateIndustry(
  id: string,
  body: IndustryUpdateInput
): Promise<{ industry: Industry }> {
  return api<{ industry: Industry }>(`/industries/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteIndustry(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/industries/${id}`, {
    method: "DELETE"
  });
}

export function listPositions(): Promise<{ positions: Position[] }> {
  return api<{ positions: Position[] }>("/positions");
}

export function createPosition(body: PositionCreateInput): Promise<{ position: Position }> {
  return api<{ position: Position }>("/positions", {
    method: "POST",
    body
  });
}

export function updatePosition(
  id: string,
  body: PositionUpdateInput
): Promise<{ position: Position }> {
  return api<{ position: Position }>(`/positions/${id}`, {
    method: "PATCH",
    body
  });
}

export function listWorkShifts(): Promise<{ work_shifts: WorkShift[] }> {
  return api<{ work_shifts: WorkShift[] }>("/work-shifts");
}

export function createWorkShift(body: WorkShiftCreateInput): Promise<{ work_shift: WorkShift }> {
  return api<{ work_shift: WorkShift }>("/work-shifts", {
    method: "POST",
    body
  });
}

export function updateWorkShift(
  id: string,
  body: WorkShiftUpdateInput
): Promise<{ work_shift: WorkShift }> {
  return api<{ work_shift: WorkShift }>(`/work-shifts/${id}`, {
    method: "PATCH",
    body
  });
}

export function listClockPoints(): Promise<{ clockPoints: ClockPoint[] }> {
  return api<{ clockPoints: ClockPoint[] }>("/clock-points");
}

export function createClockPoint(body: ClockPointCreateInput): Promise<{ clockPoint: ClockPoint }> {
  return api<{ clockPoint: ClockPoint }>("/clock-points", {
    method: "POST",
    body
  });
}

export function updateClockPoint(
  id: string,
  body: ClockPointUpdateInput
): Promise<{ clockPoint: ClockPoint }> {
  return api<{ clockPoint: ClockPoint }>(`/clock-points/${id}`, {
    method: "PUT",
    body
  });
}

export function deleteClockPoint(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/clock-points/${id}`, {
    method: "DELETE"
  });
}

export function getEmployeeClockPoints(employeeId: string): Promise<{ clockPoints: ClockPoint[] }> {
  return api<{ clockPoints: ClockPoint[] }>(`/employees/${employeeId}/clock-points`);
}

export function assignEmployeeClockPoints(
  employeeId: string,
  clock_point_ids: string[]
): Promise<{ clockPoints: ClockPoint[] }> {
  return api<{ clockPoints: ClockPoint[] }>(`/employees/${employeeId}/clock-points`, {
    method: "PUT",
    body: { clock_point_ids }
  });
}

export function listAttendance(params: {
  employee_id?: string | undefined;
  work_date?: string | undefined;
}): Promise<{ records: AttendanceRecord[] }> {
  const searchParams = new URLSearchParams();

  if (params.employee_id) {
    searchParams.set("employee_id", params.employee_id);
  }

  if (params.work_date) {
    searchParams.set("work_date", params.work_date);
  }

  const query = searchParams.toString();
  return api<{ records: AttendanceRecord[] }>(`/attendance${query ? `?${query}` : ""}`);
}

export function getEmployeeAttendanceDays(employeeId: string): Promise<{ days: AttendanceDay[] }> {
  return api<{ days: AttendanceDay[] }>(`/employees/${employeeId}/attendance`);
}

export function clockAttendance(body: AttendanceClockInput): Promise<{
  record: AttendanceRecord;
  day: AttendanceDay;
}> {
  return api<{ record: AttendanceRecord; day: AttendanceDay }>("/attendance/clock", {
    method: "POST",
    body
  });
}

export function listPayslips(params: {
  period?: string | undefined;
  employee_id?: string | undefined;
} = {}): Promise<{ payslips: Payslip[] }> {
  const searchParams = new URLSearchParams();

  if (params.period) {
    searchParams.set("period", params.period);
  }

  if (params.employee_id) {
    searchParams.set("employee_id", params.employee_id);
  }

  const query = searchParams.toString();
  return api<{ payslips: Payslip[] }>(`/payslips${query ? `?${query}` : ""}`);
}

export function generatePayslips(body: PayslipGenerateInput): Promise<{
  generated: number;
  payslips: Payslip[];
}> {
  return api<{ generated: number; payslips: Payslip[] }>("/payslips/generate", {
    method: "POST",
    body
  });
}

export function payPayslip(id: string): Promise<{ payslip: Payslip }> {
  return api<{ payslip: Payslip }>(`/payslips/${id}/pay`, {
    method: "POST"
  });
}

export function listStatutory(params: {
  period?: string | undefined;
  type?: StatutoryType | undefined;
  employee_id?: string | undefined;
} = {}): Promise<{ payments: StatutoryPayment[] }> {
  const searchParams = new URLSearchParams();

  if (params.period) {
    searchParams.set("period", params.period);
  }

  if (params.type) {
    searchParams.set("type", params.type);
  }

  if (params.employee_id) {
    searchParams.set("employee_id", params.employee_id);
  }

  const query = searchParams.toString();
  return api<{ payments: StatutoryPayment[] }>(`/statutory${query ? `?${query}` : ""}`);
}

export function createStatutory(body: StatutoryPaymentInput): Promise<{ payment: StatutoryPayment }> {
  return api<{ payment: StatutoryPayment }>("/statutory", {
    method: "POST",
    body
  });
}

export function listCompensationTemplates(): Promise<{ templates: CompensationTemplate[] }> {
  return api<{ templates: CompensationTemplate[] }>("/compensation/templates");
}

export function createCompensationTemplate(
  body: CompensationTemplateInput
): Promise<{ template: CompensationTemplateRecord }> {
  return api<{ template: CompensationTemplateRecord }>("/compensation/templates", {
    method: "POST",
    body
  });
}

export function updateCompensationTemplate(
  id: string,
  body: Partial<CompensationTemplateInput>
): Promise<{ template: CompensationTemplateRecord }> {
  return api<{ template: CompensationTemplateRecord }>(`/compensation/templates/${id}`, {
    method: "PATCH",
    body
  });
}

export function getEmployeeCompensation(
  employeeId: string
): Promise<{ compensation: EmployeeCompensation | null }> {
  return api<{ compensation: EmployeeCompensation | null }>(`/employees/${employeeId}/compensation`);
}

export function putEmployeeCompensation(
  employeeId: string,
  body: EmployeeCompensationInput
): Promise<{ compensation: EmployeeCompensation }> {
  return api<{ compensation: EmployeeCompensation }>(`/employees/${employeeId}/compensation`, {
    method: "PUT",
    body
  });
}

export function getResolvedCompensation(employeeId: string): Promise<ResolvedCompensation> {
  return api<ResolvedCompensation>(`/employees/${employeeId}/compensation/resolved`);
}

export function listKpiTargets(
  employeeId: string,
  period?: string | undefined
): Promise<{ targets: KpiTarget[] }> {
  const searchParams = new URLSearchParams();

  if (period) {
    searchParams.set("period", period);
  }

  const query = searchParams.toString();
  return api<{ targets: KpiTarget[] }>(`/employees/${employeeId}/kpi${query ? `?${query}` : ""}`);
}

export function putKpiTarget(
  employeeId: string,
  body: KpiTargetInput
): Promise<{ target: KpiTarget }> {
  return api<{ target: KpiTarget }>(`/employees/${employeeId}/kpi`, {
    method: "PUT",
    body
  });
}

export function listPerformance(
  employeeId: string,
  period?: string | undefined
): Promise<{ scores: PerformanceScore[] }> {
  const searchParams = new URLSearchParams();

  if (period) {
    searchParams.set("period", period);
  }

  const query = searchParams.toString();
  return api<{ scores: PerformanceScore[] }>(
    `/employees/${employeeId}/performance${query ? `?${query}` : ""}`
  );
}

export function putPerformanceOverride(
  employeeId: string,
  body: PerformanceOverrideInput
): Promise<{ score: PerformanceScore }> {
  return api<{ score: PerformanceScore }>(`/employees/${employeeId}/performance`, {
    method: "PUT",
    body
  });
}

export function listSiteVisits(params: {
  employee_id?: string | undefined;
  status?: SiteVisitStatus | undefined;
} = {}): Promise<{ siteVisits: SiteVisit[] }> {
  const searchParams = new URLSearchParams();

  if (params.employee_id) {
    searchParams.set("employee_id", params.employee_id);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  const query = searchParams.toString();
  return api<{ siteVisits: SiteVisit[] }>(`/site-visits${query ? `?${query}` : ""}`);
}

export function overrideSiteVisit(
  id: string,
  body: SiteVisitOverrideInput
): Promise<{ siteVisit: SiteVisit }> {
  return api<{ siteVisit: SiteVisit }>(`/site-visits/${id}/override`, {
    method: "POST",
    body
  });
}

export function linkSiteVisitClient(id: string, client_id: string): Promise<{ siteVisit: SiteVisit }> {
  return api<{ siteVisit: SiteVisit }>(`/site-visits/${id}`, {
    method: "PATCH",
    body: { client_id }
  });
}
