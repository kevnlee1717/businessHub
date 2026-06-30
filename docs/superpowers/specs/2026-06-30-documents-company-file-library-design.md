# 设计:`/documents` 改造为公司内部文件库 + 录入 `~/cf`

日期:2026-06-30
状态:已与用户对齐(待实现)

## 背景与目标

`~/cf` 目录是公司**内部文件**真实归档(办公室租金、工资、各类合同发票、证明模板、收费标准、学院租约),75 个文件 / 34M(34 pdf、25 图片、10 docx、4 个飞书 `.url` 链接、2 个 `.DS_Store`)。

把这批文件录入 `https://dev-bh.youjia.sg/documents/`,并把 `/documents` 页面的 tab 按 `~/cf` 目录结构重新组织。整个模块定位为「公司内部文件库」,**不混入各业务/客户文件**。

现状:`/documents` 现有 5 tab —— 检索 / 客户资料库 / 公司文件 / 合同 / 分类。其中「公司文件」实为**按公司主体下拉的开支台账**(金额/币种/账期 + 附件),与目标不符。

## 用户已拍板的决策

1. **Tab 组织 = 主题归并**:把 cf 顶层目录按主题合并成 6 个干净 tab,保留 `检索`、`分类`。
2. **砍掉开支台账**:新页面纯文件库(浏览/上传/预览/下载),不再有金额录入。
3. 工资证明归到「工资」tab;空目录(Cecilia/程程工资、租房合同、私校)不显示。
4. 旧版本合同保留在 `…/旧/` 子文件夹(可见但归档)。
5. `.url` 飞书链接文件也一并导入。

## Tab 结构(最终 8 个)

```
检索 | 办公室&租金 | 工资 | 合同&发票 | 证明&模板 | 收费标准 | 学院 | 分类
```

移除旧 tab/route:`客户资料库(client-library)`、`公司文件(company)`、`合同(contracts)`。
保留:`检索(search)`、`分类(categories)`。

## 每个内容 tab 的版式(6 个 tab 复用同一组件 `FolderLibraryPage`)

- 左侧:子文件夹列表(由该 section 下文件的 `folder_path` 派生),含「全部」。
- 右侧:文件表格 —— 文件名 / 子文件夹 / 上传时间 / 操作(预览·下载)。
- 右上角:「上传」按钮 —— 选已有子文件夹或新建,落 `subject_type=company` + `folder_path`。
- 分页复用 `TablePagination` + `usePagination`。
- 视觉照 vue-element-admin 设计语言(参考 `docs/design-system/`),与宣传册模块「左树右列表」一致。

## cf → tab 归类映射

`folder_path` 形如 `<中文 section>/<子文件夹>/…`,首段即 tab。

| Tab (section) | 收录 cf 目录 | 子文件夹(folder_path 第二段) |
|---|---|---|
| 办公室&租金 | `02-开支/01-办公室/101 办公室`、`02-开支/01-办公室/ Penisula大楼`、`新加坡办公室租金` | `101办公室` / `Penisula大楼` / `月度租金` |
| 工资 | `02-开支/02-骊骊姐工资`、`骊骊姐工资`(月度)、`05-各类证明文件/丽丽姐工资证明.pdf` | `骊骊姐` / `骊骊姐月度` / `工资证明` |
| 合同&发票 | `03-各类合同&发票/*`(EP、生意加盟、生意转让、独家授权、教培) | `EP` / `生意加盟` / `生意转让` / `独家授权` / `教培` |
| 证明&模板 | `05-各类证明文件/`(Employment Letter、Employment Letter sample、OCBC开户模板) | (平铺) |
| 收费标准 | `04-各类设计图/`(政府学校收费标准、铭智报名费) | (平铺) |
| 学院 | `B01-学院`、`02-开支/03-恺德学院` | `租约` / `恺德学院开支` |

约定:
- 同人异名「骊骊姐 / 丽丽姐」统一为 `骊骊姐`。
- 旧版本文件(cf 里 `旧/` 子目录)保留为 `…/旧/…`。
- 空目录(Cecilia/程程工资、租房合同、私校)无文件,不导入、不显示。

## 去重

`~/cf` 内有 3 对 sha256 内容重复(导入按 hash 去重,各保留 1 份):
- `24-05B PENINSULA PLZ 10 JAN - 9 FEB 2026.pdf`(`02-开支/Penisula大楼/202601` ↔ `新加坡办公室租金/202601`)
- 微信图片 `…20260115172610…`(同上两处)
- 骊骊姐工资图(`202412-202506` ↔ `202506`)

非 DS_Store 文件 73 个 − 3 个重复副本 = **导入约 70 个**。

## 数据模型

复用 `documents` 表(已被 `subject_type ∈ {general, company}` 白名单收敛为公司内部资料)。

- **迁移 0044**(实现时核对最新号,防并发会话撞号):`documents` 加 `folder_path text`(可空)。
- 文件库记录:`subject_type='company'`,`subject_id=null`,`folder_path='<section>/<子文件夹>/…'`。
- 不动 `documentCategories`(分类 tab 照旧)。

## 后端改动 `apps/api/src/routes/documents.ts`

- `serializeDocument` 增加 `folder_path`。
- `documentQuerySchema` 增加 `folder_prefix`(可选),过滤 `folder_path LIKE '<prefix>%'`(prefix 做 `%`/`_` 转义)。
- `uploadFieldsSchema` + POST `/documents` 接收并保存 `folder_path`。
- `saveUpload`(`apps/api/src/lib/files.ts`)`SaveUploadOptions` 增加 `folderPath`,写库带上。

## 前端改动

- `DocumentsLayout.tsx`:`tabs` 改为 8 项(search + 6 section + categories)。
- `App.tsx`:documents 子路由改为 search / office-rent / salary / contracts / certificates / fees / academy / categories;`index` 仍重定向 search;删 client-library/company/contracts 三个旧 route 与 import。
- 新组件 `FolderLibraryPage.tsx`,入参 `section`(key + folder_path 前缀 + label);6 个 section 各包一层薄壳页面或直接传 props。
- `api/dms.ts`:`searchDocuments` 支持 `folder_prefix`;上传函数支持 `folder_path`。
- 删除 `CompanyFilesPage.tsx` / `ContractsPage.tsx` / `ClientLibraryPage.tsx` 的路由引用(文件可留待清理或删)。
- i18n:`zh.json`/`en.json` 的 `documents.tabs` 改为新 8 项;新增 `documents.library.*`(上传/子文件夹/空态等)。

## 录入脚本 `apps/api/src/scripts/importCompanyFiles.ts`

- 遍历 `~/cf`,跳过 `.DS_Store`。
- 按上表映射 cf 路径 → `(section, folder_path)`。
- sha256 去重(内存 set),重复跳过并打日志。
- 复制文件进 `uploads/2026/06/<uuid><ext>`(沿用 `saveUpload` 落盘约定),插入 `documents` 行(`subject_type='company'`、`folder_path`、`filename` 用原始中文名、`mime` 按扩展名推断、`size` 实测、`uploaded_by=null`)。
- 幂等:重跑前可按 `subject_type='company' AND folder_path IS NOT NULL` 清理后重导(脚本带 `--reset` 开关)。
- 仅在 dev 跑;发 prod 时对 prod 库另跑一次(参考 ica-guarantor 经验)。

## 验收

1. dev 库迁移 0044 + 跑脚本 → `select count(*) ... where subject_type='company' and folder_path is not null` ≈ 70。
2. `pnpm build`(web+api typecheck)通过。
3. 部署 dev-bh,逐 tab 冒烟:6 个 section 都能看到对应文件、子文件夹分组正确、预览/下载可用、上传可用、检索 tab 能搜到。
4. 旧 3 tab 不再出现;分类 tab 不受影响。

## 不在本次范围

- 不发 prod(确认 dev OK 后单独走 `docs/runbooks/deploy-pitfalls.md`)。
- 不动 `documentCategories`、不动各业务页自己的文档查看。
- 不删 `CompanyExpense` 相关后端表/接口(仅前端不再用);如需彻底退役另立任务。
