# 全站表格分页 设计文档

- 日期:2026-06-30
- 状态:待实现
- 适用树:`~/project/businessHub-dev`(prod 树 `~/project/businessHub` 绝不直接改)

## 1. 背景与现状

- 全项目约 **46 个列表页面**各自手写 Mantine `<Table>`,清一色「`useQuery` 拉全量 → `map` 渲染」,**没有分页**。
- 只有 `pages/recruitment/RecruitmentShared.tsx` 与 `pages/franchise/TrackingShared.tsx` 做了**前端切片分页**,且 `Pager` / `slicePage` / `pageSize=10` 是两份**复制粘贴重复**代码。
- **后端所有列表接口都不支持分页参数**,直接返回整个数组(`{ cases: [...] }`、`{ clients: [...] }`…)。
- EP 列表实体是 `pages/business/CasesPage.tsx`(EP 与 ICA 共用,`businessType` prop 切换);签约日期列已支持服务端排序;有一列「创建时间」。
- 设计语言铁律:页面/组件统一照 `docs/design-system/element-admin-reference.md`。其 **§3.4 已规定分页规范**并预留组件名 `<TablePagination>`:右对齐、`mt 30`、布局「每页条数 Select + 共 N 条 + 翻页器」、`pageSizes` 默认 `[10,20,30,50]`。

## 2. 目标

1. 后端列表接口支持真分页(`page` / `page_size`,返回 `total`)。
2. 前端建立统一分页组件 `<TablePagination>` + `usePagination` hook,所有列表表格接入。
3. 用户可设置每页条数、可翻页。
4. EP 页面:删除「创建时间」列;签约时间排序保留(已实现)。
5. 全部 46 个表完成迁移。

## 3. 非目标(YAGNI)

- 不重写各表为「配置式 DataTable(columns 配置)」。各表保留自己手写的 `<Table>` 结构(已是 element-admin 风格),仅接入统一分页 —— **轻量路线**,视觉零回归。
- 不做游标分页 / 无限滚动。
- 不动下拉框 / Select 复用列表接口的全量行为(见 §4 兼容点)。
- 不改 prod 树,不在本次顺带做无关重构。

## 4. 后端设计

### 4.1 分页 query 约定

- 在每个列表接口的 query schema 加两个**可选**参数:
  - `page`:`z.coerce.number().int().min(1).optional()`
  - `page_size`:`z.coerce.number().int().min(1).max(100).optional()`(默认 20)
- 抽共享 zod 片段(如 `apps/api/src/lib/pagination.ts` 导出 `paginationQuery` + helper),各 route 的 querySchema `.merge()` 或展开复用。

### 4.2 向后兼容(关键)

- **不传 `page` → 返回全量**(现状行为不变),响应仍是 `{ <名词>: [...] }`。
- **传了 `page` → 分页**:主查询加 `limit/offset`,并**单独 `count` 出总数**,响应在原有名词键基础上加 `total`、`page`、`page_size`,例:`{ cases: [...], total, page, page_size }`。
- 理由:不少列表接口被下拉框 / Select 复用需要全量(如 `listClients` 既是客户表也是 EP 新建案件客户下拉、`listEmployees`、`listFranchiseOrgs/Contacts` 等)。可选分页保证这些调用点零改动。

### 4.3 helper 形态

- 提供 `applyPagination(query, { page, page_size })` 思路:在 Drizzle query builder 上 `.limit().offset()`;`total` 用与过滤条件相同的 `where` 跑一次 `count`。
- 返回结构 `{ rows, total, page, page_size }`,route 再 `serialize` 后拼名词键。

### 4.4 已知后端迁移陷阱(每表实现时核对)

- **`cases`(EP/ICA)**:主查询取行后还会二次查 `caseSubmissions` 做 `latest_result` 聚合。分页要点:`limit/offset` 加在主 `cases` 查询;`total` 用 `cases` + 同 `where` 的 `count`;二次聚合只针对当前页 `caseIds`,逻辑不变。
- **`dataScope=self` 可见性过滤**:`cases` 等接口对 `self` 用户先算 `visibleCaseIds` 再 `inArray` 过滤 —— `count` 与 `limit/offset` 必须都在该过滤之后,否则 total 不准。
- **前端 filter 的列表**:某些表在前端二次 `filter`(如 `CasesPage` ICA 的 `onlyReapply`、各页 `useMemo` 过滤)。后端分页后,前端再 filter 会让「当前页过滤完不足 page_size / 出现空页」。处理策略二选一(按表注明):
  - (a) 该过滤下沉成后端 query 参数(推荐,分页才准);
  - (b) 该表暂用**前端分页**(全量取回 + 前端切片 + `<TablePagination>`),不接后端分页。
  - EP 试点本身 `businessType !== "ica"`,无 `onlyReapply` 问题,不受影响。

## 5. 前端设计

### 5.1 `<TablePagination>` 组件

- 位置:`apps/web/src/components/TablePagination.tsx`。
- 受控 props:`{ total, page, pageSize, onPageChange, onPageSizeChange, pageSizeOptions? }`。
- 默认 `pageSizeOptions = [10, 20, 30, 50]`(照 §3.4),默认 `pageSize = 20`。
- 渲染(照 §3.4):`<Group justify="flex-end" mt={30}>` 内含「共 N 条」文案 + 每页条数 `<Select>` + Mantine `<Pagination total={Math.ceil(total/pageSize)} value page onChange>`。
- `total <= 最小 pageSize` 且只有一页时可不显示翻页器,但每页条数选择器在多页时显示。

### 5.2 `usePagination` hook

- 位置:`apps/web/src/hooks/usePagination.ts`。
- 管理 `page` / `pageSize` state;暴露 `setPage` / `setPageSize`(改 pageSize 时 `page` 归 1)。
- 提供「筛选条件变化时 `page` 归 1」的约定(消费方把筛选值传入或在筛选 onChange 里 `setPage(1)`)。
- 替换并删除 `RecruitmentShared` / `TrackingShared` 里重复的 `Pager` / `slicePage` / 局部 `pageSize`,改用共享件。

### 5.3 接入模式(每表标准三步)

1. api 层 list 函数加可选 `page` / `page_size` 入参,透传 query;返回类型加 `total?`。
2. 页面用 `usePagination`,`useQuery` 的 `queryKey` 与 `queryFn` 带上 `page` / `pageSize`(及现有筛选/排序),`keepPreviousData` 让翻页不闪。
3. `<Table>` 下方加 `<TablePagination total={data.total ?? rows.length} ... />`。

## 6. EP 试点(`pages/business/CasesPage.tsx`)

- 删「创建时间」列:移除表头 `<Table.Th>{t("case.fields.createdAt")}</Table.Th>`、单元格 `formatDateTime(caseItem.created_at)`,相应调整 `colSpan`(ICA 8→7、EP 7→6)。`formatDateTime` 若无其它引用则一并删。
- 签约时间排序:保留现有 `toggleSignedAtSort`。
- 接后端分页:`listCases` 加 `page`/`page_size`;`CasesPage` 用 `usePagination`;接 `<TablePagination>`。
- ICA 的 `onlyReapply` 走 §4.4 策略(试点先只验 EP 路径;ICA 该项在 ICA 迁移时按 (a)/(b) 处理并记录)。
- 验收:在 `dev-bh.youjia.sg/business/ep` 确认无创建时间列、签约可排序、分页可翻页、可改每页条数。

## 7. 迁移清单(46 表,按模块)

> 每张表走 §5.3 三步 + §4 后端可选分页;有前端 filter 的按 §4.4 标注处理。

- **business**:CasesPage(试点)、ClientsPage、GuarantorsPage、TemplatesPage、CaseDetailPage
- **businessFinance**:BusinessListPage、BusinessDetailPage、DealPartiesPage、ExternalPartiesPage
- **documents**:CategoriesPage、ClientLibraryPage、CompanyFilesPage、ContractsPage、DocumentSearchPage
- **education**:AcademyCollectionPage、DiplomaPage、EnglishPage、StudentsPage、TeachersPage、WsqPage
- **finance**:BankAccountsPage、BillingPage、ExternalCommissionPage、LedgerPage、MyCommissionPage、ReceivablesLedgerPage、ReconcilePage、ReportsPage、SalesCommissionPage
- **franchise**:TrackingShared(去重 Pager/slicePage)、ContactPicker
- **hr**:AttendancePage、ClockPointsPage、CompensationPage、EmployeesPage、PayrollPage、PerformancePage、SiteVisitsPage
- **recruitment**:RecruitmentShared(去重 Pager/slicePage)
- **settings**:CollectionItemsPage、CompaniesPage、IndustriesPage、PositionsPage、WorkShiftsPage
- **其它**:DashboardPage、StatementPage、components/ChargeSchedulePanel

> 注:部分「表」是详情页内的子表(CaseDetailPage、BusinessDetailPage、ChargeSchedulePanel、ContactPicker、DocumentSearchPage)或纯展示/已是选择器 —— 迁移时逐个判断是否需要分页:数据天然有限或本就是选择器的,可只接前端分页或跳过,并在 PR 注明跳过原因(不静默跳过)。

## 8. 实现编排(workflow)

1. **基础设施 + EP 试点**:手工实现 §4 helper、§5 组件/hook、§6 EP,本地 typecheck + lint 通过,部署 dev,用户验收。
2. **批量迁移**:验收后用 **workflow** 把剩余表 fan-out:
   - `pipeline`,每张表一个 agent,`isolation: 'worktree'` 隔离并行写;
   - 每个 agent 拿统一迁移模板(§5.3 三步 + §4 后端 + 该表特殊点),改完跑该 app 的 typecheck;
   - 产出结构化结果(改了哪些文件、是否跳过及原因、typecheck 是否过);
   - 汇总后统一合并、整体 typecheck + build,再部署 dev 复验。
   - 并发与一致性:所有 agent 引用同一份「迁移模板」段落,避免改出多种风格。

## 9. 测试 / 验收

- 后端:针对 1~2 个代表接口(cases、clients)写/补单测:不传 page 返回全量、传 page 返回切片 + 正确 total、page_size 上限 100。
- 前端:`<TablePagination>` 基本交互;`usePagination` 改 pageSize 归 1。
- e2e/手测:EP 页面 dev 验收(§6)。
- 全量 typecheck + build 通过。

## 10. 分支 / 部署

- dev 树当前在 `feat/ica-bulk-import`(ICA 工作进行中,可能有并发会话)。本工作开**独立分支** off `master`(如 `feat/table-pagination`),用 git worktree 隔离,避免与 ICA 纠缠。
- 部署 dev、验收流程照常;确认 OK 后再按 `docs/runbooks/deploy-pitfalls.md` 发 prod(本次先只上 dev)。
