# 宣传册 → 网盘模式改造 设计文档

- 日期:2026-07-12
- 范围:仅 dev(`~/project/businessHub-dev`)开发验证;验证后按发布流程上 prod
- 状态:已与用户确认设计,待写实现计划

## 1. 目标

把现有「宣传册」资料库(两层扁平分类 `行业 × 分类` + 每份资料带版本历史)改造成 **macOS Finder 列表模式的网盘**:

- **无限层级文件夹**,彻底取代「行业 / 分类」
- 文件夹和文件都能**自由改名**
- 上传**保留原始文件名**
- 文件/文件夹可**移动**,支持**拖拽**
- **去掉版本概念**:有新版本直接**替换**(覆盖),不留历史
- 高自由度,契合 vue-element-admin / Mantine 设计语言

## 2. 关键决策(已确认)

| 议题 | 结论 |
|---|---|
| 文件夹结构 | 完全自由无限层级(邻接表) |
| 版本历史 | 去版本化:当前版本变成文件,旧版本丢弃 |
| 权限 | 沿用现有两级 `brochure.view`(只读)/ `brochure.manage`(改结构) |
| 前端底座 | **react-arborist**(headless 虚拟树表,内置拖拽/就地改名/多选/展开折叠;行用 Mantine 画) |
| 迁移命名 | **文件节点名 = 当前版本的原始上传文件名**(含扩展名) |

## 3. 数据模型

新增一张统一表 `drive_nodes`(邻接表,folder 与 file 同表):

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `parent_id` | uuid null | → `drive_nodes.id` `onDelete: cascade`;`null` = 根 |
| `kind` | text | `'folder'` \| `'file'` |
| `name` | text not null | 显示名,可改名;文件上传时 = 原始文件名(含扩展名) |
| `storage_path` | text null | 仅文件:复用 `uploads/brochure/<uuid>.<ext>`(沿用现有目录 `brochure`) |
| `mime` | text null | 仅文件 |
| `size` | integer null | 仅文件 |
| `sort_order` | integer not null default 0 | 预留手动排序;首版按 kind(文件夹在前)+ name 排 |
| `created_by` | uuid null | → `employees.id` `onDelete: set null` |
| `created_at` | timestamptz not null default now | |
| `updated_at` | timestamptz not null default now | 替换文件时更新 |

索引:`(parent_id)`。**不做**同名唯一约束(允许同名,更自由;UI 可提示)。

约束逻辑(后端强制,非 DB 层):
- `parent_id` 必须指向一个 `kind='folder'` 的节点(或 null)。
- **移动防环**:移动文件夹时,目标不能是它自己或其子孙(后端向上遍历 target 的祖先链校验)。
- 文件的 `storage_path/mime/size` 非空;文件夹这三列为 null。

## 4. 后端 API

新 `/drive/*` 路由(新文件 `apps/api/src/routes/drive.ts`),权限沿用 `brochure.view` / `brochure.manage`。存储沿用 `saveFile` 那套(`uploads/brochure/<uuid>.<ext>`,300MB 上限)。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/drive/tree` | view | 返回全部节点扁平数组,前端建树(arborist 虚拟化扛量) |
| POST | `/drive/folders` | manage | `{parent_id, name}` 新建文件夹 |
| POST | `/drive/files` | manage | multipart,`{parent_id}` + 一个或多个文件,`name`=原始文件名 |
| PATCH | `/drive/nodes/:id` | manage | `{name?, parent_id?, sort_order?}` 改名 / 移动 / 排序(校验目标为文件夹、无环) |
| POST | `/drive/nodes/:id/replace` | manage | multipart,覆盖该文件节点(传新版本),删旧磁盘文件 |
| DELETE | `/drive/nodes/:id` | manage | 删节点;文件夹级联删子孙,所有文件同时删磁盘 |
| GET | `/drive/nodes/:id/download` | view | 带 `Content-Disposition: attachment; filename="<name>"` 下载(保证原始文件名) |

- 预览:内联预览仍走现有 `/uploads/<storage_path>` 静态服务(复用 `FilePreviewModal`)。
- 删除文件夹时,后端需先收集所有子孙文件的 `storage_path` 再 unlink 磁盘(级联删 DB 行由 FK 处理,但磁盘文件要手动清)。

Zod schemas 放 `packages/shared/src/schemas/`(新 `drive.ts`)。

## 5. 前端

新页面 `apps/web/src/pages/documents/DrivePage.tsx`(取代 `BrochurePage`;路由/菜单指向 Drive)。建议拆分:

- `DrivePage.tsx` — 页面骨架、数据查询(`GET /drive/tree`)、工具栏、状态
- `DriveTree.tsx` — react-arborist 封装 + Mantine 行渲染器
- `DriveRow.tsx` — 单行(图标 / 名字 inline edit / 大小 / 修改时间)
- `driveContextMenu.tsx` — 右键菜单(Mantine Menu)
- `useDriveUpload.ts` — 上传/替换 hook

交互:
- **列表模式**:react-arborist 缩进可展开行 + 列(名字 / 大小 / 修改时间),按 mime 显示图标
- **拖拽移动**:`onMove` → `PATCH parent_id`(乐观更新 + 失败回滚)
- **就地改名**:F2 / 双击 → `onRename` → `PATCH name`
- **多选**:arborist 内置(shift/ctrl)
- **右键菜单**:重命名 / 删除 / 传新版本(替换)/ 下载 / 新建子文件夹
- **上传**:工具栏按钮或把文件拖进某文件夹行 → multipart(多文件),`name`=`file.name`
- **点文件** → 复用现有预览弹窗;下载走 `/drive/nodes/:id/download`
- **权限**:`view` 只读(隐藏工具栏动作、禁用拖拽/改名/右键写操作);`manage` 全开

设计语言:先读 `docs/design-system/element-admin-reference.md` 选骨架与组件映射,Mantine 落地。

## 6. 迁移

一次性转换脚本(先 dev,prod 复用),把 4 张 brochure 表 → `drive_nodes`:

1. 每个行业(7) → 顶层文件夹节点(`parent_id=null`,`name`=行业名)。
2. 分类是全局的,但资料带(行业, 分类)。按**实际存在的(行业, 分类)组合**在对应行业文件夹下建分类子文件夹。
3. 每份宣传册(24) → 文件节点:
   - `parent_id` = 解析出的文件夹(行业/分类;缺分类则直接放行业文件夹下)
   - `name` = **当前版本的原始文件名 `brochure_versions.filename`**(决策 B)
   - `storage_path/mime/size` = 当前版本的值
   - 旧版本(非当前)不迁移 → 丢弃
4. 无行业且无分类的资料 → 根下「未分类」文件夹。
5. `created_by` 置 null(迁移不追员工)。
6. **旧 brochure 表(industries/categories/brochures/versions)暂不删**,作 dev 验证期安全网;验证 OK 后单独退役。

建表用 drizzle schema(`packages/db/src/schema/driveNodes.ts`)+ 生成 migration。**数据转换是独立脚本**(不走 drizzle migrate,避免 prod 迁移追踪错位坑)。

## 7. 发布到 prod(验证后)

1. 建 `drive_nodes` 表:手动 apply DDL 到 prod 库(单事务),沿用既有"手动 DDL"模式(prod drizzle journal 已错位,不跑 `db:migrate`)。
2. 对 **prod 自己的** brochure 数据跑同一转换脚本(不推 dev 数据)。
3. 附件已在 prod(本就是 prod 数据);无需 rsync。
4. cherry-pick 代码进 prod 树、build、`sudo systemctl restart bh-prod`。
5. 切页面到 Drive。旧 brochure 表/路由留一段观察期再退役。

## 8. 非目标(YAGNI)

- 不做版本历史(明确去掉)
- 首版不做网格/图标视图、分栏视图(列表模式够用;要再降 dnd-kit)
- 不做文件夹级独立权限(沿用全局 view/manage)
- 不做同名唯一约束、回收站、分享链接(后续按需)

## 9. 受影响文件(预估)

- 新增:`packages/db/src/schema/driveNodes.ts`、`packages/shared/src/schemas/drive.ts`、`apps/api/src/routes/drive.ts`、`apps/web/src/pages/documents/Drive*.tsx`、迁移脚本
- 修改:路由注册 `apps/api/src/routes/index.ts`、前端路由/菜单、i18n `locales/*.json`、`package.json` 加 `react-arborist`
- 保留(暂不动):`brochures.ts` 路由与表、`BrochurePage.tsx`(退役期后删)
