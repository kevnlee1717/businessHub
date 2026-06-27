# 财务系统 · 第 1 层地基设计(业务实体化 + 公司绑定 + 灵活成交方案版本)

> 本文是整套财务系统的**第 1 层(地基)**设计。整套财务系统分 3 层 7 模块,自下而上建,本层是其它所有层的数据来源。
> 设计原则(业主 2026-06-27 确认):① 一层层来,先地基;② 会计走「简化录入 + 生成专业报表导出」;③ 收入模型现在就建全 4 种业态,但框架要够通用,以后能随时加没想到的形态。

---

## 0. 整套财务系统的分层(situating 本层)

| 层 | 模块 | 一句话 | 本文范围 |
|---|---|---|---|
| **第 1 层 地基** | **① 业务实体化 + 绑公司** | 把硬编码业务类型变成实体表,每个业务绑一个公司 | ✅ 本文 |
| | **② 灵活成交方案版本** | 每业务可多版本(首付/付款/提成/收入模型不同),每单选一版,算出每单利润 | ✅ 本文 |
| **第 2 层 账本** | ③ 期数台账 + 每业务财务面板 | 月度/按晚/按人头的实际收款期数、每业务该月做到多少 | ⛔ 后续 |
| | ④ 收支总账本 + 强制凭证 + 对公账户对账 | 每笔进出强制截图、对应业务/类别、跟对公账户对得起来 | ⛔ 后续 |
| | ⑤ 销售与提成账本 | 销售分配到公司、可设底薪、可跨业务、提成台账汇进工资条 | ⛔ 后续 |
| **第 3 层 核算与分析** | ⑥ 公司财务核算 + 新加坡报表导出 | 科目、应收应付、月度损益、导出 IRAS/ACRA 标准 | ⛔ 后续 |
| | ⑦ KPI 反推 + 总数据面板 + 现金流预测 | 不亏损底线反推招几人/做几单、各公司健康度、现金流 | ⛔ 后续 |

**本文只设计第 1 层(模块 ① ②)。** 后续模块在各自 spec 展开。下文每处与后续层的边界都会显式标注「→ 后续」。

> **业主补充需求(2026-06-27,锚定到后续层,先记录不丢)** —— 学院类(成人大专/英语)按月收学费、每月固定成本(房租等)已在那,所以要:
> - **当月收款进度**:每月让学生把款打进来,看到当前收了多少 / 还差多少;
> - **欠款名单**:哪些学生这期没打,列好、统计好;
> - **招生缺口**:要招多少学生、还差几个(= 不亏损所需学生数 − 现有学生数)。
>
> 数据脊柱已存在:`diplomaPayments`(成人大专按月期数)。落点:**收款进度 + 欠款名单 → 第 2 层 ③**;**招生缺口 → 第 3 层 ⑦**(缺口 = 本层算出的每生月净利 + 公司每月固定成本 → 反推保本学生数)。**本层(①②)是它的前置**:先有每生经济模型 + 业务绑公司的固定成本归集,缺口才算得出。

---

## 1. 现状与缺口(已核实)

现有系统(53 表,Drizzle + Fastify + React/Mantine)已有:

- `companies`(公司实体,员工已绑 `company_id`)
- `billing`(每单一条账单,`ref_type` 枚举 `ep/ica/diploma/english/wsq` + `ref_id`,内含 `total_price_sgd`/`deposit_sgd`/`sales_id`/`commission_type`/`commission_value`/`commission_amount_sgd`/`status`)
- `payments`(实收记录,SGD/RMB + fx 折算,挂 `billing_id`)
- `diplomaPayments`(成人大专按月学费期数,`enrollment_id`+`period`+`amount`+`paid`)
- `company_expenses`(公司支出,`rent/utility/other` 平铺)
- 权限位:`finance.manage` / `finance.view` / `commission.manage` / `commission.view_own`

**地基层缺口**:

1. **没有业务实体表** —— 业务是 `business_type`(`ep/ica/dp`)+ `billing_ref_type`(5 值)两套硬编码枚举,业务**没绑公司**,加新业态(食阁/物业加盟/贩卖机/按摩椅/AI 床垫/保安保洁)要改枚举 + 改代码。
2. **没有成交方案版本** —— 提成写死在 `billing` 单行(`commission_type`/`value`),无版本、无启用时间、无"多版本并行/关闭"、无每单利润计算。
3. **收入模型单一** —— 只能表达"总价 + 首付 + 尾款"的一次性卖断,无法表达月度差价/按晚抽成/按人头多方抽成。

---

## 2. 本层核心:通用条目规则引擎(业主已确认方向)

不给每种业态写死字段。把每个**方案版本**拆成若干**条目规则行**,每行三要素:

- **类型 `kind`**:`revenue`(我们赚的)/ `cost`(我们掏的)/ `commission`(要付出去的提成/分成)
- **基准 `basis`**:
  - `fixed` —— 固定额(rate = 金额)
  - `percent_of_revenue` —— 按当期收入合计的百分比(rate = 百分比)
  - `per_unit` —— 数量 × 单价(rate = 单价,数量来自成交/事件,`unit_label` 标明单位:晚/人头/台/月)
  - `margin` —— 差价 = 售价 − 进价(售价/进价来自成交/事件)
- **周期 `recurrence`**:`one_time`(一次性)/ `monthly`(每月)/ `per_event`(每次事件:每晚、每次入住、每批人头…)

每个业态 = 几条规则的组合。**4 种业态全部可表达**:

| 业态 | 规则行(kind · basis · recurrence) |
|---|---|
| **一次性卖断**(EP/大专/英语) | 收入 fixed one_time(总价,可拆首付/尾款见 §4.3);分成 percent_of_revenue one_time(给 sales) |
| **月度差价**(按摩椅) | 收入 margin monthly(售价−进价);分成 percent_of_revenue monthly |
| **按晚抽成**(AI 床垫) | 收入 per_unit per_event(晚数 × 每晚抽成);分成 percent_of_revenue per_event |
| **按人头多方抽成**(保安保洁) | 收入 per_unit monthly(人头×客户单价)+ 收入 per_unit monthly(人头×HR 返点,party=hr_source)+ 分成 percent_of_revenue monthly(party=sales)+ 成本 fixed monthly(办公分摊) |
| **没想到的新业态** | 加几条规则行即可,**不改代码、不迁移数据库** |

**录入不抽象**:UI 提供**预设模板**(`一次性卖断 / 月度差价 / 按晚抽成 / 按人头多方抽成 / 自定义`),选模板即自动填好规则行,再微调。预设只是"填表器",落库后都是统一的规则行。

---

## 3. 数据模型(本层新增/改动)

命名与现有 Drizzle 风格一致(snake_case 表名/列名,`uuid` 主键 `defaultRandom`,`numeric(12,2)` 金额,`numeric` 百分比用 `(6,3)`,时间 `timestamptz`)。新增独立 migration(预计 `0012`)。

### 3.1 `businesses`(业务实体,绑公司)

```
businesses {
  id            uuid PK
  company_id    uuid → companies (NOT NULL, on delete restrict)   # 每个业务绑一个公司
  code          text UNIQUE        # 机器码:ep/ica/diploma/english/wsq/massage_chair/...(供代码/迁移引用)
  name          text NOT NULL      # 中文名:EP 申请 / 按摩椅商场推广 / 保安保洁派遣
  name_en       text
  category      text               # 自由分类标签:移民/教育/加盟/硬件租赁/人力派遣...(可空)
  status        business_status    # active / paused / closed
  default_version_id uuid          # 当前默认方案版本(见 §3.3),可空
  sort_order    integer DEFAULT 0
  note          text
  created_at    timestamptz NOT NULL default now()
}
```

- 新枚举 `business_status = [active, paused, closed]`。
- 迁移把现有 5 个硬编码业务各建一行(见 §6),`company_id` 先指向一个种子公司,业主可在「业务」页改绑。
- **多业务可属同一公司**;一个公司可有多业务。

### 3.2 `deal_parties`(分成/收入来源对象类型,可配置)

多方抽成里"对象"要可扩展(没想到的角色随时加),故做成小配置表而非枚举。

```
deal_parties {
  id        uuid PK
  code      text UNIQUE      # us / sales / hr_source / partner / referrer / ...
  name      text NOT NULL    # 我们 / 业务员 / HR 来源 / 加盟商 / 介绍人
  name_en   text
  active    boolean default true
  is_system boolean default false   # 种子项不可删
}
```

- 种子:`us`(我们)、`sales`(业务员)、`hr_source`(HR 来源)、`partner`(加盟商)、`referrer`(介绍人)。
- `kind=commission` 的规则行用 `party_id` 指明付给谁;`kind=revenue` 的来源标注(如 HR 返点)也可挂 `party_id`。

### 3.3 `scheme_versions`(方案版本)

业主描述:「每个单子有自己的版本;一般只有当前一个默认版本;每个版本有自己的利润率;每个版本有开始时间、是否在使用中;可多个版本同时在用;有的版本关闭不能用了。」→ 版本直接挂在业务下(扁平,不引入中间"方案"分组,YAGNI;若将来要并行方案族再加)。

```
scheme_versions {
  id              uuid PK
  business_id     uuid → businesses (NOT NULL, on delete cascade)
  label           text NOT NULL          # 版本名/号:v1 / 2026 标准 / 双十一促销
  status          scheme_version_status  # active(在用) / closed(关闭不可选)
  effective_from  date                    # 版本开始使用日期
  effective_to    date                    # 关闭日期(可空)
  assumed_inputs  jsonb                    # 示范利润率用的假设值(见 §5.1):{unit_count, unit_price, cost_price, headcount, months, ...}
  profit_rate     numeric(6,3)            # 按 assumed_inputs 算出的示范利润率(%),系统缓存,规则/假设变更时重算
  note            text
  created_at      timestamptz NOT NULL default now()
}
```

- 新枚举 `scheme_version_status = [active, closed]`。
- **可多版本同时 active**(不同单子用不同 active 版本);"当前默认版本"唯一权威来源是 `businesses.default_version_id`(不在版本上另存 `is_default`,避免双源漂移)。关闭 = `status=closed`,建新单时不可选,但**老单仍锁定在它原来的版本**(见 §4)。

### 3.4 `scheme_lines`(版本条目规则行)—— 引擎核心

```
scheme_lines {
  id            uuid PK
  version_id    uuid → scheme_versions (NOT NULL, on delete cascade)
  sort_order    integer default 0
  kind          scheme_line_kind        # revenue / cost / commission
  basis         scheme_line_basis       # fixed / percent_of_revenue / per_unit / margin
  recurrence    scheme_line_recurrence  # one_time / monthly / per_event
  party_id      uuid → deal_parties     # commission 必填(付给谁);revenue 可选(来源标注)
  rate          numeric(12,3)           # fixed=金额 / percent_of_revenue=百分比 / per_unit=单价 / margin 不用(售价进价在录入时填)
  unit_label    text                    # per_unit 时单位名:晚 / 人头 / 台 / 月
  input_key     text                    # per_unit/margin 时,引用成交录入里的哪个数量键(见 §5):如 headcount / nights / unit_count
  label         text NOT NULL           # 人读描述:客户人头服务费 / 办公分摊 / 业务员提成
  note          text
}
```

- `percent_of_revenue` 的"收入"= **同一 `recurrence` 流内所有 `kind=revenue` 行的金额合计**(避免跨周期串味;如 monthly 提成只按 monthly 收入算)。
- `margin` 行的售价/进价不存 rate,在成交/事件录入时给(见 §5);`input_key` 区分多个 margin 流。

### 3.5 改 `billing`(成交单关联业务 + 版本 + 录入快照)

不新建"deals"表,**直接泛化现有 `billing`**(它已是"每单一条"的成交单),平滑兼容存量数据:

新增列:
```
billing.business_id        uuid → businesses        # 取代 ref_type 的语义(ref_type/ref_id 保留作回链到 case/enrollment)
billing.scheme_version_id  uuid → scheme_versions    # 本单锁定的方案版本(建单时取业务 default_version,可改)
billing.inputs             jsonb                     # 本单录入的具体数字:{unit_count, unit_price, cost_price, headcount, months, nights, deposit_sgd, ...}
```

- `ref_type` / `ref_id` **保留**(回链到底层 case/enrollment 记录,前端跳转、回填仍用);`business_id` 成为业务归属的权威字段。
- `commission_type` / `commission_value` / `commission_amount_sgd`:**保留但逐步弃用** —— 新单的提成由 `scheme_lines` 的 commission 行算(见 §5),写进快照 `deal_line_amounts`;存量单沿用旧列。迁移期两者并存,§6 说明切换。
- 金额仍以 SGD 为内部本位币(沿用现有 `payments` 的 fx 折算)。

### 3.6 `deal_line_amounts`(每单算出的条目金额快照)—— 审计 + 报表来源

成交建/改时,引擎按"本单锁定版本的规则行 × 本单 `inputs`"算出每条规则的具体金额,**快照落库**(版本规则后续变更不影响老单):

```
deal_line_amounts {
  id              uuid PK
  billing_id      uuid → billing (NOT NULL, on delete cascade)
  scheme_line_id  uuid → scheme_lines (on delete set null)   # 来源规则(版本删了也留快照)
  kind            scheme_line_kind          # 冗余存,便于报表
  recurrence      scheme_line_recurrence
  party_id        uuid → deal_parties
  label           text
  amount_per_period numeric(12,2)           # 该规则单期金额(one_time=整单;monthly=每月;per_event=每次)
  periods_count   integer                    # one_time=1;monthly=合同月数;per_event=预估次数(可空,实算见后续层)
  amount_total_expected numeric(12,2)        # = amount_per_period × periods_count(预期合计)
  computed_at     timestamptz NOT NULL default now()
}
```

- **每单利润** = Σ(revenue.total_expected) − Σ(cost.total_expected) − Σ(commission.total_expected)。
- **每单利润率** = 每单利润 ÷ Σ(revenue.total_expected)。
- per_event 的真实次数(每晚实际入住、每月实际人头波动)→ **实际期数台账在第 2 层**;本层 `deal_line_amounts` 存的是按 `inputs` 的**预期**值,供建单即时看"这单大概赚多少"。

---

## 4. 版本与成交单的关系(关键语义)

1. 建单(billing)时,默认带出业务的 `default_version_id`;可改选任何 `status=active` 的版本。
2. 单一旦建立,`scheme_version_id` **锁定**;之后版本规则改动 / 版本被 `closed`,**不影响此单**(此单的经济快照已落 `deal_line_amounts`)。
3. 改单条款 = 选另一个版本,或新建版本再切 —— 符合"版本"语义,历史可追。
4. "默认版本"(`businesses.default_version_id`)与"多版本并行":默认只影响新建单的默认带出;其它 active 版本仍可手动选用。

---

## 5. 计算引擎(纯函数,放 `packages/shared`)

引擎是**无副作用纯函数**,API 建/改单时调用,产出 `deal_line_amounts` 快照;前端建单页也可本地调同一函数即时预览利润。便于独立测试。

```
computeDealEconomics(lines: SchemeLine[], inputs: DealInputs) -> {
  perLine: DealLineAmount[],
  totals: { revenue, cost, commission, profit, profitRate }(按 one_time/monthly/per_event 各一组 + 合计)
}
```

逐行求值:
- `fixed` → amount = rate
- `per_unit` → amount = rate × inputs[input_key]   (input_key 缺省按 unit_label 兜底)
- `margin` → amount = inputs[input_key+'_sell'] − inputs[input_key+'_cost']
- `percent_of_revenue` → amount = rate% × (同 recurrence 内 revenue 行 amount 之和)  ← **必须后于该流内所有 revenue 行求值**(两遍:先收入,再百分比)
- `periods_count`:one_time=1;monthly=inputs.months;per_event=inputs.events(可空)
- 利润/利润率见 §3.6。

### 5.1 版本示范利润率(`scheme_versions.profit_rate`)

版本编辑页填一组 `assumed_inputs`(示范的人头/月数/单价/进价),引擎按它算出 `profit_rate` 缓存到版本上,业务面板可直接看"这个版本利润率约 X%"。规则行或假设值变更时重算。

### 5.2 边界(→ 后续层)

- **实际期数收款**(每月/每晚真实发生、实收对账)→ 第 2 层 ③ + 第 2 层 ④。本层只产**预期**经济。
- **提成具体发给哪个销售、销售底薪、跨业务分配** → 第 2 层 ⑤。本层只在规则里定**提成比例/对象类型**。
- `payments`(实收)沿用现状,本层不改;凭证强制 + 对公账户对账 → 第 2 层 ④。

---

## 6. 迁移方案(`0012`)+ 兼容存量

1. 建 5 张新表(`businesses` / `deal_parties` / `scheme_versions` / `scheme_lines` / `deal_line_amounts`)+ 4 个新枚举;给 `billing` 加 3 列(`business_id` / `scheme_version_id` / `inputs`),均**可空**先上。
2. 数据回填:
   - 为现有 5 类(`ep/ica/diploma/english/wsq`)各建 1 行 `businesses`(`code` 沿用,`company_id` 指向一个种子/默认公司,业主后续改绑)。
   - 为每个业务建 1 个 `scheme_versions`(`label='v1'`, `status=active`, `is_default=true`),并按现状把"一次性卖断"规则行写进去(收入 fixed one_time + 分成 percent/fixed —— 用各单现有 `commission_*` 的常见值作默认)。
   - `UPDATE billing SET business_id = 对应业务`(按 `ref_type` 映射);`scheme_version_id` 指向该业务 v1。
   - **存量单不强制回算 `deal_line_amounts`**(可选脚本批量补);存量提成继续读旧 `commission_amount_sgd`,新单读快照。报表层做 `COALESCE(快照, 旧列)` 兜底。
3. `ref_type` 枚举**不删**(回链仍用);新业态不再扩这个枚举,改用 `businesses.code`。
4. 上线后老 API(`POST /billing` 等)保持可用;新增字段走可选参数,见 §7。

> 迁移分两段提交:① 建表 + 加列(0012);② 回填脚本(seed/一次性脚本)。便于回滚。

---

## 7. API(Fastify 路由)

新增/改动(沿用现有 `routes/*.ts` + `@bh/shared` Zod schema 风格):

- `routes/businesses.ts`:`GET/POST/PATCH /businesses`(管理业务 + 绑公司 + 设默认版本);权限 `finance.manage`。
- `routes/schemeVersions.ts`:
  - `GET /businesses/:id/scheme-versions`、`POST /businesses/:id/scheme-versions`(可带预设模板 `preset` 参数,服务端展开成规则行)
  - `PATCH /scheme-versions/:id`(改 label/status/is_default/assumed_inputs)、`POST /scheme-versions/:id/lines`、`PATCH/DELETE /scheme-lines/:id`
  - `POST /scheme-versions/:id/preview`(传 inputs,返回 `computeDealEconomics` 结果,供前端即时预览;不落库)
- `routes/dealParties.ts`:`GET/POST/PATCH /deal-parties`。
- 改 `routes/billing.ts`:建/改单接受 `business_id` / `scheme_version_id` / `inputs`,服务端调引擎写 `deal_line_amounts`;返回每单利润。
- `@bh/shared/schemas/finance.ts`:补 `businessSchema` / `schemeVersionSchema` / `schemeLineSchema` / `dealInputsSchema` + 引擎纯函数与其类型。

预设模板(`preset`)在 shared 里以常量定义(`一次性卖断/月度差价/按晚抽成/按人头多方抽成`),服务端按 preset 生成默认 `scheme_lines`。

---

## 8. 前端(React + Mantine)

新增「业务」管理区(挂在现有后台导航,owner/admin/accountant 可见):

- **业务列表**:按公司分组,显示业务、当前默认版本、示范利润率、状态。
- **业务详情 / 方案版本**:版本列表(状态/生效期/默认/利润率),版本编辑器 = **预设模板选择 + 规则行表格**(增删行、选 kind/basis/recurrence/party/rate/unit_label/input_key),右侧"示范利润率"实时算(调 `/preview` 或本地引擎)。
- **建成交单**(改造现有 billing 录入):选业务 → 带出默认版本(可改)→ 按版本规则需要的 `input_key` 动态渲染录入字段(人头/晚数/台数/售价/进价/月数/首付)→ 实时显示"这单预期利润 / 利润率"。
- i18n:新文案中英双份(沿用 react-i18next);业务/版本/对象名走 `name`+`name_en` 双字段。

---

## 9. 权限

复用现有权限位:`finance.manage`(增删业务/版本/规则、改绑公司)、`finance.view`(查看)。`sales` 角色只读自己单的利润不在本层强约束(→ 第 2 层 ⑤ 细化)。

---

## 10. 验收(本层算"完成"的标准)

项目无测试体系(只有 `tsc --noEmit`)。本层因引入**计算引擎**,破例补**引擎纯函数的单元测试**(4 种业态各一组用例 + percent_of_revenue 两遍求值 + margin)。

- `pnpm -r typecheck` 全绿;`pnpm --filter @bh/web build` 过。
- 引擎单测:4 种预设业态 inputs → 预期 profit/profitRate 断言通过。
- migration `0012` 在本地 postgres `pnpm db:migrate` 成功;回填脚本跑通,存量 `billing` 全部 `business_id` 非空。
- 端到端手测:新建一个"保安保洁"业务 → 建"按人头多方抽成"版本 → 建一单填人头数 → 看到正确的每月净利。

---

## 11. 明确不在本层(YAGNI / 后续层)

- 实际期数台账、每业务月度面板「该月做到多少」、**学院当月收款进度 + 欠款学生名单**(③,数据脊柱 `diplomaPayments` 已在)
- **招生缺口**「要招多少学生 / 还差几个」(⑦,= 公司每月固定成本 ÷ 每生月净利 − 现有学生数)
- 强制凭证、对公账户逐笔对账(④)
- 销售跨业务分配、销售底薪、提成汇入工资条(⑤)—— 本层只定提成规则
- 会计科目、应收应付账龄、损益表、IRAS/ACRA 导出(⑥)
- KPI 反推、总面板、现金流预测(⑦)
- 多币种本位币切换(继续 SGD 本位 + fx 折算)
