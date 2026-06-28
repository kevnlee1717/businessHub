import { api } from "./client";

export type EmployeePermissions = {
  role: string;
  dataScope: "all" | "company" | "self";
  companyIds: string[];
  overrides: { permission: string; effect: "grant" | "revoke" }[];
};

export function getEmployeePermissions(id: string): Promise<EmployeePermissions> {
  return api<EmployeePermissions>(`/employees/${id}/permissions`);
}

export function updateEmployeePermissions(
  id: string,
  body: EmployeePermissions
): Promise<EmployeePermissions> {
  return api<EmployeePermissions>(`/employees/${id}/permissions`, {
    method: "PUT",
    body
  });
}
