import { type Role } from "./enums";

export const permissions = [
  "employee.manage",
  "employee.view",
  "payroll.manage",
  "payroll.view",
  "finance.manage",
  "finance.view",
  "case.manage",
  "case.view",
  "document.manage",
  "document.view",
  "settings.manage",
  "attendance.self",
  "attendance.manage",
  "task.manage",
  "task.view",
  "commission.view_own",
  "commission.manage",
  "education.manage",
  "education.view"
] as const;

export type Permission = (typeof permissions)[number];

const allPermissions = [...permissions];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: allPermissions,
  admin: [
    "employee.manage",
    "employee.view",
    "payroll.view",
    "finance.view",
    "case.manage",
    "case.view",
    "document.manage",
    "document.view",
    "settings.manage",
    "attendance.manage",
    "attendance.self",
    "task.manage",
    "task.view",
    "commission.manage",
    "education.manage",
    "education.view"
  ],
  accountant: [
    "employee.view",
    "payroll.manage",
    "payroll.view",
    "finance.manage",
    "finance.view",
    "document.view",
    "attendance.self",
    "task.view",
    "commission.manage"
  ],
  clerk: [
    "employee.view",
    "case.manage",
    "case.view",
    "document.manage",
    "document.view",
    "attendance.self",
    "task.manage",
    "task.view",
    "education.view"
  ],
  sales: [
    "case.manage",
    "case.view",
    "document.manage",
    "document.view",
    "attendance.self",
    "task.view",
    "commission.view_own"
  ],
  teacher: [
    "document.view",
    "attendance.self",
    "task.view",
    "education.view"
  ],
  principal: [
    "employee.view",
    "document.manage",
    "document.view",
    "attendance.manage",
    "attendance.self",
    "task.manage",
    "task.view",
    "education.manage",
    "education.view"
  ],
  photographer: [
    "document.manage",
    "document.view",
    "attendance.self",
    "task.view"
  ]
};

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}
