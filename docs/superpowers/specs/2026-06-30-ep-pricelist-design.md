# EP 价格表 tab 设计文档

- 日期:2026-06-30
- 状态:待实现
- 分支:`feat/ep-pricelist`(worktree `~/project/bh-ep-pricelist`,基于 master 6befd4a)

## 1. 目标

EP 业务页(`EpSection`)新增第 4 个 tab「价格表」,里面放 3 个固定槽位的 PDF:**价格表 / 单价表 / FAQ**。管理员可在页面上传/替换;所有人可预览。

## 2. UI

- `EpSection.tsx` 加第 4 个 `Tabs.Tab value="pricelist"` →「价格表」,Panel 渲染新组件 `PricelistPanel`。
- `PricelistPanel`:3 个文件卡片(Mantine Card),横向排列(`Group`/`SimpleGrid`),每张对应一个固定槽位:
  - 槽位标题(价格表/单价表/FAQ)+ 文件图标
  - 已上传:更新时间 + `[预览]` `[替换]` 按钮
  - 未上传:「未上传」+ `[上传]` 按钮(仅有 `case.manage` 权限者显示上传/替换)
- 点 `[预览]` → Mantine `Modal`(size lg/xl)内嵌 `<iframe src="/uploads/ep-price/<file>" />`,浏览器原生渲染 PDF。
- 上传用 Mantine `FileButton`(accept `application/pdf`),选中即 POST 上传,成功后 invalidate 查询刷新卡片。
- 遵循 element-admin 设计语言(`docs/design-system/element-admin-reference.md`)。

## 3. 存储

- 新表 `ep_price_files`:
  - `slot`:enum `price_list | unit_price | faq`(唯一,3 行)
  - `filename`:原始文件名(text)
  - `storage_path`:相对 uploads 的路径(text,如 `ep-price/<uuid>.pdf`)
  - `updated_at`:timestamptz
  - `updated_by`:uploader user id(uuid,nullable)
- 物理文件存 `uploads/ep-price/`,经现有 `@fastify/static`(`/uploads/` 前缀,见 `apps/api/src/app.ts`)访问。
- 替换:同 slot 再传 → 覆盖 DB 行 + 写新文件(旧文件可删可留;先简单留着,storage_path 指向新文件)。

## 4. 后端 API

参考 `apps/api/src/routes/documents.ts` 的 multipart 上传写法(同样的 `@fastify/multipart` 机制 + storagePath 落盘)。

- `GET /ep-price-files`(权限 `case.view`)→ `{ files: [{ slot, filename, storage_path, url, updated_at, updated_by }] }`(3 个槽位,未上传的槽位返回 null 占位或不返回,前端按固定 3 槽位渲染)。
- `POST /ep-price-files/:slot`(权限 `case.manage`,multipart)→ 接收一个 PDF 文件:
  - 校验 `slot ∈ {price_list,unit_price,faq}`、mimetype `application/pdf`(或扩展名 .pdf)。
  - 落盘到 `uploads/ep-price/<uuid>.pdf`,upsert `ep_price_files` 该 slot 行(filename/storage_path/updated_at/updated_by)。
  - 返回该 slot 的最新记录。
- 新建路由文件 `apps/api/src/routes/epPriceFiles.ts`,在 server 注册。

## 5. 前端

- `apps/web/src/api/epPriceFiles.ts`:`listEpPriceFiles()`、`uploadEpPriceFile(slot, file)`(FormData multipart)。
- `apps/web/src/pages/business/PricelistPanel.tsx`:卡片列表 + 上传(FileButton)+ 预览 Modal。
- `EpSection.tsx`:加 tab + Panel。
- i18n:`business.tabs.pricelist`、槽位名、按钮文案(zh/en locale)。

## 6. 迁移

- 1 个迁移(drizzle generate)建 `ep_price_files` 表。迁移号接最新 master(注意:并发会话频繁动迁移号,生成后确认号不撞;若撞用更高号)。

## 7. 权限

- 查看/预览:`case.view`。
- 上传/替换:`case.manage`。
- 复用现有权限,不新增权限项。

## 8. 测试 / 验收

- typecheck + build 全绿。
- 手测:EP 页有「价格表」tab;上传 PDF → 卡片显示更新时间;预览弹窗内嵌 PDF;替换覆盖;非 manage 权限看不到上传按钮。

## 9. 边界 / YAGNI

- 只 3 个固定槽位,不做任意增删文件、不做版本历史、不做分类。
- 只支持 PDF。
- 不动 documents 文档库模块。
