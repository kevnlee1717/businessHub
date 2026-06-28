import { type Role } from "./enums";

export const permissions = [
  "employee.manage",
  "employee.view",
  "company.manage",
  "payroll.view",
  "payroll.edit",
  "payroll.approve",
  "payslip.view_own",
  "finance.view",
  "finance.edit",
  "finance.approve",
  "report.view",
  "report.export",
  "case.manage",
  "case.view",
  "document.manage",
  "document.view",
  "settings.manage",
  "attendance.self",
  "attendance.manage",
  "task.manage",
  "task.assign",
  "task.view",
  "commission.view_own",
  "commission.manage",
  "education.manage",
  "education.view"
] as const;

export type Permission = (typeof permissions)[number];

const allPermissions = [...permissions];
const permissionSet = new Set<string>(permissions);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: allPermissions,
  admin: [
    "employee.manage",
    "employee.view",
    "company.manage",
    "payroll.view",
    "payroll.edit",
    "payroll.approve",
    "payslip.view_own",
    "finance.view",
    "finance.edit",
    "finance.approve",
    "report.view",
    "report.export",
    "case.manage",
    "case.view",
    "document.manage",
    "document.view",
    "settings.manage",
    "attendance.manage",
    "attendance.self",
    "task.manage",
    "task.assign",
    "task.view",
    "commission.manage",
    "education.manage",
    "education.view"
  ],
  accountant: [
    "employee.view",
    "payroll.view",
    "payroll.edit",
    "payroll.approve",
    "payslip.view_own",
    "finance.view",
    "finance.edit",
    "finance.approve",
    "report.view",
    "report.export",
    "document.view",
    "attendance.self",
    "task.manage",
    "task.view",
    "commission.manage"
  ],
  clerk: [
    "employee.view",
    "payslip.view_own",
    "case.manage",
    "case.view",
    "document.manage",
    "document.view",
    "attendance.self",
    "task.manage",
    "task.assign",
    "task.view",
    "education.view"
  ],
  sales: [
    "payslip.view_own",
    "case.manage",
    "case.view",
    "document.manage",
    "document.view",
    "attendance.self",
    "task.manage",
    "task.view",
    "commission.view_own"
  ],
  teacher: [
    "payslip.view_own",
    "document.view",
    "attendance.self",
    "task.manage",
    "task.view",
    "education.view"
  ],
  principal: [
    "employee.view",
    "payslip.view_own",
    "report.view",
    "document.manage",
    "document.view",
    "attendance.self",
    "task.manage",
    "task.assign",
    "task.view",
    "education.manage",
    "education.view"
  ],
  photographer: [
    "payslip.view_own",
    "document.manage",
    "document.view",
    "attendance.self",
    "task.manage",
    "task.view"
  ]
};

export const permissionCatalog: {
  key: string;
  label: string;
  permissions: { key: Permission; label: string }[];
}[] = [
  {
    key: "employee",
    label: "员工",
    permissions: [
      { key: "employee.manage", label: "管理员工" },
      { key: "employee.view", label: "查看员工" }
    ]
  },
  {
    key: "company",
    label: "公司",
    permissions: [{ key: "company.manage", label: "管理公司" }]
  },
  {
    key: "payroll",
    label: "薪酬",
    permissions: [
      { key: "payroll.view", label: "查看薪酬" },
      { key: "payroll.edit", label: "薪酬录入/改方案" },
      { key: "payroll.approve", label: "确认发放" },
      { key: "payslip.view_own", label: "查看本人工资条" }
    ]
  },
  {
    key: "finance",
    label: "财务",
    permissions: [
      { key: "finance.view", label: "查看财务" },
      { key: "finance.edit", label: "录入财务" },
      { key: "finance.approve", label: "对账确认" }
    ]
  },
  {
    key: "report",
    label: "报表",
    permissions: [
      { key: "report.view", label: "查看报表" },
      { key: "report.export", label: "导出报表" }
    ]
  },
  {
    key: "case",
    label: "移民Case",
    permissions: [
      { key: "case.manage", label: "管理Case" },
      { key: "case.view", label: "查看Case" }
    ]
  },
  {
    key: "document",
    label: "文档",
    permissions: [
      { key: "document.manage", label: "管理文档" },
      { key: "document.view", label: "查看文档" }
    ]
  },
  {
    key: "settings",
    label: "设置",
    permissions: [{ key: "settings.manage", label: "管理设置" }]
  },
  {
    key: "attendance",
    label: "考勤",
    permissions: [
      { key: "attendance.self", label: "个人考勤" },
      { key: "attendance.manage", label: "管理考勤" }
    ]
  },
  {
    key: "task",
    label: "任务",
    permissions: [
      { key: "task.manage", label: "管理任务" },
      { key: "task.assign", label: "分派任务" },
      { key: "task.view", label: "查看任务" }
    ]
  },
  {
    key: "commission",
    label: "提成",
    permissions: [
      { key: "commission.view_own", label: "查看本人提成" },
      { key: "commission.manage", label: "管理提成" }
    ]
  },
  {
    key: "education",
    label: "教育",
    permissions: [
      { key: "education.manage", label: "管理教育" },
      { key: "education.view", label: "查看教育" }
    ]
  }
];

export type PermissionOverride = { permission: string; effect: "grant" | "revoke" };

export function computeEffectivePermissions(role: Role, overrides: PermissionOverride[]): Permission[] {
  const effectivePermissions = new Set<Permission>(ROLE_PERMISSIONS[role]);
  const revokedPermissions = new Set<string>();

  for (const override of overrides) {
    if (!permissionSet.has(override.permission)) {
      continue;
    }

    if (override.effect === "grant") {
      effectivePermissions.add(override.permission as Permission);
    } else {
      revokedPermissions.add(override.permission);
    }
  }

  for (const permission of revokedPermissions) {
    effectivePermissions.delete(permission as Permission);
  }

  return permissions.filter((permission) => effectivePermissions.has(permission));
}

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}
