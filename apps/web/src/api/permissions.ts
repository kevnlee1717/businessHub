import { api } from "./client";

export type EmployeePermissions = {
  dataScope: "all" | "company" | "self";
  positionId: string;
  companyIds: string[];
  overrides: { permission: string; effect: "grant" | "revoke" }[];
};

export type EmployeePermissionsUpdate = {
  positionId: string;
  companyIds: string[];
  overrides: { permission: string; effect: "grant" | "revoke" }[];
};

export function getEmployeePermissions(id: string): Promise<EmployeePermissions> {
  return api<EmployeePermissions>(`/employees/${id}/permissions`);
}

export function updateEmployeePermissions(
  id: string,
  body: EmployeePermissionsUpdate
): Promise<EmployeePermissions> {
  return api<EmployeePermissions>(`/employees/${id}/permissions`, {
    method: "PUT",
    body
  });
}
