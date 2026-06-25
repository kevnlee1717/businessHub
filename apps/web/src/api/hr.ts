import {
  type AttendanceClockInput,
  type AttendanceKind,
  type AttendanceDayStatus,
  type ClockPointCreateInput,
  type ClockPointUpdateInput,
  type Currency,
  type EmployeeCreateInput,
  type EmployeeStatus,
  type EmployeeUpdateInput,
  type EmploymentType,
  type PayslipGenerateInput,
  type PayslipStatus,
  type PayrollScheme,
  type Role,
  type SiteVisitFaceStatus,
  type SiteVisitOverrideInput,
  type SiteVisitStatus,
  type StatutoryPaymentInput,
  type StatutoryType
} from "@bh/shared";
import { api } from "./client";

export type Employee = {
  id: string;
  name: string;
  name_en?: string | null;
  email: string;
  phone?: string | null;
  role: Role;
  company_id?: string | null;
  position_id?: string | null;
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
  status?: string | null;
  note?: string | null;
  created_at: string;
};

export type Position = {
  id: string;
  name: string;
  name_en?: string | null;
  note?: string | null;
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

export function listPositions(): Promise<{ positions: Position[] }> {
  return api<{ positions: Position[] }>("/positions");
}

export function listWorkShifts(): Promise<{ work_shifts: WorkShift[] }> {
  return api<{ work_shifts: WorkShift[] }>("/work-shifts");
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
