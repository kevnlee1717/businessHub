# 权限系统 runbook

实现日期:2026-06-28。设计文档:`docs/superpowers/specs/2026-06-28-permission-system-design.md`。

## 一句话

三道闸:**①菜单/功能闸(有效权限)** + **②公司闸(可访问公司清单)** + **③行级闸(dataScope=self 只看自己)**。
有效权限 = `角色默认(ROLE_PERMISSIONS) ∪ 个人 grant − 个人 revoke`。

## 关键文件

| 层 | 文件 | 作用 |
|---|---|---|
| 权限目录/算法 | `packages/shared/src/permissions.ts` | permissions 目录、ROLE_PERMISSIONS、`computeEffectivePermissions`、`permissionCatalog`(UI 分组) |
| DB | `packages/db/src/schema/employeePermissionOverrides.ts` | 个人加/减覆盖 |
| DB | `packages/db/src/schema/employeeCompanyAccess.ts` | 可访问公司多对多 |
| DB | `employees.dataScope` 列 | 行级档位 all/company/self |
| API 鉴权核心 | `apps/api/src/auth/context.ts` | `loadAuthContext`(每请求缓存有效权限/dataScope/companyIds)、`companyFilter`、`getVisibleCaseIds` |
| API 鉴权核心 | `apps/api/src/auth/jwt.ts` | `requirePerm` 基于有效权限判定(fail-closed 403) |
| API | `apps/api/src/routes/permissions.ts` | `GET/PUT /employees/:id/permissions` 授权读写(owner 护栏) |
| API | `apps/api/src/routes/auth.ts` | `/auth/me` 返回 permissions/dataScope/companies |
| Web | `apps/web/src/auth/AuthContext.tsx` + `permissions.tsx` | `useCan()` / `<Can>` / can() |
| Web | `apps/web/src/layout/AppShell.tsx` | 菜单按有效权限过滤 |
| Web | `apps/web/src/pages/settings/PermissionsPage.tsx` | 「用户授权」界面 |

## 角色默认 dataScope

owner→`all`;admin/accountant/principal→`company`;sales/clerk/teacher/photographer→`self`。

## 怎么改权限规则

- **改角色默认**:只动 `packages/shared/src/permissions.ts` 的 `ROLE_PERMISSIONS`,未被个人覆盖的人自动跟随。
- **新增权限项**:在 `permissions` 数组加,在 `permissionCatalog` 加 label(授权界面才看得到),在各角色默认里按需加,后端路由用 `requirePerm("新.权限")`。

## 公司闸覆盖情况(经一轮对抗式安全复查 2026-06-28)

**已应用公司闸(② 已隔离)** —— 直接带 `companyId` 列的端点:
- 列表过滤:`/companies`、`/employees`、`/businesses`、`/ledger`、`/bank-accounts`、`/company-expenses`、`/recurring-costs`
- 详情/按 id 越权 403:`/companies/:id`、`/employees/:id`、`/businesses/:id`、`/ledger/proof-missing`、`/ledger/uncategorized`、`/companies/:id/expenses/summary`
- cases:`/cases`、`/cases/:id` 经 ③self 行级 + billing 关联间接隔离(cases 无 companyId 列)

**⚠️ 仍未隔离(下一期 Phase 7,需谨慎——多为 prod 高频财务功能):**
- **经 business→company 间接归属**(无直接 companyId,需 join businesses 再 `companyFilter`):`/billing`、`/charges`、`/commission/entries`、`/sales/:id/commission-summary`、`/external-commission`。`finance.view` 会计目前仍可跨公司读这些账单/提成。
- **聚合类报表**(默认聚合全部公司,需把 companyIds 注入聚合):`/reports/*`(pnl/gst/receivables)、`/dashboard`。本分支未改这两个文件(pre-existing),但公司闸理应套上。
- 这些改动面大、触碰 prod 高频财务功能,需单独评估;改时复用 `companyFilter` + `getAccessibleCompanyIds`,join 模板见 `getVisibleCaseIds`。

## 其它已知边界

- `GET /companies`、`GET /employees` 无 `requirePerm`(任何登录用户可访问,但已受公司闸过滤);如需更严可加 `employee.view`。
- `payslip.view_own` 权限在目录里但**目前没有端点消费它** —— 员工"我的工资条"自助查看端点尚未实现(死权限)。考勤自查(`attendance.self`)、提成自查(`/commission/mine`)已有。
- `GET /employees/:id/compensation` 已补 `requirePerm("payroll.view")`(原先无鉴权);本人自助查薪资不在本期范围。
- 授权 PUT 的护栏:已防"非 owner 提升为 owner/all"+"非 owner 修改现任 owner";但**未限制** settings.manage 管理员给自己/他人扩张公司访问清单(spec 122 行从简豁免之外的提权面,知悉)。

## 上线步骤(需在有 DATABASE_URL 的环境执行)

```bash
pnpm --filter @bh/db migrate   # 应用 migrations/0023_*.sql(新增 2 表 + employees.data_scope 列,additive)
pnpm --filter @bh/db seed      # 回填:按角色设 dataScope + 用现有 companyId 建 employee_company_access(幂等)
```
迁移是 additive(新表 + 带默认值的非空列),对现有数据安全。seed 的回填部分幂等(onConflictDoNothing)。
