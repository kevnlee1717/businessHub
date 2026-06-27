# 财务系统 · 模块⑤ 设计(销售提成台账:跨业务分配 + 底薪 + 每单/每月提成 → 汇入工资条)

> 业主需求:销售先分配到一个公司;销售可跨几个业务;是否有基本工资;每业务/每单提成可能不一样;按每单一次性提成,有时每月提成。最后**汇总进工资条**。
> 这是 5 大场景里最后一块。原则:文员录入简单(建单时销售+提成已由方案/单据带出),输出专业(提成台账 + 工资条自动汇总)。占位数字先行,业主后填真实。

---

## 0. 现状(已核实)

- 销售 = `employees.role='sales'`,已有 `company_id`(=分配到公司)。`employee_compensation.base_salary`(=底薪,已存在,可空)。
- `billing.sales_id`(单个销售)+ `commission_type/value`;**`deal_line_amounts` 已有 commission 行**(kind=commission, party=sales, recurrence one_time/monthly, amount_per_period, periods_count)——提成额**已算出**。
- `payslips.commission_total` 现按**旧口径**:Σ `billing.commissionAmountSgd`(sales_id=本人 且 billing 建单月=period)。粗糙:无每月提成、无跨业务、无台账、不与 deal_line_amounts 对齐。
- **缺**:① 销售↔业务分配(跨业务 + 每业务提成不同);② 提成台账(离散应发记录,区分一次性/每月);③ 工资条按台账汇总(替换旧口径)。

---

## 1. 数据模型(migration `0016`)

### 1.1 `sales_business_assignments`(销售↔业务,跨业务 + 每业务提成覆盖)
```
sales_business_assignments {
  id uuid PK
  sales_id uuid → employees NOT NULL cascade        # role=sales
  business_id uuid → businesses NOT NULL cascade
  commission_type commission_type                    # 可空:覆盖该业务默认提成(percent/fixed);空=用方案/单据的提成
  commission_value numeric(12,2)                     # 可空
  active boolean default true
  note text
  created_at timestamptz default now()
  UNIQUE(sales_id, business_id)
}
```
> "销售分配到公司"沿用 `employees.company_id`(不另建);本表表达"这个销售能做哪些业务 + 每业务提成可不同"。

### 1.2 `commission_entries`(提成台账 = 离散应发记录)
```
commission_entries {
  id uuid PK
  sales_id uuid → employees NOT NULL                 # 提成归谁
  billing_id uuid → billing NOT NULL cascade          # 来自哪个成交单
  business_id uuid → businesses (可空)
  period text NOT NULL                                # 'YYYY-MM' 计入哪个工资期
  recurrence commission_recurrence NOT NULL           # one_time / monthly
  seq integer NOT NULL default 1                      # 每月类第几期
  amount_sgd numeric(12,2) NOT NULL
  status commission_entry_status NOT NULL default 'pending'  # pending(待发)/ settled(已汇入工资条)/ void(作废)
  payslip_id uuid → payslips (可空 set null)           # 汇入了哪张工资条
  source_line_id uuid                                 # 来源 deal_line_amounts(普通 uuid,审计)
  note text
  created_at timestamptz default now()
}
```
新枚举 `commission_recurrence=[one_time,monthly]`、`commission_entry_status=[pending,settled,void]`。

> 复用现有 `commission_type` 枚举(percent/fixed)。

---

## 2. 生成逻辑(api,从 deal_line_amounts 物化)

`generateCommissionEntries(billing)`:
- 取该 billing 的 `deal_line_amounts` 里 **kind='commission' 且 party=sales** 的行(party 解析:deal_parties.code='sales')。
- billing.sales_id 为空 → 不生成(无销售)。
- 每条 commission 行:
  - **one_time** → 1 条 commission_entry,period = 成交计入月(billing 关联成交起始月 inputs.start_period,否则 billing.created_at 月),amount = amount_per_period(整单)。
  - **monthly** → periods_count(=inputs.months)条,period 从起始月连续,amount = amount_per_period(每月)。
- **每业务提成覆盖**:若 `sales_business_assignments(sales,business)` 有 commission_type/value,**重算**该提成额覆盖方案值(percent×单据收入 / fixed);否则用 deal_line_amounts 的值。
- **幂等**:按 (billing_id, source_line_id, period, seq) 对齐;已 settled 的不动,只重建 pending 的。

触发点:建/改成交单写完 deal_line_amounts 后,同事务调用(billing.ts);也提供 `POST /commission/recompute?billing_id=` 手动重算。

---

## 3. 工资条接入(改 `routes/payslip.ts` buildPayslip)

- `commission_total` 改为:Σ `commission_entries`(sales_id=employee, period=本期, status≠void)的 amount_sgd(**替换旧的 billing 汇总口径**)。
- 生成/发放工资条时(POST /payslips/generate 或 /pay):把计入的 commission_entries 标 status='settled' + payslip_id=该工资条(在工资条 upsert 的同事务)。重算工资条时先把旧关联的 entries 解回 pending 再重算。
- 兼容:旧 billing 口径删除;若某销售无 commission_entries 则为 0。

---

## 4. API(注册 index;权限 finance.manage/commission.manage 写,finance.view/commission.view_own 读)

- `routes/salesAssignments.ts`:`GET /sales/:id/businesses`(某销售的业务分配)、`GET /businesses/:id/sales`、`POST /sales-business-assignments`、`PATCH/:id`、`DELETE/:id`。
- `routes/commission.ts`:
  - `GET /commission/entries?sales_id=&period=&business_id=&status=`(提成台账,筛选)+ 合计。
  - `POST /commission/recompute`(body {billing_id} 或 {period} 批量)→ 重新物化 pending entries。
  - `POST /commission/entries`(手工加一条,特殊情形)、`PATCH /commission/entries/:id`(改 amount(仅 pending)/period/void)。
  - `GET /sales/:id/commission-summary?period=`(某销售某期:各单提成明细 + 合计,= 工资条 commission_total 来源)。
- billing.ts:建/改单后生成 commission entries(§2)。

---

## 5. 前端

- **销售提成分配**页(人事或财务区):每个销售(role=sales)显示其公司 + **可做的业务清单**(增删 sales_business_assignments)+ 每业务提成覆盖(留空=用方案)+ 底薪(读/改 employee_compensation.base_salary)。
- **提成台账**页(财务区):筛 销售/期间/业务/状态;表显示 每条提成(来自哪单/业务/一次性or每月/金额/状态/汇入哪张工资条);合计;`pending` 可手工 void/调整。
- **工资条**(现有 PayrollPage):commission_total 旁加「明细」展开 → 该期该销售的 commission_entries 列表(透明可查)。
- 原则:销售看自己的(commission.view_own);文员/会计建单时提成自动入账,无需重复录入。i18n 中英。

---

## 6. 迁移/seed(占位)

- migration 0016:2 表 + 2 枚举。
- seed(DEMO,幂等):建 1 个 `[DEMO] 销售小陈`(role=sales, company=JUYI)+ employee_compensation(base_salary 2000 占位)+ sales_business_assignments(分配到 ep/ica 两业务,提成留空=用方案)。把现有那个 DEMO「保安保洁」成交单(若有 sales_id 则)或新建一个带 sales 的 DEMO 单 → 生成 commission_entries 演示。
- 提成具体点数业主后填(spec §0 占位)。

---

## 7. 验收

- `pnpm -r typecheck`、web build、单测全绿;migration 0016 本地 migrate 成功。
- HTTP:给 DEMO 销售分配 ep 业务 + 建一个带该销售的 ep 成交(提成 10%)→ `/commission/entries` 出现一条 one_time 提成(金额对)→ 生成该销售当月工资条 → commission_total = 该提成额,entry 标 settled + payslip_id。改 sales_business_assignment 提成覆盖 → recompute 后金额随之变。

## 8. 不在本模块

- ⑥ 新加坡报表导出(下一个)
- 提成审批流 / 销售业绩排行(YAGNI)
- 学校/case 与 billing_charges 的提成按实收分期释放(本模块按成交物化;按实收释放可后续增强)
