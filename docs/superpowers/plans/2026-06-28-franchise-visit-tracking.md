# 加盟业务·物业拜访跟踪 实现计划

> 设计文档：`docs/superpowers/specs/2026-06-28-franchise-visit-tracking-design.md`
> 执行方式：Claude 驱动 codex（`mcp__codex__codex`）按阶段实现，每阶段后由 Claude 审查 + typecheck/build + commit。
> 工作树：`.worktrees/franchise-tracking`（分支 `feat/franchise-tracking`）

**Goal:** 在加盟业务一级菜单下交付「拜访跟踪」CRM（场地/联系人/拜访+问券/KPI 看板），综合物业与餐饮各一套，集团+联系人共享；6 个综合物业子业务 + 餐饮食阁/咖啡厅做二级菜单占位。

**Architecture:** 全程照搬 recruitment 模块范式——Drizzle schema（`franchise_*` 8 表）→ Fastify+Zod 路由 → React Query API 客户端 → Mantine 前端 `Layout+Tabs+Shared`。company 数据隔离 + `franchise.view/manage` 权限。

**Tech Stack:** PostgreSQL + Drizzle ORM、Fastify、Zod、React 18 + Mantine 7、TanStack React Query、i18next。

---

## 阶段 1：数据库 schema + enums + 迁移

**Files:**
- Create: `packages/db/src/schema/franchise.ts`
- Modify: `packages/db/src/schema/index.ts`（导出 franchise）
- Modify: `packages/db/src/schema/enums.ts`（加 franchise enums）
- Modify: `packages/shared/src/enums.ts`（加 franchise enum 常量数组）
- Generate: `packages/db/migrations/0030_*.sql`（drizzle-kit）

**内容：** 8 表见 spec §5：`franchise_org`、`franchise_contact`（含 `referred_by_contact_id` 自关联）、`franchise_property`、`franchise_property_visit`、`franchise_property_survey`、`franchise_fnb_site`、`franchise_fnb_visit`、`franchise_fnb_survey`。所有表 `id/company_id/created_at/updated_at`，owner→employees。enums 见 spec §5 末。

**验收：**
- `pnpm --filter @bh/db drizzle-kit generate` 生成 0030 迁移无报错
- 迁移 SQL 含 8 张表 + 所有 enum type
- 应用到 dev 库：迁移成功、`\dt franchise_*` 见 8 表
- `pnpm -r typecheck` 中 db/shared 包通过

## 阶段 2：后端 API

**Files:**
- Create: `packages/shared/src/schemas/franchise.ts`（Zod：各实体 create/update/list-query schema）
- Create: `apps/api/src/routes/franchise.ts`
- Modify: `apps/api/src/routes/index.ts`（注册 `registerFranchiseRoutes`）
- Modify: 权限定义处（加 `franchise.view`/`franchise.manage` 到权限枚举 + owner/相关角色默认授予）

**内容：** 仿 `routes/recruitment.ts`。端点见 spec §6：orgs / contacts / properties(+/:id/visits) / fnb-sites(+/:id/visits) / visits / kpi。`preHandler: requirePerm(...)` + `getAccessibleFilter` company 隔离。拜访 POST 同时落 survey（事务）。

**验收：**
- `pnpm --filter @bh/api typecheck` 通过
- API 启动无报错；`curl` 冒烟：登录后 GET `/api/franchise/properties` 返回 `{properties:[]}`、POST org/property/contact 能创建、POST visit 带 survey 能落库、GET kpi 返回聚合结构

## 阶段 3：前端 API 客户端

**Files:**
- Create: `apps/web/src/api/franchise.ts`（React Query keys + 调用函数 + TS 类型）

**内容：** 仿 `apps/web/src/api/recruitment.ts`：`franchiseKeys`、`list/create/update/delete*` 函数走 `api<T>()`。

**验收：** `pnpm --filter @bh/web typecheck` 该文件无类型错误。

## 阶段 4：前端页面 + 菜单 + 路由 + i18n

**Files:**
- Create: `apps/web/src/pages/franchise/TrackingLayout.tsx`（Tab 容器，仿 RecruitmentLayout）
- Create: `apps/web/src/pages/franchise/TrackingShared.tsx`（列表/详情/拜访问券表单实现）
- Create: 各 re-export 页 `PropertiesPage/PropertyDetailPage/FnbSitesPage/FnbSiteDetailPage/ContactsPage/ContactDetailPage/VisitsPage/TrackingDashboardPage.tsx`
- Create: `apps/web/src/pages/franchise/FranchisePropertyPlaceholder.tsx`、`FranchiseFnbPlaceholder.tsx`（element-admin 卡片网格 + Coming Soon）
- Modify: `apps/web/src/App.tsx`（加 franchise 嵌套路由，见 spec §4）
- Modify: `apps/web/src/layout/AppShell.tsx`（franchise 改为带 children 的一级菜单）
- Modify: `apps/web/src/locales/zh.json`、`en.json`（`nav.franchise.*`、`franchise.*` 文案）

**内容：** 见 spec §7。列表用 Mantine Table+过滤+搜索；详情页拜访时间线；拜访/问券表单移动端友好，综合物业问券按 PDF ②勾服务→③动态展开明细，餐饮问券走 fnb_survey 字段；联系人详情展示转介绍关系；看板 KPI 卡片+排行+待拜访提醒。占位页卡片网格。

**验收：**
- `pnpm --filter @bh/web typecheck` 通过
- `pnpm --filter @bh/web build` 通过
- 侧栏「加盟业务」展开见 拜访跟踪/综合物业/餐饮；拜访跟踪 5 个 Tab 可切；占位页显示子业务卡片

## 阶段 5：整体验证

- `pnpm -r typecheck` 全绿
- `pnpm -r build` 全绿
- 启 dev（api+web）冒烟：建集团→建场地→建联系人→录拜访+问券→看板出数；餐饮同链路
- `git status` 核对未误改 recruitment 文件

## 自查（spec 覆盖）
- §4 菜单/路由 → 阶段 4 ✓
- §5 数据模型 8 表 → 阶段 1 ✓
- §6 API → 阶段 2 ✓
- §7 前端 → 阶段 3/4 ✓
- §8 KPI → 阶段 2(kpi 端点)+阶段 4(看板页) ✓
- §9 迁移/权限 → 阶段 1/2 ✓
- §10 后续项 → 不在本期 ✓
