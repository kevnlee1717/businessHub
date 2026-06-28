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

## 公司闸覆盖情况(经两轮对抗式安全复查 + 实测 2026-06-28)

**② 公司闸已全面应用** —— 三类端点:
- **直接 companyId 列**:`/companies`、`/employees`、`/businesses`、`/ledger`、`/bank-accounts`、`/company-expenses`、`/recurring-costs`(列表 `companyFilter`;详情/按 id 越权 403)。
- **经 business→company 间接关联**(join businesses 后过滤):`/billing`(+ `/billing/:id`、`/billing/:id/payments`、`/billing/:id/charges`)、`/charges`、`/cases/:id/charges`、`/commission/entries`、`/sales/:id/commission-summary`、`/external-commission/entries`、`/external-commission/summary`。
- **聚合报表/看板**(底层 `ledgerEntries.companyId` / recurring / payroll / academy 全部限定到可访问公司,显式 company_id 越权 403):`/reports/pnl`、`/reports/pnl.csv`、`/reports/gst`、`/dashboard/*`(overview/receivables/payment-calendar/kpi/whatif)。
- **cases**:`/cases`、`/cases/:id` 经 ③self 行级 + billing 关联隔离(cases 无 companyId 列)。

> 实现要点:`companyIds === "all"`(owner / dataScope=all)一律不加过滤;空可访问集走 `sql\`false\`` 或 sentinel UUID → 查不到,fail-closed。改新端点照 `companyFilter` + `getAccessibleCompanyIds`,间接 join 模板见 `getVisibleCaseIds` / billing 各端点。

**实测结论(对 dev 库 + 起真实 API):** ①sales 无 finance.view 调 `/ledger`→403、admin→200;②clerk 临时设 company+只授权 JUYI → `/companies` 只返回 JUYI 一家、owner 返回 2 家、跨公司详情 403;⑥学院应收旁路已堵。行级 cases 因 dev 库无 case 数据未实测(逻辑由单测 + 复查覆盖)。

## admin 默认 dataScope = all(重要)

回填映射:owner + **admin → `all`**;accountant + principal → `company`;sales/clerk/teacher/photographer → `self`。
**为什么 admin 是 all 而非 company**:多数 admin 无单一 `companyId`,若设 company 而无公司访问行,公司闸会 `sql\`false\`` 把他们**锁死看不到任何数据**(实测发现 8 个 admin 全无 companyId)。admin 是组织级管理员,默认 all 合理;要做"公司受限 admin",用授权界面把该 admin 单独改成 company + 指定公司即可。

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

> **dev 库已处理(2026-06-28):** 已对本机 dev 库(`businesshub`)跑过 `migrate`(0023 已应用)+ **定向回填**(只跑权限相关的 dataScope/employee_company_access,未跑全量 seed 以免污染 demo 数据)。当前 owner+admin=all、clerk/sales=self。prod 上线时跑上面两条即可(全量 seed 的回填段与定向回填等价)。
> ⚠️ 回填后**多数员工没有 `companyId`** → 非 admin/owner 的 company/self 用户可访问公司清单可能为空(看不到公司级数据),需用「用户授权」界面给他们勾选可访问公司。
