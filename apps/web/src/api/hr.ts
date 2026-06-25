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
  type PayrollScheme,
  type Role
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
