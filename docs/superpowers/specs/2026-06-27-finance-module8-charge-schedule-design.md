# 财务系统 · 模块⑧ 设计(通用成交收款计划 / 期数台账 + 工作流步骤绑定)

> 把"学校那套(报名→自动生成 6 期→到点打勾收款)"**推广到所有业态**,补上引擎"算出应收"到文员"逐笔实收"之间缺失的运营层。一次解锁:
> - #1 EP/ICA 首付/尾款/分期 **+ 关联到案件步骤**
> - #3 按摩椅 每椅每月抽成(每月一期)
> - #4 AI 床垫 每晚抽成(按事件 + 月结)
> - #5 加盟 意向金/第1笔/第2笔/尾款(里程碑)**+ 每月物料/营业抽成**(周期)
>
> **设计原则(业主强调)**:录入的是普通文员 → **越简单越好**(选方案 → 自动排期 → 到点打勾收款 + 传截图);收集的数据输出 → **越专业越好**(自动进统一流水④/总面板⑦/将来报表⑥)。

---

## 0. 现状对照(已核实)

- 引擎(模块①)能**表达** 5 种收入形态 + 提成时机(scheme_lines: kind/basis/recurrence)。
- **学校(#2)完整**:diploma_enrollments + diploma_payments(月期数)+ ③a 面板。
- **缺**:① 收款不绑 case_step(case_steps 无金额字段);② 除学校外无通用"期数/里程碑"实收台账;③ 提成台账(⑤,本模块不做)。
- billing 已有 business_id/scheme_version_id/inputs;deal_line_amounts 存"预期"经济;payments 是实收但不挂具体应收笔。

**本模块 = 在"预期(deal_line_amounts)"与"实收(payments/ledger)"之间,加一层"应收计划(billing_charges)"**,并让一次性收入可拆**里程碑**、可绑**步骤**。学校沿用 diploma_payments 不动(两者都汇总到面板;未来可统一)。

---

## 1. 数据模型(migration `0015`)

### 1.1 `scheme_milestones`(方案版本的"一次性收入"分笔模板)
一次性收入(recurrence=one_time 的 revenue 行合计)如何拆成 首付/分笔/尾款;周期收入(monthly/per_event)不用里程碑,按 inputs 生成。
```
scheme_milestones {
  id uuid PK
  version_id uuid → scheme_versions NOT NULL cascade
  seq integer NOT NULL                # 1,2,3...
  label text NOT NULL                 # 意向金 / 首付 / 第1笔 / 尾款
  basis milestone_basis NOT NULL      # percent(占一次性总额%) / fixed(固定额)
  value numeric(12,2) NOT NULL        # percent: 30 表示30%; fixed: 金额
  bind_step_order integer             # 绑到案件模板第几步(可空;EP/ICA 用)
  due_offset_days integer             # 相对成交日的应收天数(可空)
  note text
}
```
新枚举 `milestone_basis=[percent,fixed]`。约束:同 version seq 唯一;percent 之和应≈100(应用层校验,余额归最后一笔)。

### 1.2 `billing_charges`(成交收款计划 = 期数/里程碑台账,核心)
建/改成交单时**自动生成**;每条 = 一笔应收。
```
billing_charges {
  id uuid PK
  billing_id uuid → billing NOT NULL cascade
  scheme_line_id uuid → scheme_lines (可空,周期类来自哪条规则)
  charge_kind charge_kind NOT NULL    # milestone(一次性分笔) / period(每月) / event(每晚/每次)
  seq integer NOT NULL                # 第几笔/第几期
  label text NOT NULL                 # 首付 / 2026-06 / 第3晚
  period text                         # 'YYYY-MM'(period 类);milestone/event 可空
  due_date date                       # 应收日期(可空)
  case_step_id uuid → case_steps (可空 set null)   # 绑工作流步骤(#1/#5)
  amount_expected numeric(12,2) NOT NULL
  amount_collected numeric(12,2) NOT NULL default 0
  status charge_status NOT NULL default 'pending'  # pending/partial/paid/waived
  currency currency NOT NULL default 'SGD'
  note text
  created_at timestamptz default now()
}
```
新枚举 `charge_kind=[milestone,period,event]`、`charge_status=[pending,partial,paid,waived]`。

### 1.3 `payments` 加 `charge_id`(把实收挂到具体应收笔)
```
ALTER payments ADD charge_id uuid → billing_charges (可空 set null);
```
一笔 payment 冲抵一条 charge(或部分);charge.amount_collected = Σ其 payments.sgd_equivalent,status 自动算。

---

## 2. 生成逻辑(纯函数 `packages/shared`,api 调用)

`generateCharges(version_lines, milestones, inputs)` → charge 草案数组:
- **一次性收入**(Σone_time revenue 行)→ 若有 scheme_milestones:按里程碑拆(percent×总额 / fixed,余额归最后);否则单条 milestone「全款」。每条带 bind_step_order/due_offset。
- **每月收入**(monthly revenue 行,合计每月额)→ 生成 inputs.months 条 period charge(period 从成交起始月连续;label=YYYY-MM)。#3 按摩椅、#5 每月物料/营业抽成。
- **每次事件**(per_event revenue 行)→ 生成 inputs.events 条 event charge(预估);**另支持事后逐条增删**(#4 每晚实际入住:文员每天/月底补录实际晚数 → 加 event charge)。
- 成本/分成行**不**生成收款 charge(它们是我们的支出/应付,收款计划只管"收进来的钱")。

> 建单时一把生成;改 inputs/版本 → 重算未收的 charge(已收的保留,见 §3 幂等)。

---

## 3. API(注册 index;权限 finance.manage 写 / finance.view 读)

- 改 `routes/billing.ts`:建/改单(带 scheme_version_id+inputs)时,事务内 `generateCharges` → upsert billing_charges(**幂等**:已 paid/partial 的 charge 不动,只重算 pending 的;seq 稳定)。
- `routes/charges.ts`:
  - `GET /billing/:id/charges`(某成交单的收款计划,按 seq/period)
  - `GET /charges?business_id=&company_id=&status=&period=&overdue=`(跨单的应收台账,筛选)
  - `POST /charges`(手工加一条,主要给 event 类 #4 补录:billing_id/label/amount/period/due_date/case_step_id)
  - `PATCH /charges/:id`(改 label/due_date/amount(仅未收)/case_step_id 绑解绑步骤/waive)
  - `DELETE /charges/:id`(仅 pending 可删)
  - `POST /charges/:id/collect`:**到点收款** —— body {paid_amount,currency,fx_rate?,paid_at,proof_document_ids(≥1 强制),bank_account_id?,note}。事务内:建 payment(charge_id=本条)→ 更新 charge.amount_collected/status → **桥接一条 ledger_entries(in)**(复用模块④ ledgerUtils,带 business_id/billing_id/凭证)。**一步完成"收款+凭证+进流水"**。
- `routes/schemeVersions.ts` 扩展:版本下 `GET/POST/PATCH/DELETE .../milestones`(管理里程碑模板);预设(per_head 等)默认无里程碑,一次性卖断/加盟预设给默认里程碑(首付/尾款)。
- 案件:`GET /cases/:id/charges`(某案件的收款计划,经 billing 关联)——EP/ICA 详情页用,显示"哪一步收哪笔、收了没"。

---

## 4. 前端

- **成交单/案件 收款计划面板**(EP/ICA 案件详情 + 通用成交详情):时间线/表 —— 每笔 label/应收/已收/状态/绑定步骤/应收日;每条「收款」按钮 → Modal(金额+币种+**上传凭证必填**+账户)→ 一键收款进流水。绑步骤的笔在对应 case_step 旁也显示「待收 X / 已收」。
- **方案版本编辑器**(模块①页)加「收款里程碑」子区:配 首付/尾款/分笔(percent/fixed + 绑第几步)。
- **应收台账页**(财务区):跨业务/公司的 charges,筛 状态/逾期/期间;逾期高亮;批量到点提醒。与③学校面板并列(学校读 diploma_payments,这里读 billing_charges)。
- **事件补录**(#4 床垫):成交详情里「加一笔事件收入」快捷录入(日期+晚数×单价 或 直接金额)。
- 原则落地:文员主要动作就是**在计划里找到这笔 → 点收款 → 拍照上传 → 完**。i18n 中英。

---

## 5. 迁移/seed/演示

- migration 0015:scheme_milestones + billing_charges 表 + payments.charge_id + 2 枚举(charge_kind/charge_status)+ milestone_basis 枚举。
- seed(DEMO,幂等):给"一次性卖断"预设/EP 默认版本加 2 里程碑(首付30%绑第1步、尾款70%绑最后步);给本地那个 DEMO「保安保洁」或新建一个 DEMO 加盟单演示 里程碑+每月混合 charge。
- 学校 diploma_payments 不迁移(本模块不动学校)。

---

## 6. 验收

- `pnpm -r typecheck`、web build、引擎新单测(generateCharges:一次性拆里程碑/每月N期/百分比余额归最后)全绿;migration 0015 本地 migrate 成功。
- HTTP:建一个 EP 成交(总价 + 首付30%/尾款70% 里程碑)→ GET charges 返回 2 条(绑对步骤、金额对)→ collect 首付(无凭证 422、传凭证成功)→ charge 变 paid、payments 多一条 charge_id、ledger 多一条 in。建一个每月抽成单(months=12)→ 生成 12 条 period charge。event 补录一条 → 台账+1。
- 总面板⑦应收口径可纳入 billing_charges 未收(留 TODO 或本模块顺带接)。

## 7. 不在本模块

- ⑤ 销售提成台账(下一个模块;依赖本模块的成交单/charges 已落地)
- ⑥ 新加坡报表导出
- 学校 diploma_payments 与 billing_charges 的统一(未来可选)
- 自动催缴推送
