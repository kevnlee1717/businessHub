# EP 案件详情页重构 · 设计文档

- 日期：2026-07-17
- 作用范围：**仅 EP 案件**（`business_type === "ep"`）。ICA / DP 案件保持现状，不动。
- 目标文件：`apps/web/src/pages/business/CaseDetailPage.tsx`（现 1925 行）及配套后端。

## 背景

现在 EP 案件详情页顶部导航是「固定按钮（案件信息/子案件/收款计划/增加服务/分成）+ 每个步骤一个按钮（第1步…第8步）」。点某个步骤按钮，下方显示单张 `StepCard`：含 状态下拉、请求审核、文件槽（`caseStepDoc`）、跟进。

用户要把 EP 简化为：
1. 顶部不再一步一个按钮，改成单个 **「步骤」** 按钮；点开在**一页里列出全部步骤**，每步带**步骤说明** + 一个 **check**（勾选即完成）。
2. 新增 **「文件」** 按钮；点开把主内容以**网盘/宣传册那种多列 Finder 目录**方式展示，起始为空，可手动上传（含**整个文件夹上传**）。

## 已确认的取舍（来自用户）

| 项 | 决定 |
|---|---|
| 步骤列表 | **极简**：每步只显示 说明 + check。去掉 状态下拉 / 请求审核 / 文件槽 / 跟进。 |
| 文件视图数据源 | **不复用步骤文件槽**。给案件挂一个**真正的网盘文件夹**，起始为空，手动上传。 |
| check 完成校验 | **忽略**"必需文件未齐不能完成"校验，勾选=直接置完成。 |
| 文件视图样式 | **宣传册多列 Finder**（复用 `DriveColumns`），作用域到案件根文件夹。 |

## 设计

### ① 顶部导航（`SectionNav` / `navItems`）

EP 的 `navItems` 从：
```
[案件信息][子案件][收款计划][增加服务][分成] [第1步][第2步]…[第N步]
```
改为：
```
[案件信息][子案件][收款计划][增加服务][分成] [步骤] [文件]
```

- 删除 `steps.forEach(... push 第n步 ...)` 那段。
- 新增两个固定项：`{ key: "steps", label: "步骤" }`、`{ key: "files", label: "文件" }`。
- 「步骤」按钮上带进度角标（如 `3/8`），颜色沿用整体健康度：只要有步骤处于 problem（被拒/待补材料）→ 红；全 done → 绿；否则蓝。复用现有 `stepTone` 聚合。
- ICA / DP 的 `navItems` 逻辑**保持不变**（仍是每步一个按钮 + `StepCard`）。因此 `navItems` 里用 `isEp` 分支：EP 走新版（steps/files 两个固定项，不再展开每步），非 EP 走旧版。

### ② 「步骤」面板 —— 新组件 `EpStepsPanel`

`effectiveSelected === "steps"`（EP）时渲染。一页竖排列出全部步骤，每步一张精简卡：

- 左：`序号. 步骤名`（双语 `displayName`）
- 说明：`step.description`（无则不显示）
- 右：一个 **check**（Mantine `Checkbox`，尺寸偏大便于点）
  - 已完成（`status === "done"`）→ 勾上、绿色✓、卡片淡绿描边
  - 未完成 → 未勾
- 勾选行为：调用 `updateCaseStep(step.id, { status: "done", force: true })`；取消勾选 → `{ status: "pending" }`。
- **不渲染** 状态下拉 / 请求审核 / 文件槽 / 跟进。
- 权限：仅 `canManageCases` 可勾选；否则 check 只读。

> `force: true` 用于跳过后端"必需文件未齐"校验（见后端改动）。

### ③ 「文件」面板 —— 新组件 `CaseFilesPanel`

`effectiveSelected === "files"`（EP）时渲染。每个案件挂一个网盘文件夹，照抄 MLK（`driveFolderId` + `findOrCreateFolder`）先例。

**后端**
- migration：`cases` 表加 `drive_folder_id uuid null`。
- 懒创建：提供 `POST /cases/:id/files/ensure-root`（或首次拉取时自动 ensure），在网盘里于固定顶层根（如「EP案件」文件夹）下创建 `<客户名> / <案件短id>` 文件夹，写回 `cases.drive_folder_id`。命名冲突用 `findOrCreateFolder` 幂等处理。
- 案件作用域的 drive 端点（**权限用 `case.view` / `case.manage`，不用 brochure.\***，因为案件员工未必有网盘权限），全部限定在该案件子树内：
  - `GET  /cases/:id/files/tree` → 返回案件根**子树**节点（parent_id 相对案件根重基，使案件根的直接子节点 `parent_id = null`，便于直接喂给 `DriveColumns`）。
  - `POST /cases/:id/files/folders`（新建文件夹，parent 必须在子树内）
  - `POST /cases/:id/files/upload`（上传文件，多文件）
  - `POST /cases/:id/files/upload-folder`（**整个文件夹上传**，复用 drive 的相对路径建目录逻辑）
  - `PATCH /cases/:id/files/nodes/:nodeId`（重命名 / 移动，parent 校验在子树内）
  - `PUT   /cases/:id/files/nodes/:nodeId/replace`（替换文件）
  - `DELETE /cases/:id/files/nodes/:nodeId`（删除）
  - 下载 / 预览 URL 复用现有 drive storage 路径。
  - 复用 `drive.ts` 里的底层逻辑（`validateParentFolder`、上传落盘、`buildChildrenMap` 等），只是加"限定在案件子树"的守卫 + 换权限。实现上抽公共函数或在 `cases.ts` 里薄封装。

**前端**
- 复用 `DriveColumns`（纯展示组件）。克隆 `DrivePage` 的编排（440 行）为 `CaseFilesPanel`，把 API 从全局 `drive.ts` 换成新的案件作用域 API（新增 `apps/web/src/api/caseFiles.ts`）。
- 进入面板先 ensure root；root 未建好时显示 loading。
- 起始为空 → 显示"暂无文件，点上传"。
- 工具栏：新建文件夹 / 上传文件 / 上传文件夹 / 重命名 / 删除（沿用网盘工具栏）。回收站可暂不做（超范围）。

### 组件边界

- `EpStepsPanel({ steps, canManageCases })` — 只读 steps + 勾选 mutation，自包含。
- `CaseFilesPanel({ caseId, canManage })` — 自包含，内部管理选中路径 / 上传 / mutation。
- `CaseDetailPage` 只负责：判断 EP、把 steps/files 两个面板接进 `effectiveSelected` 分支。

## 数据兼容 / 迁移

- EP 现有 `caseStepDoc` 文件槽数据**不删**，新 UI 不再展示（用户会在「文件」里手动重传）。
- 现有 EP 案件 `drive_folder_id` 为 null，首次进「文件」时懒创建。
- ICA / DP 不受任何影响。

## 主要改动文件

**后端**
- 新 migration：`cases.drive_folder_id`。
- `apps/api/src/routes/cases.ts`（或新 `caseFiles.ts` 路由）：ensure-root + 案件作用域 drive 端点。
- `updateCaseStep`：支持 `force`（EP 勾选完成跳过必需文件校验）。zod schema `CaseStepUpdateInput` 加可选 `force`。

**前端**
- `apps/web/src/pages/business/CaseDetailPage.tsx`：navItems EP 分支改造，接入两个新面板。
- 新 `apps/web/src/pages/business/EpStepsPanel.tsx`。
- 新 `apps/web/src/pages/business/CaseFilesPanel.tsx`（克隆 DrivePage 编排 + DriveColumns）。
- 新 `apps/web/src/api/caseFiles.ts`。
- i18n：`zh.json` / `en.json` 加 `case.section.steps` / `case.section.files` / 步骤面板 / 文件面板相关键。

## 非目标（YAGNI）

- 不动 ICA / DP。
- 案件文件不做回收站 / 拖拽跨案件移动 / 版本化。
- 不迁移旧步骤文件槽数据到新网盘文件夹。
- 步骤面板不恢复审核流（EP 明确去掉）。

## 待实现时确认的细节

- 顶层"EP案件"根文件夹的落点与命名（放网盘哪一层）。
- 案件文件端点是抽公共 helper 还是在 cases 路由内薄封装（取决于 drive.ts 现有函数可复用程度）。
- `DriveColumns` 是否需要加 `rootId` prop，还是靠后端 parent_id 重基（倾向后端重基，前端零改动）。
