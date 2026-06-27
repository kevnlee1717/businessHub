# 财务系统 · 第 2 层模块 ③a 设计(学院月度收款面板:进度 / 欠款名单 / 统计)

> 第 2 层模块 ③ 的第一块。业主明确两次要求:学院按月收学费,要看**当月收款进度**、**哪些学生没交(欠款名单)**、统计好,还要能看**招生缺口**(要招多少 / 还差几个)。
> 落在已有数据脊柱 `diploma_payments`(报名时按月自动生成,每月一行 period/amount/paid/paid_at)。本模块**只做读取聚合 + 面板 + 标记已交**,不改大专报名/作业等既有逻辑。
> ③b(scheme 驱动的通用期数台账 `billing_periods`)目前无对应成交单(按摩椅/床垫/保安尚未有真实成交),按 YAGNI **本轮不做**,待有真实周期性成交时再起。

---

## 0. 现状(已核实)

- `diploma_enrollments`:student_id、course、start_period、installments_count(分期数)、deposit_amount/deposit_paid_at、graduated、billing_id。
- `diploma_payments`:enrollment_id、period(YYYY-MM)、amount、paid、paid_at、note;UNIQUE(enrollment_id, period)。报名时按 startPeriod + 月序自动建。
- 已有端点:`GET /diploma-enrollments`、`GET /diploma-enrollments/:id`(含 payments)、`PATCH /diploma-payments/:id`(标记 paid,会写 paid_at)。
- `company_expenses`:公司每月固定成本(rent/utility/other,period)。学院 = 恺德学校公司。
- **当前 0 学生 / 0 报名 / 0 学费期数** → 本模块需先 seed 演示数据才能验证(见 §5)。

---

## 1. 范围

1. **当月收款进度**:选定月份(默认当月),聚合该月所有应交学费期数:应收合计 / 已收合计 / 未收合计 / 收款率%,以及笔数(应交 N 笔、已交 M 笔)。
2. **欠款名单**:列出**未交**的期数(当月,或截至当月所有逾期未交),每条带:学生名、program、期数、应交额、逾期月数、报名日期、联系方式。可一键标记已交(复用 `PATCH /diploma-payments/:id`)。
3. **月度统计**:近 N 个月每月「应收 vs 已收」趋势(给个简单柱/表)。
4. **招生缺口(雏形)**:学院当月固定成本(恺德学校 company_expenses 当月合计)对比当月已收/应收学费;给出「本月学费应收是否覆盖固定成本」+「按当前每生月学费,保本还需多少学生 / 现有在读学生数 / 缺口」。
   > 完整 KPI 反推在 ⑦;这里用手边数据给个雏形健康指示,公式见 §3.3,不引入新表。

---

## 2. 数据口径(纯读聚合,不新增表)

- **"在读学生 / 在读报名"**:`diploma_enrollments WHERE graduated = false`。
- **某月应交期数**:`diploma_payments WHERE period = :period`(关联 enrollment→student)。
- **逾期未交**:`diploma_payments WHERE paid = false AND period <= :currentPeriod`(period 是 'YYYY-MM' 文本,可直接字符串比较,因零填充)。
- **当月固定成本**:`company_expenses WHERE company_id = 恺德学校 AND period = :period` 之 amount 合计(SGD;RMB 行按现状先原值相加并标注,汇率换算属后续层)。

---

## 3. API(新路由 `apps/api/src/routes/academyFinance.ts`,权限 `education.view` 读 / `education.manage` 写;注册进 index)

### 3.1 `GET /academy/collection?period=YYYY-MM`(缺省=当月,SGT)
返回:
```
{
  period,
  summary: { expected_total, collected_total, outstanding_total, collection_rate,  // rate=已收/应收
             due_count, paid_count, unpaid_count },
  rows: [ { payment_id, enrollment_id, student_id, student_name, program, amount,
            paid, paid_at, period } ... ]   // 该月所有期数
}
```

### 3.2 `GET /academy/overdue`(截至当月所有未交,欠款名单)
返回 `{ as_of_period, total_outstanding, rows: [ { payment_id, student_name, program, period, amount, overdue_months, enroll_date, phone } ... ] }`,按逾期月数降序。

### 3.3 `GET /academy/health?period=YYYY-MM`(招生缺口雏形)
```
{
  period,
  active_students,                       // graduated=false 的在读学生数
  monthly_fixed_cost,                    // 恺德学校当月 company_expenses 合计
  expected_tuition, collected_tuition,   // 当月应收/已收学费
  avg_monthly_tuition_per_student,       // = expected_tuition / 当月有期数的在读学生数(无则用各报名月学费均值)
  breakeven_students,                    // = ceil(monthly_fixed_cost / avg_monthly_tuition_per_student)
  gap                                    // = max(0, breakeven_students - active_students)
}
```
> 除零防御:avg=0 时 breakeven/gap 返回 null + reason。

### 3.4 复用 `PATCH /diploma-payments/:id`(标记已交)—— 不新增。

---

## 4. 前端(`apps/web/src/pages/education/` 下新增 `AcademyCollectionPage.tsx`,挂到教育导航或财务导航一个新 tab「学院收款」)

- 顶部:月份选择器(默认当月)+ **收款进度卡片**(应收/已收/未收大数字 + 收款率进度条)+ 健康指示(固定成本覆盖?缺口 N 人,红/绿)。
- **欠款名单表**(默认展示截至当月逾期未交):学生 / program / 期数 / 应交 / 逾期月数 / 电话 / 「标记已交」按钮。
- **当月期数表**(切换):该月全部期数 paid/unpaid。
- **月度趋势**:近 6 月应收 vs 已收(简单表或 Mantine 进度条列)。
- i18n 中英。react-query + `api` helper,沿用现有 education 页面风格。

导航:在 `AppShell` 教育父项下加子项「学院收款」(`/education/academy-collection`),或财务区。**选教育区**(数据属教育,看的人是校长/会计)。

---

## 5. 演示数据(seed,带 DEMO 标记,业主可删)

因当前无学院数据,加一段**幂等**演示 seed(独立函数,日志标 DEMO;可通过 env `SEED_DEMO=1` 开关,默认开一次后幂等跳过):
- 3~4 个学生 name 前缀「[DEMO] 张三」等;各建 1 个成人大专报名(start_period 设成往前 1~3 个月,installments 6),自动生成月度 diploma_payments;把其中**部分期数标记已交、部分留欠款**,制造可见的"收款进度 + 欠款名单"。
- 给恺德学校建当月一条 rent company_expenses(如 SGD 4000)作固定成本演示。
- 幂等:按学生名 DEMO 前缀判断是否已 seed。

> 这些仅为验证面板;业主真实录入学生后即看真实数据。seed 输出明确标注 DEMO 数量。

---

## 6. 验收

- `pnpm -r typecheck` 全绿;`pnpm --filter @bh/web build` 过。
- 跑演示 seed 后,`GET /academy/collection`、`/overdue`、`/health` 真实 HTTP 返回正确聚合(手工核对一个月的应收=各在读报名该月 amount 之和、已收=paid 的和、缺口=ceil(成本/人均)−在读)。
- 前端面板能看到进度条、欠款名单、标记已交后数字实时刷新。

## 7. 不在本模块(后续)

- `billing_periods` 通用期数台账(③b,待有 scheme 周期性成交)
- 完整 KPI 反推 / 总现金流面板(⑦);强制凭证 / 对公对账(④);RMB 汇率换算口径统一(④/⑥)
- 自动催缴通知 / 学生自助端(YAGNI)
