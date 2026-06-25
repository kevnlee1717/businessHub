import {
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
