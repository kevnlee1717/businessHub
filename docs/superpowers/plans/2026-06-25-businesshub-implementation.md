# businessHub 实现计划

> **For agentic workers:** 本计划按阶段推进，每阶段产出可独立运行/验证的软件。代码由 codex 编写，Claude 负责拆解、审查、跑构建/测试验证。

**Goal:** 搭出新加坡移民/留学中介 + 学校的「人员 + 业务」内部管理系统框架（先框架后优化）。

**Architecture:** pnpm monorepo；后端 Fastify + Drizzle + PostgreSQL；PC 后台 React+Vite+Mantine；移动端 React+Capacitor（考勤/外勤）；独立 Python 人脸微服务（复用 ifm）。前后端共享 zod schema。

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, React, Vite, Mantine, react-i18next, TanStack Query, react-hook-form, zod, Capacitor, leaflet, Python FastAPI + InsightFace。

参考设计：`docs/superpowers/specs/2026-06-25-businesshub-design.md`

---

## 阶段总览（构建顺序）

- **Phase 0 — 地基**：monorepo 脚手架 + DB + 认证 + RBAC + 文档/账单/收款核心模型 + i18n + PC 后台壳。✅ 跑通 = 能登录、切换中英文、看到导航壳、有 owner 账号。
- **Phase 1 — 人事**：员工管理、岗位/公司、薪酬配置（模板+个人覆盖）、任务、考勤(基础)、绩效评分、工资单、缴纳记录。
- **Phase 2 — 考勤进阶 + 移动端**：打卡点、人脸微服务接入、GPS 围栏打卡、外勤汇报、GPS 轨迹、Capacitor 移动 App。
- **Phase 3 — 案件流程引擎**：模板/步骤/案件/步骤实例/必需文件/跟进 → EP + ICA。
- **Phase 4 — 教育模块**：学生、成人大专、成人英语(等级/排课/考勤)、WSQ。
- **Phase 5 — 文档库视图 + 公司实体**：客户资料库、公司实体+费用统计、合同版本库、元数据检索。

> 后续阶段在做到时 just-in-time 展开为细粒度任务。本文件先详写 Phase 0。

---

## Phase 0 — 地基

**产出验收**：`pnpm install` 后，`docker compose up -d`（postgres）→ `pnpm db:migrate` + `pnpm db:seed` → `pnpm dev` 同时起 api(:3001) 和 web(:5173)；浏览器打开能用 owner 账号登录，看到带导航的后台壳，右上角能中英文切换，登出正常。

### 文件结构

```
businessHub/
├─ package.json                 # root, workspaces, scripts (dev/build/lint/db:*)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ .gitignore  .env.example  docker-compose.yml
├─ packages/
│  ├─ shared/                   # zod schema、enums、类型、权限矩阵
│  │  ├─ package.json tsconfig.json
│  │  └─ src/{index.ts, enums.ts, permissions.ts, schemas/*.ts}
│  └─ db/                       # Drizzle
│     ├─ package.json tsconfig.json drizzle.config.ts
│     └─ src/{index.ts, schema/*.ts, migrate.ts, seed.ts}
├─ apps/
│  ├─ api/                      # Fastify
│  │  ├─ package.json tsconfig.json
│  │  └─ src/{server.ts, app.ts, env.ts, db.ts, auth/*, plugins/*, routes/*, lib/*}
│  └─ web/                      # React + Vite + Mantine
│     ├─ package.json tsconfig.json vite.config.ts index.html
│     └─ src/{main.tsx, App.tsx, i18n.ts, api/client.ts, auth/*, layout/*, pages/*, locales/{zh,en}.json}
```

### 数据模型（Phase 0 建的表，Drizzle in `packages/db/src/schema/`）

- `enums.ts`：role(owner/admin/accountant/clerk/sales/teacher/principal/photographer)、employment_type、employee_status、payroll_scheme(cpf/levy/china_fund/none)、currency(SGD/RMB)、billing_ref_type、billing_status、commission_type(percent/fixed)、payment_type
- `employees.ts`：见 spec §3.1（含 company_id/position_id 预留为 nullable，公司/岗位表 Phase 1 建）
- `documentCategories.ts`、`documents.ts`：spec §3.1 / §3.5
- `billing.ts`、`priceAdjustments.ts`、`payments.ts`：spec §3.1

### 任务

#### Task 0.1：monorepo 脚手架 + 工具链
- 创建 root `package.json`（pnpm workspaces：`packages/*`、`apps/*`、`services/*`），scripts：`dev`（并行起 api+web，用 `concurrently`）、`build`、`lint`、`typecheck`、`db:generate`/`db:migrate`/`db:seed`。
- `pnpm-workspace.yaml`、`tsconfig.base.json`（strict, paths 到 `@bh/shared`、`@bh/db`）、`.gitignore`（node_modules、dist、.env、*.local）、`.env.example`、`docker-compose.yml`（postgres:16，端口 5432，volume）。
- 验收：`pnpm install` 成功；`docker compose up -d` 起 postgres。

#### Task 0.2：packages/shared
- `enums.ts`（上面枚举，导出 const + TS union 类型）、`permissions.ts`（role→权限集合的静态映射 + `can(role, perm)` 函数）、`schemas/auth.ts`（loginSchema 等）、`index.ts` 汇总导出。
- 验收：`pnpm --filter @bh/shared build` 通过。

#### Task 0.3：packages/db（Drizzle + 迁移）
- `drizzle.config.ts`（postgres，schema 目录，out=migrations）、`src/index.ts`（drizzle 实例 + pg Pool，读 DATABASE_URL）。
- `schema/*.ts`：上述 Phase 0 表。`migrate.ts`（跑迁移）、`seed.ts`（建 owner 账号：邮箱/密码从 env 或默认 admin@bh.local/changeme，bcrypt 哈希；插入默认 document_categories：护照/学历证明/合同/租房合同/bizfile/收据/其它）。
- 生成首版 migration：`pnpm db:generate`。
- 验收：`pnpm db:migrate` 建表成功，`pnpm db:seed` 插入 owner + 分类。

#### Task 0.4：apps/api（Fastify + 认证 + RBAC + 文件）
- `env.ts`（zod 校验环境变量）、`db.ts`（用 @bh/db）、`app.ts`（注册插件）、`server.ts`（listen :3001）。
- 插件：`@fastify/cors`、`@fastify/cookie`、`@fastify/jwt`（或 session）、`@fastify/multipart`（上传）、`@fastify/static`（/uploads 预览）。
- `auth/`：`POST /auth/login`（校验 bcrypt → 发 JWT httpOnly cookie）、`POST /auth/logout`、`GET /auth/me`；`authPlugin`（解析 token → req.user）、`requireRole(...roles)` / `requirePerm(perm)` 装饰器（用 shared/permissions）。
- `routes/`：`GET /health`；占位 `routes/index.ts`。
- `lib/files.ts`：保存上传到 `uploads/YYYY/MM/<uuid>.<ext>` + 写 documents 表（接口先建，Phase 后续用）。
- 验收：`curl :3001/health` 通；用 owner 登录拿到 cookie，`GET /auth/me` 返回用户。

#### Task 0.5：apps/web（React + Mantine + i18n + 登录 + 壳）
- Vite + React + TS；`MantineProvider`、`QueryClientProvider`、`BrowserRouter`。
- `i18n.ts`（react-i18next，zh 默认 + en，从 `locales/*.json` 载）；右上角语言切换按钮。
- `api/client.ts`（fetch 封装，credentials:include，401 跳登录）。
- `auth/`：AuthContext（调 /auth/me）、ProtectedRoute、LoginPage（react-hook-form + zod）。
- `layout/AppShell`：Mantine AppShell，左侧导航（按角色显示菜单项占位：人事/业务/文档/设置）、顶部用户名 + 语言切换 + 登出。
- `pages/`：DashboardPage（占位欢迎页）。
- 验收：`pnpm dev` 起 web；登录后进壳，切换中英文导航文字变化，登出回登录页。

#### Task 0.6：联调 + 提交
- 跑通完整验收链路（见 Phase 0 产出验收）。修联调问题（CORS/cookie/代理）。Vite dev proxy `/api`→:3001。
- 提交：`git add -A && git commit`（中文 message）。

---

## 自检（Phase 0 对照 spec）

- 登录/员工/角色权限 → Task 0.2–0.5 ✓
- 文档模型/分类（预设+可增减）→ Task 0.3 documents/categories ✓（管理 UI 在 Phase 5）
- 账单/定金尾款/改价/收款/提成字段 → Task 0.3 billing/payments ✓（业务 UI 在后续阶段）
- i18n 中英切换（第一优先）→ Task 0.5 ✓
- 多币种字段（currency/fx_rate/sgd_equivalent）→ payments schema ✓
- 纯内部、仅员工登录 → 认证只一套 ✓
