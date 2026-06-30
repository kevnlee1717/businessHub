# 宣传册(资料库)管理模块 — 设计文档

日期:2026-06-30
分支:`feat/brochure`(worktree:`businessHub-dev/.worktrees/brochure`)

## 1. 背景与目标

公司有一批对外资料(宣传册、报价单、FAQ 等),需要在 businessHub 后台集中管理:

- 右侧菜单新增「宣传册」入口(路由 `/brochure`)。
- 每份资料有:名字、归类、备注、版本;同一份资料后续会出新版本,要保留**版本历史**并标记**当前版本**。
- 归类两级:**一级行业**(宣传册模块独立维护,不挂公司主行业表),**二级资料类型**(报价单/宣传册/FAQ… 可在设置里自定义增删)。
- 文件类型:任意(PDF/图片在线预览,其它仅下载),单文件 ≤20MB(沿用现有 multipart 上限)。

## 2. 数据模型(迁移 0043)

新建 `packages/db/src/schema/brochures.ts`,4 张表:

```
brochure_industries  行业字典(独立)
  id uuid pk · name text notNull · sort_order int default 0 · created_at

brochure_categories  资料类型字典(报价单/宣传册/FAQ… 可增删)
  id uuid pk · name text notNull · sort_order int default 0 · created_at

brochures            一份资料的「身份」(与具体版本无关)
  id uuid pk
  name text notNull
  industry_id uuid → brochure_industries (onDelete: restrict/set null)
  category_id uuid → brochure_categories (onDelete: restrict/set null)
  notes text
  current_version_id uuid → brochure_versions (nullable, 当前版本指针)
  sort_order int default 0
  created_at · updated_at · created_by uuid → employees(set null)

brochure_versions    版本历史
  id uuid pk
  brochure_id uuid → brochures (onDelete: cascade)
  version_no int notNull        -- 每份资料内自增 1,2,3…(显示 v1/v2/v3)
  note text                     -- 本版变更说明
  filename text notNull
  storage_path text notNull     -- uploads/brochure/<uuid><ext>
  mime text · size int
  uploaded_by uuid → employees(set null) · uploaded_at timestamp default now
```

**核心**:`brochures` 是身份,换版本它不变;`current_version_id` 指当前版本。`brochure_versions.version_no` 在该资料内单调递增。删除资料级联删版本;`current_version_id` 用「插入新版本后再 update 指针」避免循环外键问题(先建 brochure(current 为 null)→ 插 version → update current_version_id)。

文件落本地磁盘 `uploads/brochure/<uuid><ext>`,经 `@fastify/static` 以 `/uploads/` 暴露。照 `apps/api/src/routes/epPriceFiles.ts` 的 `savePdf`/`isPdf` 改成接受任意 mime 的 `saveFile`。

## 3. 权限(position 驱动)

`packages/shared/src/permissions.ts` 新增:

- `brochure.view` — 查看 + 下载
- `brochure.manage` — 增删改资料/版本 + 管理行业、资料类型字典

加进 `permissions` 数组 + `permissionCatalog`(新分组「宣传册」)。后端写操作 `requirePerm("brochure.manage")`,列表/下载 `requirePerm("brochure.view")`。

## 4. 后端接口(Fastify,`apps/api/src/routes/brochures.ts`,挂 `/api`)

字典(行业 / 资料类型,CRUD 照 `industries.ts`):
- `GET /brochure-industries` · `POST` · `PATCH /:id` · `DELETE /:id`
- `GET /brochure-categories` · `POST` · `PATCH /:id` · `DELETE /:id`

资料:
- `GET /brochures?industry_id=&category_id=&q=&page=&page_size=` — 分页列表,带 join 行业名/类型名 + 当前版本信息(version_no/uploaded_at/filename)
- `POST /brochures` — multipart:name/industry_id/category_id/notes + 首个文件,一次建 brochure + v1 并设当前
- `PATCH /brochures/:id` — 改 name/industry_id/category_id/notes
- `DELETE /brochures/:id` — 删整份(级联删版本;尽量删磁盘文件)

版本:
- `GET /brochures/:id/versions` — 该资料全部版本(降序)
- `POST /brochures/:id/versions` — multipart:新文件 + note,version_no = max+1,可选 `set_current`(默认设为当前)
- `PATCH /brochures/:id/current` — body `{ version_id }` 切当前
- `DELETE /brochures/:id/versions/:vid` — 删某版本(若删的是当前版,回退到剩余最新版;尽量删磁盘文件)

入参 zod 校验放 `packages/shared/src/schemas/brochures.ts`,响应 snake_case 序列化,分页用 `apps/api/src/lib/pagination.ts`。`routes/index.ts` 注册 `registerBrochureRoutes`。

## 5. 前端(`apps/web/src/pages/brochure/`)

- `apps/web/src/api/brochures.ts` — JSON CRUD 用 `api()`,上传用 FormData(照 `api/epPriceFiles.ts`)。
- `BrochurePage.tsx` — 主页,左树 + 右列表(`@tanstack/react-query`)。
- `BrochureShared.tsx` — 模块内共用件:新增/编辑资料 Modal、上传新版本 Modal、版本历史展开、管理行业/类型 Modal、文件预览(PDF iframe / 图片 img / 其它下载)。
- `App.tsx` 加 `<Route path="/brochure" .../>`;`AppShell.tsx` `navItems` 加 `{ to:"/brochure", key:"nav.brochure", perm:"brochure.view" }`;`locales/` 加文案;`routeTitles.ts` 加标题(可选)。

### 界面布局(照 vue-element-admin,左树 + 右列表)

```
┌─ 宣传册(资料库)──────────────────────────────────────────┐
│ ┌─ 行业·分类树(240px)─┐ ┌─ 资料列表 ────────────────────┐ │
│ │ ▸ 全部               │ │ [🔍按名字搜]        [+ 新增资料]│ │
│ │ ▾ 移民               │ │ 名字│类型│当前版本│备注│操作    │ │
│ │    · 报价单          │ │ EP宣传册│宣传册│v3·6/28│…│⋯      │ │
│ │    · 宣传册 ←选中     │ │   └▸ 版本历史 v3(当前) v2 v1     │ │
│ │    · FAQ            │ │        每版:预览/下载/设为当前/删 │ │
│ │ ▾ 教育               │ │ [分页]                          │ │
│ │ [⚙ 管理行业/类型]    │ │                                 │ │
│ └─────────────────────┘ └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- 左树一级=行业,二级=资料类型;点类型→右侧列该(行业+类型),点行业→列该行业全部,「全部」列全部。
- 右侧每行一份资料,显示当前版本(v号+时间);展开「版本历史」列全部版本,每版可预览/下载,manage 用户可「设为当前 / 删除该版」。
- 「+ 新增资料」「⚙ 管理行业/类型」「上传新版本」「编辑/删除」仅 `brochure.manage` 可见;`brochure.view` 只看+下载。
- 行业/资料类型的增删改在左下「⚙ 管理」弹窗内就近完成,不动设置模块。

## 6. 改动文件清单

- `packages/db/src/schema/brochures.ts`(新)+ `schema/index.ts` 导出 → `pnpm generate` 出 `0043_*.sql`
- `packages/shared/src/permissions.ts`(加 2 权限 + 分组)
- `packages/shared/src/schemas/brochures.ts`(新,zod 入参)
- `apps/api/src/routes/brochures.ts`(新)+ `routes/index.ts` 注册;`apps/api/src/lib/files.ts` 或新 helper 加任意类型上传
- `apps/web/src/api/brochures.ts`(新)
- `apps/web/src/pages/brochure/BrochurePage.tsx` + `BrochureShared.tsx`(新)
- `apps/web/src/App.tsx`、`apps/web/src/layout/AppShell.tsx`、`apps/web/src/locales/*`、`apps/web/src/layout/routeTitles.ts`

## 7. 验证

- `pnpm -C packages/db generate` 出迁移,`pnpm -C packages/db migrate` 应用到 businesshub_dev。
- `pnpm -w typecheck` / 各包 build 通过。
- 手动冒烟:新增资料(传文件)→ 列表出现 v1 → 上传新版本 → 当前变 v2、历史可见 v1 → 切当前回 v1 → 下载/预览 → 管理行业/类型增删 → 无 manage 权限只读。

## 8. 决策记录(已确认)

1. 行业:宣传册模块独立行业字典(不复用公司主行业表)。
2. 二级分类:可自定义「资料类型」字典。
3. 文件:任意类型,PDF/图片在线预览。
4. 界面:左树 + 右列表。
5. 版本号:系统自动递增 v1/v2/v3,每版可填变更说明。
6. 行业/类型管理:放本页弹窗,不动设置模块。
7. 菜单名:「宣传册」,路由 `/brochure`。
