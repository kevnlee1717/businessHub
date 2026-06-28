# 权限系统设计(RBAC + 个人覆盖 + 公司隔离 + 行级范围)

日期:2026-06-28
状态:已确认,进入实现

## 背景与现状

现有一套**静态 RBAC**:
- `packages/shared/src/permissions.ts`:8 个角色 + 22 个模块级权限,角色→权限写死。
- `packages/shared/src/enums.ts`:`roles = [owner, admin, accountant, clerk, sales, teacher, principal, photographer]`。
- API:`apps/api/src/auth/jwt.ts` 有 `requireRole()` / `requirePerm()`,`can(role, perm)` 查静态表。JWT 载荷 `{id, role, email}`。
- Web:`AppShell` 侧边菜单写死、**完全没按权限过滤**;`User` 类型只带 `role`;`ProtectedRoute` 只判断登录。
- 多公司:`employees.companyId` 单公司归属;`businesses.companyId` 业务挂公司;已有 `salesBusinessAssignments`(销售↔业务 多对多)。

## 目标

从"写死角色"升级为 **角色默认 + 个人灵活覆盖 + 公司范围隔离 + 行级数据范围**,并提供授权管理界面。

## 核心模型:三道闸

一条数据最终可见,需同时通过:

| 闸 | 作用域 | 说明 |
|---|---|---|
| ① 菜单闸 | 全部模块 | 有没有这个功能的权限,没有则菜单不渲染 + 后端 403 |
| ② 公司闸 | 全部带 companyId 的模块 | 能访问哪几家公司的数据 |
| ③ 行级闸 | 仅指定模块 | 同公司内是看全部记录还是只看自己的 |

**有效权限计算(纯函数,放 `@bh/shared`):**
```
有效权限 = 角色默认 ∪ 个人 grant − 个人 revoke
```
- 角色默认写在代码 `ROLE_PERMISSIONS`(改一处全角色生效)。
- 个人覆盖只存"与默认不同"的条目(grant/revoke),不存全量。
- 角色默认变化 → 未被个人覆盖者自动跟随。

## 权限目录(混合粒度:敏感模块细化到动作)

大部分模块维持 `xxx.manage` / `xxx.view`;**薪酬 / 财务 / 报表**拆细:

| 模块 | 权限项 |
|---|---|
| 薪酬 | `payroll.view`、`payroll.edit`、`payroll.approve`、`payslip.view_own`(几乎人人有) |
| 财务 | `finance.view`、`finance.edit`、`finance.approve` |
| 报表 | `report.view`、`report.export` |
| 其余 | employee.* / company.manage / case.* / document.* / education.* / task.* / attendance.* / commission.* / settings.manage 维持现状 |

> 迁移时把旧的 `payroll.manage` 映射为 `payroll.edit + payroll.approve`,`finance.manage` 映射为 `finance.edit + finance.approve`,`payroll.view` 保留,新增 `finance.view`/`report.view`/`report.export`/`payslip.view_own`。各角色默认表据此重写。

## 数据库改动

### 1. 个人权限覆盖表 `employee_permission_overrides`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| employeeId | uuid fk employees cascade | |
| permission | text | 如 `finance.edit` |
| effect | enum(`grant`,`revoke`) | 加 / 减 |
| createdAt | timestamptz | |
| | unique(employeeId, permission) | |

### 2. 可访问公司表 `employee_company_access`(多对多)— ② 公司闸
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| employeeId | uuid fk employees cascade | |
| companyId | uuid fk companies cascade | |
| createdAt | timestamptz | |
| | unique(employeeId, companyId) | 不在表内 = 完全看不到该公司 |

### 3. `employees` 新增列 `data_scope` — ③ 行级闸档位
枚举 `dataScopeEnum = [all, company, self]`:
- `all`:跨全部公司 + 看全部记录(owner)
- `company`:授权公司内**所有**记录可见(admin / accountant / principal 等管理类)
- `self`:行级模块里**只看自己的**(sales / clerk / teacher 等)

## 行级闸:适用模块与归属定义

**仅以下模块启用行级过滤**(其余模块只走 ①②):
- 客户 / Case(EP/ICA cases、clients、followUps)
- 提成(commission)
- 我的工资条(payslip,员工自查)
- 考勤(attendance,自查打卡)

**`data_scope='self'` 时追加归属过滤(任一命中即可见):**
```
归属命中 = (记录所属 business 被分配给我 via salesBusinessAssignments)
        OR (记录上的负责人/创建人 = 我)
```
- 复用 `salesBusinessAssignments`(active=true)取"我负责的 businessId 集合"。
- 记录需要有可判定归属的字段(负责人/创建人)。缺字段的表在实现时补 `ownerId`/`createdBy`(本期只对启用行级的表补)。

## API 改造

- `getEffectivePermissions(user)`:加载该员工 overrides,与角色默认合并 → 有效权限集合。每请求执行(短缓存可选)。
- `requirePerm(perm)`:改为查"有效权限",不再用静态 `can(role)`。`requireRole` 保留。
- `getAccessibleCompanyIds(user)`:owner/`all` → 全部;否则查 `employee_company_access`。所有带 `companyId` 的查询统一 `where companyId IN (...)`。
- 行级 helper:对启用模块,当 `data_scope='self'` 时拼接归属过滤(assigned business 集合 + ownerId=self)。
- `/auth/me`:返回 `{ user, permissions: string[], companies: {id,name}[], dataScope }`。

## 前端改造

- `User` 类型新增 `permissions: string[]`、`companies: {id,name}[]`、`dataScope`。
- `useCan(perm)` hook + `<Can perm>` 组件:按钮/区块按权限显隐。
- `AppShell` 导航项加 `perm` 字段,菜单按有效权限过滤(父级无任何可见子项则父级隐藏)。
- `ProtectedRoute` 保持;可加按 perm 的路由守卫(可选)。

## 授权界面(照 vue-element-admin 风格,挂在 设置 下)

新页 `/settings/permissions`「用户授权」:
- 左:员工列表(搜索/角色筛选)。
- 右(点开员工)抽屉/详情:
  1. **角色** 下拉 —— 选后默认权限自动带出。
  2. **数据范围** 单选 —— 全部 / 本公司全部 / 仅自己。
  3. **可访问公司** —— 多选勾选(穿梭框/复选组)。
  4. **权限覆盖** —— 按模块分组的权限树;每项标注来源 `角色默认✓ / 手动加+ / 手动减−`,点击切换;与角色默认相同的不入库。
- 保存:diff 出 overrides + company access + dataScope,一次提交。

### 护栏
- 进页需 `settings.manage`。
- 只有 `owner` 能把别人设为 `owner` 角色或 `data_scope=all`。
- (可选)不能授予自己没有的权限——本期对受信管理员从简,先不强制。

## 迁移与回填

- DDL:建 2 表 + 加 1 列 + 加 `data_scope` enum。
- 回填:
  - 每员工 `data_scope` 按角色默认(owner→all;admin/accountant/principal→company;sales/clerk/teacher/photographer→self)。
  - `employee_company_access`:用现有 `companyId` 生成一行(为空则不生成)。owner 设 all,不需要逐行。
  - 权限目录拆细后重写 `ROLE_PERMISSIONS`。
- 更新 `packages/db/src/seed.ts`。

## 实现阶段

1. **DB**:enums(dataScope/effect)、2 表、employees 加列、迁移 SQL、seed。
2. **shared**:权限目录重写、`computeEffectivePermissions`、`ROLE_PERMISSIONS` 重写。
3. **API**:effective perms 加载、`requirePerm` 改造、company-scope helper、行级 helper、应用到行级路由、`/auth/me` 扩展。
4. **web 基础**:User 类型、`useCan`/`<Can>`、AppShell 过滤。
5. **授权 UI**:`/settings/permissions` 页 + 后端 CRUD 路由(读/写 overrides、company access、role、dataScope)。
6. **收尾**:typecheck、build、行级表补 ownerId 字段、回填脚本验证。

## 验证

- `pnpm typecheck` 全过。
- shared 纯函数 `computeEffectivePermissions` 加单测(grant/revoke/默认跟随)。
- 手动:用不同角色登录,验证菜单过滤、公司隔离、self 行级只看自己。
