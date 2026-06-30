# EP 统计汇总卡片 设计

日期:2026-06-30
分支:`feat/ep-stats-summary`

## 背景

`CaseStatsPanel.tsx`(业务 → EP → 统计 tab)目前只有「按月柱状图 + 某业务类型某年合计」。
需求:在柱状图上方加一排汇总数字 —— 各年办理总数 + 申请结果分布。

## 口径(已与用户确认)

- **状态口径**:按案件「最新提交结果」`latest_result`
  - `approved` → 申请完成
  - `pending`(含**无 submission** 的案件) → 申请中
  - `rejected` → 申请失败
- **时间范围**:
  - 年度卡:2025、2026 等各年**办理总数**(分年,取全部 `available_years`)
  - 状态卡:申请完成/中/失败 = **全部年份合计**(不分年,"两年合计")
- **展示**:柱状图上方一排统计卡片,沿用 vue-element-admin PanelGroup 设计语言

## 后端

扩展现有 `GET /cases/stats`(`apps/api/src/routes/cases.ts`),响应增加 `summary`:

```jsonc
summary: {
  year_totals: [ { year: 2025, count: N }, { year: 2026, count: N } ],
  result_counts: { approved: N, pending: N, rejected: N }
}
```

- `year_totals`:复用现有按年聚合(`effectiveDate = coalesce(signed_at, created_at)`)再加 `count(*)`。
- `result_counts`:取符合 `business_type` + 数据权限(**不限年份**)的全部案件 → 拉 submissions → 每案件取 `createdAt` 最新一条的 result 分桶;**无 submission 计入 pending**。复用现有 `serializeCasesWithLatest` / `ica-stats` 同款 JS 聚合。
- 过滤集与现有 stats 完全一致(不排除子案件),保证年度卡数字 = 柱状图该年合计。

## 前端

`apps/web/src/pages/business/CaseStatsPanel.tsx`:
- `BarChart` 上方加 `SimpleGrid` + `Card` 一排统计卡片。
- 动态按 `available_years` 渲染年度卡 + 三张状态卡(approved/pending/rejected,色 teal/blue/red)。
- 复用现有那次 `getCaseStats({business_type})` 调用的响应(多带 `summary`),不增加请求;切业务类型跟着变。
- 更新 `apps/web/src/api/cases.ts` 的 `CaseStats` 类型 + i18n key(`case.stats.summary_*`)。

## 测试(TDD)

后端 `/cases/stats` 加用例:造 EP 案件 + submissions,断言 `year_totals` 与 `result_counts`(含无 submission → pending)。

## 范围之外

不动柱状图本身;不加 cancelled 桶;不分年统计状态。
