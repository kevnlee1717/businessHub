# 财务系统 · 第 3 层模块 ⑦ 设计(总数据面板 + 现金流 + KPI 反推)

> 业主要的「一眼看清」capstone,汇总 ①(业务/方案/每单利润)③(学院收款)④(收支流水/对公账户)+ 薪酬,回答:
> - 各公司/业务**健康度**(本月盈亏、是否落后、是否紧张),按今天是月内第几天。
> - 各公司**接下来要付多少钱**(房租/宽带/CPF/工资的付款时间)、**我们还有多少钱**(现金状况)。
> - 还有多少**应收款要追**。
> - **现金流预测 / what-if**:再进几个单对现金流的缓解。
> - **KPI 反推**:不亏损为底线 → 每业务要做几单 / 招几人。

本模块以**读取聚合为主**,仅新增 1 张配置表 + 给 bank_accounts 加期初余额(为算"还有多少钱")。

---

## 0. 数据来源(已存在)

- 现金流入:`ledger_entries`(direction=in)+ `payments`/`diploma_payments`(已收)。
- 现金流出:`ledger_entries`(direction=out)+ `company_expenses`。
- 应收:`diploma_payments`(paid=false)+ `billing`(status unpaid/partial,应收=total−已收)。
- 固定成本/发薪:`payslips`(period/payday/net_pay/cpf/status,draft=待发)+ 薪酬(compensation)+ **新 `recurring_costs`**(房租/宽带等周期固定支出 + 付款日)。
- 每单/每业务利润:模块① 引擎(`scheme_versions` + `deal_line_amounts`)。
- 学院缺口:模块③a `/academy/health`。

---

## 1. 新增数据(migration `0014`)

### 1.1 `recurring_costs`(周期固定支出 + 付款日,驱动付款日历)
```
recurring_costs {
  id uuid PK
  company_id uuid → companies NOT NULL cascade
  expense_category_id uuid → expense_categories (可空)
  label text NOT NULL              # 如「办公室房租」「公司宽带」
  amount numeric(12,2) NOT NULL
  currency currency default 'SGD'
  due_day integer NOT NULL         # 每月几号付(1–28)
  active boolean default true
  note text
  created_at timestamptz default now()
}
```
> 工资/CPF**不**进 recurring_costs(从 payslips 动态算,金额随月浮动);recurring_costs 只放房租/宽带/固定服务费这类**固定额**。

### 1.2 `bank_accounts` 加期初余额(算"还有多少钱")
```
ALTER bank_accounts ADD opening_balance numeric(12,2) NOT NULL default 0;
ALTER bank_accounts ADD opening_date date;   # 期初日期(此后用 ledger 累加)
```
当前现金估算 = Σ各账户(opening_balance + 自 opening_date 起 ledger_entries 的 in−out sgd)。

---

## 2. 计算口径(纯聚合,放 api `dashboardUtils.ts`;period 默认当月 SGT)

- **现金状况(per 公司 / 全局)**:cash = Σ账户期初 + ledger 净(in−out)。
- **本月固定成本(per 公司)**:recurring_costs(active,本月)合计 + 本月 payslips(net_pay,或 gross+cpf_employer 看口径,取 **net_pay + cpf_employer** 作"公司实际掏的钱")合计。
- **本月收入(per 公司/业务)**:已收(ledger in 本月)+ 本月应收未收(学院 diploma_payments 本月 + billing 本月相关)。给「已收 / 预期」两个数。
- **本月盈亏估(per 公司)**:本月收入(预期)− 本月固定成本 − 本月其它 ledger out。→ 健康度:盈利(>0)/打平(≈0)/亏损(<0);"紧张" = 现金 < 未来 30 天应付。
- **付款日历(per 公司,本月剩余)**:把 recurring_costs(due_day≥今天)+ 未发 payslips(payday≥今天,金额=net_pay)排成按日期的待付清单;给"本月还要付 X"。
- **应收款**:diploma_payments 未交(欠款,模块③ 口径)+ billing 未收。给总额 + 明细入口。
- **月度进度/是否落后**:今天是月内第 D 天、共 T 天 → 时间进度 D/T;对照"本月已收/本月目标"。目标 = 本月应收(学院)或业务 KPI(见下)。已收进度 < 时间进度 → 落后(红)。
- **KPI 反推(per 公司/业务)**:
  - 公司层:breakeven_revenue = 本月固定成本;还需收入 = max(0, breakeven − 已收/预期)。
  - 业务层:用①引擎该业务**默认版本每单利润**(deal_line_amounts/版本 profit)→ 保本所需单数 = ceil(分摊到该业务的固定成本 / 每单利润);学院走③a 缺口(每生月净利)。固定成本分摊:简单按"公司固定成本 ÷ 公司业务数"或全部归一(给个可解释的近似 + 标注)。
- **现金流 what-if**:输入「再进 N 个某业务的单」→ 用该业务每单利润 × N 加到现金/盈亏,显示缓解后的现金与健康度。

---

## 3. API(新 `routes/dashboard.ts`,权限 `finance.view`;注册 index)

- `GET /dashboard/overview?period=YYYY-MM`:全局 + 每公司汇总卡:`{ as_of_day, days_in_month, time_progress, global:{cash, expected_income, fixed_cost, projected_pl, receivable_total}, companies:[{company_id,name,cash,expected_income,collected_income,fixed_cost,projected_pl,health,upcoming_payments_total,receivable_total,income_progress,behind:boolean}] }`。
- `GET /dashboard/payment-calendar?company_id=&period=`:本月待付清单(recurring_costs + 未发 payslips),按日期排序 `[{date,due_day,type:'recurring'|'payroll',label,amount,currency}]` + 合计 + "今天起还要付"。
- `GET /dashboard/receivables?company_id=`:应收明细(学院欠款 + billing 未收)+ 总额。
- `GET /dashboard/kpi?period=&company_id=`:每公司/每业务保本目标 vs 当前:`[{scope:'company'|'business', id, name, fixed_cost_share, per_unit_profit?, breakeven_units?, current_units?, gap_units?, breakeven_students?, gap_students?, note}]`。
- `POST /dashboard/whatif`:body `{company_id, items:[{business_id, count}]}` → 返回新增利润合计、对现金/本月盈亏的改善后数值。
- `routes/recurringCosts.ts`:`GET/POST/PATCH/DELETE /recurring-costs?company_id=`(finance.manage)。
- `bank_accounts` PATCH 增加 opening_balance/opening_date 字段支持。

---

## 4. 前端(改造 `apps/web/src/pages/DashboardPage.tsx` 为财务总面板;首页)

- **顶部全局条**:今天 D/T(月进度条)、全局现金、全局本月预计盈亏、全局应收。
- **公司卡片网格**:每公司一张卡 —— 现金、本月已收/预期、固定成本、预计盈亏(盈绿亏红)、健康徽章(盈利/打平/亏损/紧张)、月进度 vs 时间进度(落后标红)、本月还要付 X、应收 X。点卡进详情。
- **付款日历**(选公司或全局):本月剩余待付时间线(房租/宽带 recurring + 工资 payslip),每条日期+金额,合计。
- **应收追款**:欠款/未收明细表(可跳模块③学院收款 / 收款页)。
- **KPI 反推卡**:每公司/业务"保本还需 N 单 / 招 N 人",对照当前完成,落后高亮。
- **现金流 what-if**:选业务 + 输入单数 → 实时显示"现金从 A→B、本月盈亏从 X→Y"。
- 数据稀疏(多为 DEMO)时每块友好显示"暂无数据/需录入"。i18n 中英。

---

## 5. 迁移/seed

- migration `0014`:recurring_costs 表 + bank_accounts 两列。
- seed(幂等,DEMO):给恺德学校建 2 条 recurring_costs(房租 due_day 5 / 宽带 due_day 10,标 DEMO)、给两公司 bank_accounts 填 opening_balance(如恺德 20000、JUYI 30000,opening_date 本月 1 号)。

---

## 6. 验收

- `pnpm -r typecheck` 全绿;web build 过;migration 0014 本地 migrate 成功。
- HTTP:`/dashboard/overview` 返回恺德卡(现金=期初20000−4500=15500、固定成本含房租+宽带、应收含学院欠款、健康徽章合理);`/payment-calendar` 列出本月房租/宽带待付;`/dashboard/whatif` 加单后现金/盈亏正确变化;`/dashboard/kpi` 学院缺口与③a 一致。

## 7. 不在本模块(后续/需业主)

- 真实银行余额对接(先用期初+流水估算)
- 多币种本位币统一(继续 SGD 估算)
- ⑤ 提成账本 / ⑥ 新加坡报表导出(独立模块)
- 自动催缴/提醒推送
