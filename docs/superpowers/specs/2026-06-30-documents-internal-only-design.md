# 文档模块只显示公司内部资料 — 设计文档

日期：2026-06-30
分支：`feat/documents-internal-filter`

## 背景与问题

「文档」模块（`/documents/*`）定位是**公司内部资料库**。但页面上出现了大量 EP / ICA 业务的客户资料（例如 `XXX新加坡酒店.pdf`，标签 `HOTEL`，分类「未分类」）。

调查结论：

- 全站所有文档都存在同一张 `documents` 表（`packages/db/src/schema/documents.ts`），靠 `subject_type` 列区分用途：
  - `general` —— 文档模块「检索页」直接上传的内部文档（默认值）
  - `company` —— 「公司」tab 上传的、挂在某公司下的内部文件
  - `case_step` / `step_review` —— EP / ICA 案件文档
  - `diploma_certificate` / `diploma_media` —— 毕业证书 / 影像
  - `site_visit_*`、`guarantor_id_card`、`employee_avatar` 等 —— 各业务专属
- `documents` 表**没有**软删除列（无 `deleted_at` / `status`），所以**不能用删行来「清掉」**——删 `documents` 行等于删 EP/ICA 客户的真实资料。
- 那批酒店 PDF 本质是 ICA 文档（`subject_type='case_step'`，挂在 ICA 案件步骤与客户上），**没有放错位置**，只是因为列表接口缺过滤而「泄漏」到文档模块。

## 两个泄漏点

| Tab | 接口 | 现状 | 是否泄漏 |
|---|---|---|---|
| 检索 DocumentSearchPage | `GET /documents`（不传 subject_type） | 无 subject_type 约束，整表全捞 | ✅ 会 |
| 客户资料库 ClientLibraryPage | `GET /clients/:id/documents` | 仅按 client_id 过滤 | ✅ 会 |
| 公司 CompanyFilesPage | `GET /documents?subject_type=company` | 硬过滤 company | ❌ 否 |
| 合同 ContractsPage | `GET /contracts` | 查独立 contracts 表 | ❌ 否 |
| 分类 CategoriesPage | `GET /document-categories` | 查分类表 | ❌ 否 |

## 不能踩的坑

`GET /documents` **也被毕业证详情页**使用（`DiplomaPage.tsx`，带 `subject_type='diploma_certificate'` / `'diploma_media'` 加载证书与影像）。毕业证书/影像**唯一**加载途径就是这个接口（`GET /diploma-enrollments/:id` 不返回它们）。因此**绝不能**对 `GET /documents` 做「一刀切只返回 general/company」——否则毕业证证书/影像会全部消失。

EP / ICA / 案件 / 加盟拜访（site_visit）的文件都走各自专属接口（`/cases/:id` 内嵌返回、`/external-parties`、`/site-visits` 等），**不经过**本次要改的两个接口，不受影响。

## 方案

新增共享常量 `INTERNAL_DOCUMENT_SUBJECT_TYPES = ['general', 'company']`，改两处后端查询。**数据零改动**，不删/不移动任何 `documents` 行。

### 1. `GET /documents`（`apps/api/src/routes/documents.ts`，约 76 行起）

```
若请求带了 subject_type → 原样 eq(subjectType, query.subject_type)   // 毕业证、公司tab 照常工作
若请求没带 subject_type → inArray(subjectType, INTERNAL_DOCUMENT_SUBJECT_TYPES)  // 检索页收敛到内部资料
```

检索页（`DocumentSearchPage.tsx`）从不提交 subject_type，因此自动落入白名单分支 → 只剩 general/company。

### 2. `GET /clients/:id/documents`（`apps/api/src/routes/documents.ts`，约 201 行起）

在原有 `eq(documents.clientId, id)` 之外，叠加 `inArray(documents.subjectType, INTERNAL_DOCUMENT_SUBJECT_TYPES)`。客户资料库不再暴露客户的案件/毕业证等业务材料。

### 常量位置

定义在 `apps/api/src/routes/documents.ts` 顶部（或就近的合适位置），导出以便复用。

## 影响

- 检索页：立即只剩 general/company（公司内部资料），EP/ICA/毕业证等不再露面。
- 客户资料库：对多数客户会变空（其资料都在各业务模块里）——符合「每个业务归到自己业务里去」。
- 毕业证详情页、公司 tab、合同、分类、EP/ICA/案件/加盟拜访：**全部不受影响**。
- 数据：EP/ICA/毕业证文件原封不动，在各自业务页照常查看，零丢失。

## 验证

- typecheck / build 通过。
- 后端：
  - `GET /documents` 不带 subject_type → 只返回 general/company。
  - `GET /documents?subject_type=diploma_certificate` → 仍返回毕业证书（回归保护）。
  - `GET /documents?subject_type=company` → 仍返回公司文件。
  - `GET /clients/:id/documents` → 只返回该客户的 general/company 文档。
- 前端冒烟（dev-bh.youjia.sg）：检索页不再出现酒店 PDF；毕业证详情页证书/影像仍在；EP/ICA 案件页文件仍在。
