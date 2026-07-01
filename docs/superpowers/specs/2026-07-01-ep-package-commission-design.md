# EP 套餐分成 + 收费&分成 tab 合并 设计文档

日期：2026-07-01（承接 2026-07-01-ep-package-services-design.md）
分支：`feat/ep-package-commission`
状态：设计已与用户对齐，待落地

## 1. 背景与问题

EP 已上线套餐（[[project-ep-packages-services]]）。但套餐为避免与旧 scheme 双重计费，把 packaged 案件的 `billing.schemeVersionId` 置空了。后果：

- **分成 100% 依赖 scheme**：分成引擎只认 `deal_line_amounts` 表，而它只在 `schemeVersionId + inputs` 存在时由 `refreshBillingDealLineAmounts` 从 scheme 物化。
- packaged 案件 `schemeVersionId=null` → `deal_line_amounts` 空 → `commission_entries`（内部销售分成）= 0、`external_commission_entries`（外部渠道分成）= 0 → **工资单和 ledger 都拿不到分成**。

即：套餐把"以前 scheme 设计里有的分成"这一维丢了。本设计把分成接回来，并把最终收费+分成送进财务系统。

## 2. 已确认决策（与用户对齐）

1. **套餐取代 scheme**：新 EP 订单只走套餐；scheme 退成"老订单专用"（今天之前的案件继续用，不动）。
2. **分成配置在套餐层 + 案件可覆盖**：每个套餐一条默认分成规则，具体案件可改。
3. **分成范围**：内部销售分成（→工资单）+ 外部渠道分成（→ledger 财务），两者都要。
4. **分成基数 = 套餐价**：额外加购服务不计入分成基数（用户选择）。
5. **Tab 合并**：把独立的「套餐管理」tab 并进「收费&分成」tab；套餐配置为主区，老 scheme 折叠标注"老订单专用"。

## 3. 核心架构：复用 `deal_line_amounts` 接缝

分成引擎（内部 `generateCommissionEntries` + 外部 `refreshExternalCommissionEntries`）真正读的是 `deal_line_amounts`（逐行金额表），scheme 只是它的一个来源。且这两个生成器在 billing 创建/更新时**无条件调用**。

> 结论：**只要 packaged 案件也往 `deal_line_amounts` 写行（收入行 + 分成行），下游 `commission_entries` / `external_commission_entries` 生成器 + 工资单/ledger 结算全部原样复用，一行不用改。**

`deal_line_amounts` 关键点（已核实 `packages/db/src/schema/dealLineAmounts.ts`）：
- `scheme_line_id` **可空**（FK set null）、`party_id` **可空** → packaged 行可 schemeLineId=null、partyId=sales/外部方。
- 字段：billingId / schemeLineId / kind(revenue|cost|commission) / recurrence / partyId / label / amountPerPeriod / periodsCount / amountTotalExpected。

## 4. 数据模型

新增 1 张配置表 + 1 张案件覆盖表 + `cases`/`billing` 无新列（复用 `billing.salesId` / `billing.externalPayees`）。迁移号 **0054**（当前最新 0053）。

### 4.1 `package_commissions` — 套餐层默认分成规则

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| package_id | FK packages (cascade) | |
| target | enum `internal_sales` / `external_channel` | 内部销售 / 外部渠道 |
| basis | enum `percent` / `fixed` | 按套餐价 % / 固定额 |
| value | numeric(12,2) | percent 时是百分数，fixed 时是金额 |
| default_party_id | uuid NULL → deal_parties | 外部渠道的默认收款方（可空，案件再选） |
| note | text NULL | |

一个套餐可有多条（如一条 internal_sales + 一条 external_channel 默认）。

### 4.2 `case_commissions` — 案件层覆盖/落定的分成规则

案件维度覆盖套餐默认；外部渠道本质逐案（谁介绍的）。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| case_id | FK cases (cascade) | |
| target | enum `internal_sales` / `external_channel` | |
| party_id | uuid NULL → deal_parties | 外部方（internal_sales 该行用 billing.salesId，不填这里） |
| external_party_id | uuid NULL → external_parties | 外部收款方（结算对象） |
| basis | enum `percent` / `fixed` | |
| value | numeric(12,2) | 案件成交分成率/额（默认继承套餐 package_commissions） |
| note | text NULL | |

> 内部销售人仍用现有 `billing.salesId`（新建案件表单收集）。case_commissions 的 internal_sales 行只存 basis/value（覆盖套餐默认率）。

### 4.3 复用的现有字段
- `billing.salesId`：内部销售人（`generateCommissionEntries` 的开关）。
- `billing.externalPayees`(jsonb `{sourceLineId: payeeId}`)：外部分成行→外部收款方映射。packaged 行用 case_commissions 的合成 sourceLineId。

## 5. 引擎分叉（改动集中一处）

### 5.1 新函数 `refreshPackageDealLineAmounts(billingId, tx)`
为 packaged 案件物化 `deal_line_amounts`（替代 scheme 的 `refreshBillingDealLineAmounts`）：
1. 先删该 billing 的旧 deal_line_amounts。
2. 插 **收入行**：kind=revenue、recurrence=one_time、amountPerPeriod=套餐价、amountTotalExpected=套餐价、partyId=null、schemeLineId=null。
3. 插 **分成行**（按 case_commissions ?? package_commissions 计算）：
   - internal_sales：kind=commission、partyId=deal_parties(code='sales')、amount=套餐价×value%（或 fixed）、recurrence=one_time。用一个**稳定合成 sourceLineId**（存进 label 或用 case_commissions.id 作幂等键；见 §8）。
   - external_channel：kind=commission、partyId=对应 deal_party、amount=同上；并写 `billing.externalPayees[syntheticLineId] = external_party_id`，供外部生成器映射。

### 5.2 复用现有生成器（不动）
物化后调用现有：
- `generateCommissionEntries(billingRow, tx)` → 写 `commission_entries`（party=sales）→ 工资单。
- `refreshExternalCommissionEntries(tx, billingRow)` → 写 `external_commission_entries`（外部方）→ ledger。

### 5.3 businessId 解析（wrinkle）
`commission_entries` 需要 `businessId`。老订单从 scheme→business 推；packaged 案件无 scheme，需从 `businesses` where code = 案件 business_type（'ep'）解析并传入。实现时确认 `generateCommissionEntries` 拿 businessId 的方式，必要时给它显式传 businessId 或在物化时补齐。

### 5.4 触发时机
在 packaged 案件的以下时机跑 §5.1+§5.2 链路（都在事务内）：
- 案件创建挂套餐时（`applyPackageToCase`，cases.ts）。
- 加购/移除额外服务时（不改分成基数，但保持 deal_line_amounts 一致即可；基数只用套餐价，加购不影响内部/外部分成金额）。
- 案件层改分成配置（case_commissions）或改 salesId 时。
- 提供手动重算入口（复用现有 `POST /commission/recompute` / `/external-commission/recompute` 若适用）。

与老订单一致：分成在创建/更新时生成为 pending，工资单/ledger 结算时落定。

## 6. Tab 合并（EpSection）

现状 EP tab：案件 / 客户 / 流程模板 / 统计 / **收费&分成**(BusinessSchemePanel) / **套餐管理**(PackagesAdminPage)。

改为：**砍掉「套餐管理」tab**，把它并进「收费&分成」tab：

```
收费&分成 tab
├─ 套餐（主区）：服务目录 + 套餐(定价/含服务/付款节点) + 每套餐分成规则(package_commissions)  ← PackagesAdminPage 扩展加分成配置
└─ 老订单方案(scheme)：现有 BusinessSchemePanel/BusinessDetailPage，折叠 + 标注"老订单专用(legacy)"
```

内部子结构可用 Mantine 内层 Tabs 或 Accordion（套餐 / 老订单）。UI 照 element-admin。

> 注意：master 有并发会话在改 ICA 的收费&分成面板（27f0149）；合并时注意 BusinessSchemePanel/BusinessDetailPage 可能变动，别踩冲突。

## 7. 案件层 UI

- **新建 EP 案件表单**：套餐选择器旁加**销售人 Select**（写 `billing.salesId`）；可选**外部渠道**（外部方 + 率，默认继承套餐 external_channel）。
- **案件详情**：加一个「分成」小视图（可并进「增加服务」区或收款区附近，仅 packaged 案件），显示该案算出的内部/外部分成条目（读 commission_entries / external_commission_entries）+ 允许**案件级覆盖**（改率/改外部方，写 case_commissions 后触发重算）。

## 8. 待实现确认点（实现时定）

1. **合成 sourceLineId**：deal_line_amounts / externalPayees 的幂等键。用 `case_commissions.id`（稳定）作为 sourceLineId 语义键；确认 `generateCommissionEntries`/`refreshExternalCommissionEntries` 用 sourceLineId 的字段（schemeLineId? 独立列?）能接住合成 id（可能需要 deal_line_amounts 保留 sourceLineId 或用 label 承载）。
2. **businessId 解析**（§5.3）：确认生成器拿 businessId 的路径，packaged 走 businesses.code='ep'。
3. **内部分成里程碑拆分**：默认不拆（一次性全额 pending）。若要按套餐付款节点拆再议。
4. **sales_business_assignments 覆盖**：packaged 案件是否仍受该业务级覆盖影响。默认让 package/case 配置写 deal_line 金额为准；实现时确认不被 assignment 意外覆盖（或接受作为额外覆盖层，文档说明）。

## 9. 老订单 & 迁移

- 老订单（`schemeVersionId` 非空 / `package_id` 空）→ 完全走旧 scheme 路径，**零改动、零迁移、零回填**。
- 迁移 `0054_ep_package_commission.sql`：建 `package_commissions` + `case_commissions` 两表 + 2 个 enum（commissionTarget）。幂等风格直接施 dev 库（同 [[project-ep-packages-services]] 的 0053 做法，不跑整条 db:migrate）。

## 10. 边界 / YAGNI

- **不做**老订单迁移到套餐。
- **不做**额外服务计入分成基数（用户明确排除）。
- **不做**套餐分成的复杂里程碑拆分（默认一次性）。
- **不重写** payslip / ledger / 外部对账单 任何代码（只写 commission_entries / external_commission_entries 两张表，天然被下游消费）。
- scheme/BusinessDetailPage 保持现状（只标注 legacy + 折叠），不重构。
