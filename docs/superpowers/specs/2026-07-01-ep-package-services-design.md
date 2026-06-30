# EP 套餐 + 增加服务 设计文档

日期：2026-07-01
分支：`feat/ep-package-services`
状态：待用户 review

## 1. 背景与目标

EP 业务从现在起按"套餐"售卖。新建 EP 案件时**第一步先选一个套餐**（基础版 / 标准版 / 旗舰版）。

套餐含一组服务（免费项）。客户也可在套餐外**单项加购**服务。需要在案件详情页有一个专门的区域，用**卡片**展示这个案件涉及的所有服务：

- 套餐内的服务卡片 → 标"套餐内·免费"，不收费。
- 额外加购的服务卡片 → 标"额外"+ 成交价，并**生成一笔收款记录**。

老案件（本功能上线前建的）没有套餐，保持原样不受影响。

参考业务资料：客户提供的两张 PDF —
- 《基础版套餐》（方案一，SGD 7,000，逐项 ✓/✗）
- 《单项服务价格表》（À La Carte，核心EP / 银行税务 / 家庭安置 / 政府费 各单项单价；底部 Bundle 行：基础 7,000 / 标准 12,000 / 旗舰 22,000）

## 2. 已确认的设计决策（与用户对齐）

1. **套餐与服务目录后台可配置**（不写死 seed）：单价、套餐含哪些服务、套餐基础价都能在后台改，调价/调套餐不用改代码发版。
2. **"增加服务"是案件详情页一个独立导航 section**（与"收款计划"同级），不是第 9 个工作流步骤。
3. **套餐价作案件基础价**：选套餐即把 `billing` 基础价设为 7000/12000/22000；收款计划按**该套餐自己的付款节点**生成（见 §3.1 `package_milestones`，三套餐节点结构不同），不再套用通用 50/50；额外服务各自单独生成一笔收款。
4. **老案件不显示套餐区**：`package_id` 为空 → 详情页不显示套餐/服务卡片区，完全照旧。本功能只对新建案件生效。
5. ✅ **选套餐位置**：放在"新建 EP 案件"表单里（签约即定档）。
6. ✅ **三套餐明细全部 seed**：PDF 已给全基础/标准/旗舰三页明细（含服务勾选 + 付款节点），全部 seed，明细见 §9。
7. ✅ **后台「套餐管理」入口**：EpSection 第 5 个 tab（统计之后）。

## 3. 数据模型

新增 5 张表 + `cases` 加 1 列。迁移号 `0048`（当前最新 0047）。

### 3.1 配置层（后台可维护）

**`service_items` — 服务目录**（即"单项服务价格表"的每一行）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial PK | |
| code | text unique | 稳定标识，如 `core_ep` / `bank_account` / `dp_pass` |
| name | text | 中文名 |
| name_en | text | 英文名 |
| category | enum | `core_ep` / `banking_tax` / `family` / `gov_fee`（对应价格表 A/B/C/D 段） |
| default_price_sgd | numeric(12,2) | 单项标准价（gov_fee 段为客户自付的参考价，如 750） |
| is_core | boolean | 是否核心不可拆（价格表注"核心项不可拆分"） |
| billable | boolean | 是否由我方收费（gov_fee 段=false，客户自付，仅展示） |
| active | boolean default true | |
| sort_order | integer | |

**`packages` — 套餐**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial PK | |
| code | text unique | `basic` / `standard` / `flagship` |
| name | text / name_en text | 基础版 / 标准版 / 旗舰版 |
| base_price_sgd | numeric(12,2) | 7000 / 12000 / 22000 |
| tagline | text NULL | 定位语（"帮你把流程跑通…"/"从评估到获批…"/"把 EP 当成家庭身份规划第一步…"） |
| is_recommended | boolean default false | 标准版打 ★推荐 |
| active | boolean default true | |
| sort_order | integer | |

**`package_items` — 套餐↔服务 映射（含哪些=免费项）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial PK | |
| package_id | FK packages (cascade) | |
| service_item_id | FK service_items | |
| | | (package_id, service_item_id) 唯一 |

**`package_milestones` — 套餐自己的付款节点（收款计划模板）**

> 关键：三个套餐的付款节点结构各不相同（基础/标准是定金+尾款两段，旗舰是签约/EP获批/DP获批三段），不能套用现有 EP scheme 的固定 50/50。每个套餐用自己的节点表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial PK | |
| package_id | FK packages (cascade) | |
| seq | integer | 节点顺序 1/2/3 |
| label | text / label_en text | 签约定金 / EP获批(收到IPA) / DP获批交尾款 等 |
| amount_sgd | numeric(12,2) | 该节点金额（固定额，按 PDF 直接给数） |
| bind_step_order | integer NULL | 绑到哪个 case_step（如签约=1、获批=6），用于到期提示/在该步骤卡片显示该笔收款 |
| refundable_note | text NULL | 退款说明（基础"未获批退1500"/标准"未获批全退"/旗舰"签约定金全退"） |

> 退款规则仅做**文字说明**展示，不建退款引擎（YAGNI，§7）。

### 3.2 案件层

**`cases` 加列**：`package_id integer NULL REFERENCES packages(id)`（老案件为 NULL）。

**`case_services` — 案件的服务卡片（每行=详情页一张卡片）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial PK | |
| case_id | FK cases (cascade) | |
| service_item_id | FK service_items | 指向目录项（保留引用，便于分类/改名） |
| name_snapshot | text | 下单时服务名快照（套餐/目录以后改名不影响历史卡片） |
| source | enum `package` / `extra` | 套餐内 / 额外加购 |
| is_billable | boolean | 套餐内=false（免费）；额外=true（收费）；gov_fee=false（客户自付） |
| price_sgd | numeric(12,2) NULL | 额外项的成交价（可改），套餐内为 NULL |
| charge_id | FK billing_charges NULL | 额外项生成的那笔收款；套餐内 / 客户自付为 NULL |
| status | enum `active` / `removed` | 软删，避免误删已收款卡片 |
| note | text NULL | |
| created_at | timestamptz | |

> **为什么快照（name_snapshot + case_services 行）而不是实时读套餐**：套餐/目录以后改了价或改了包含项，不能影响已签约的老案件。卡片在选套餐那一刻定格。

### 3.3 复用现有收款体系

额外加购服务的收款**不另起炉灶**，复用现有三层：`billing` → `billing_charges` → `payments`。

- `billing_charges.chargeKind` enum 增加一个值 `service`（现有 `milestone` / `period` / `event`），标记"加购服务"这笔收款。套餐自带的付款节点仍用 `milestone`。
- 加购一个服务 → 建 `case_services`(source=extra, is_billable=true) + 建一笔 `billing_charges`(chargeKind=service, label=服务名, amountExpected=成交价, billingId=案件的 billing) → 把 charge_id 写回 case_service。
- 实际收款仍走现有"收款计划"流程 / `ChargeSchedulePanel`（`collectChargeWithProofs`，带转账凭证）。两边数据天然一致。

## 4. 业务流程

### 4.1 新建 EP 案件（选套餐）

新建 EP 案件表单加一个**套餐选择器**（必选）。提交时，除现有建案逻辑外：

1. `cases.package_id` = 选中套餐。
2. `billing` 基础价 = 套餐 `base_price_sgd`（写入 `billing.inputs.price` 覆盖，沿用现有 override 机制）。
3. **按套餐的 `package_milestones` 生成收款计划**：每个节点建一笔 `billing_charges`(chargeKind=milestone, label=节点名, amountExpected=节点金额, caseStepId=该节点 bind_step_order 对应的 case_step, note=退款说明)。**packaged EP 案件不再走 `applyEpSchemes` 的通用 50/50 里程碑**，改用套餐节点。
4. 把套餐的 `package_items` 快照进 `case_services`：每条 source=package、is_billable=false、name_snapshot=服务名、price=NULL。

> 旗舰版有三个节点（签约5000/EP获批10000/DP获批7000），其中"DP获批"节点 bind_step 需对应 EP 主案/子案的相应步骤；若 DP 走子案，节点暂绑到主案"完成"步骤，标注由 DP 子案触发。【实现时确认绑定步骤，见 §8】

### 4.2 详情页"增加服务"区（卡片墙）

EP 案件详情页顶部 `SectionNav` 多一个按钮 **「增加服务」**（在"收款计划"附近；仅 `package_id` 非空时显示）。点进去渲染新组件 `AddonServicesPanel`：

- **套餐内卡片**：绿色徽章「套餐内·免费」。
- **额外加购卡片**：橙色徽章「额外」+ 成交价 + 收款状态徽章（取自绑定的 charge.status）+「记录收款」按钮（跳/调用现有收款流程）。
- **客户自付卡片**（gov_fee 段）：灰色徽章「客户自付」，仅展示，不进我方收款。
- 顶部「+ 加购服务」按钮 → 弹窗从 `service_items` 选（排除该案已含的）→ 可改成交价 → 落一张 extra 卡片 + 生成 charge。
- 卡片可"移除"（软删 status=removed）；已绑定已收款的 charge 不允许直接删，提示先处理收款。

按 vue-element-admin 设计语言落地（卡片用 Mantine `Card` + `Badge`，参考 `docs/design-system/element-admin-reference.md` §4 组件映射）。

### 4.3 老案件

`package_id` 为 NULL → `navItems` 不加「增加服务」按钮，详情页完全照旧。无数据迁移、无回填。

## 5. 后台「套餐管理」页（EpSection 第 5 个 tab）

在 `apps/web/src/pages/business/EpSection.tsx` 现有 4 个 tab（案件 / 客户 / 流程模板 / **统计**）后面，**加第 5 个 tab「套餐管理」**（统计之后）。tab 内部再分两块：

- **服务目录**：`service_items` 列表，可增删改单价、分类、启用、排序、is_core/billable。
- **套餐**：`packages` 列表（改名/改基础价/tagline/★推荐/启用）；点开某套餐 → 勾选包含哪些 `service_items`（维护 `package_items`）+ 编辑付款节点（维护 `package_milestones`）。

权限：复用现有 position/权限体系（参考记忆 [[project-position-permissions]]），建议归到具备 EP 管理权限的岗位。

## 6. 改动落点清单

- **迁移** `packages/db/migrations/0048_ep_packages_services.sql`：建 5 表 + `cases.package_id` + `billing_charges.chargeKind` 加 `service` + seed。
- **schema** `packages/db/src/schema/`：`serviceItems.ts` / `packages.ts` / `packageItems.ts` / `packageMilestones.ts` / `caseServices.ts`；`cases.ts` 加 `packageId`；`billingCharges.ts` enum 加 `service`。
- **seed**：服务目录全量（按《单项服务价格表》）、3 套餐（含价/tagline/付款节点）、三套餐各自的 `package_items` 与 `package_milestones`（明细见 §9）。
- **shared** `packages/shared/`：zod schema + enum（serviceCategory / caseServiceSource）。
- **后端 routes**：
  - `service-items` / `packages` CRUD（后台管理）。
  - 案件加购服务：`POST /cases/:id/services`（建 case_service + charge）、`DELETE`（软删）、`GET /cases/:id/services`（列卡片）。
  - 新建案件逻辑挂上 package 快照 + billing 基础价。
- **前端**：
  - 新建 EP 案件表单加套餐选择器。
  - `CaseDetailPage` 的 `SectionNav` 加「增加服务」section + `AddonServicesPanel` 组件。
  - 后台「套餐管理」页。
  - API client：`apps/web/src/api/` 加 packages / serviceItems / caseServices。

## 7. 边界与 YAGNI

- **不做**老案件回填套餐（决策 4）。
- **不做**套餐价格的历史版本管理（套餐改价只影响之后新建的案件；已建案件靠 case_services 快照定格，billing 价已写入不回改）。
- **不做**额外服务的折扣/促销引擎（成交价人工填，够用）。
- gov_fee（政府费）只展示不收费，不接入我方收款，不做代收对账（现有系统本就没有，超出本次范围）。

## 8. 已确认 / 待实现时确认

已确认（用户 review）：
1. ✅ 选套餐放"新建案件表单"。
2. ✅ 三套餐明细全部 seed（PDF 已给全，见 §9）。
3. ✅ 后台「套餐管理」放 EpSection 第 5 个 tab（统计之后）。

实现时确认：
- 旗舰版"DP获批交尾款"节点绑哪个步骤（DP 走子案时的触发点）。
- 标准/旗舰 `package_items` 与目录项的精确映射（§9 已给最佳映射，实现时核对一遍）。

## 9. Seed 数据（按 PDF）

### 9.1 `service_items` 服务目录（按《单项服务价格表》）

| code | 中文名 | category | 单价 | is_core | billable |
|---|---|---|---|---|---|
| core_ep | 公司注册 + 董事挂名 + EP 申请（核心：注册+基础合规+本地挂名董事1年+结构设计+EP材料+MOM递交） | core_ep | 8000 | true | true |
| compass | 前期评估 + COMPASS 打分预判（含风险评估报告） | core_ep | 1000 | false | true |
| mom_full | MOM 全程跟进 + 不限次数补件 | core_ep | 1800 | false | true |
| amendment | 补件处理（单次） | core_ep | 600 | false | true |
| post_advisory | EP 下签后 30 天运营辅导 | core_ep | 1500 | false | true |
| renewal_reminder | 续签提醒服务（到期前 6 个月） | core_ep | 400 | false | true |
| first_renewal | 第一次续签托管（全包，含材料与递交） | core_ep | 3500 | false | true |
| bank_account | 公司公户开户协助（包下户，保证开成） | banking_tax | 3000 | false | true |
| tax_filing | 首次个人所得税申报代办（第一年） | banking_tax | 1000 | false | true |
| dp_pass | 家属 DP 准证申请（每位） | family | 1800 | false | true |
| school_app | 孩子学校申请代办（每个孩子） | family | 2000 | false | true |
| home_finding | 新加坡租房找房服务 | family | 2500 | false | true |
| helper | 家庭女佣招聘（菲律宾女佣） | family | 2000 | false | true |
| pr_pathway | PR 路径规划（EP 获批后启动） | family | 2000 | false | true |
| advisory_3y | 3 年专属顾问服务（政策实时同步） | family | 2500 | false | true |
| gov_fee | 政府收费（公司注册+EP申请+IPA签发，客户支付） | gov_fee | 750 | false | **false** |

### 9.2 套餐 `packages`

| code | 名 | base_price | is_recommended | tagline |
|---|---|---|---|---|
| basic | 基础版（启动版） | 7000 | false | 帮你把流程跑通，适合条件明确、预算敏感的客户 |
| standard | 标准版（全流程版） | 12000 | **true** | 从评估到获批全流程把关，适合绝大多数企业主 |
| flagship | 旗舰版（全家规划版） | 22000 | false | 把 EP 当成家庭身份规划第一步，适合全家来新、长期规划 |

### 9.3 套餐含哪些服务 `package_items`（✓ 项 → 目录 code）

- **basic**：`core_ep`、`gov_fee`
  （基础版 ✓：公司注册 / EP材料 / MOM标准跟进 / 一次补件 / 政府费 —— 这些归入 core_ep；其余如公户开户/COMPASS/结构设计/30天辅导/续签提醒/DP 均 ✗）
- **standard**：`compass`、`core_ep`、`bank_account`、`mom_full`、`post_advisory`、`renewal_reminder`、`gov_fee`
  （标准版 ✓：COMPASS / 结构设计(含在core_ep) / 公司注册 / 公户开户 / EP全套材料 / MOM不限补件 / 30天辅导 / 续签提醒 / 政府费；✗：DP、PR路径）
- **flagship**：标准版全部 `∪` `dp_pass`、`school_app`、`home_finding`、`helper`、`pr_pathway`、`first_renewal`、`advisory_3y`、`tax_filing`
  （旗舰版 = 标准版全部服务 + DP + 学校申请 + 找房 + 女佣 + PR路径 + 首次续签托管 + 3年顾问 + 首年个税；政府费客户自付）

### 9.4 付款节点 `package_milestones`

**basic（共 7000）**
| seq | label | amount | bind_step | 退款说明 |
|---|---|---|---|---|
| 1 | 签约定金 | 3500 | 1（签约） | 如申请未获批，退还 SGD 1,500 |
| 2 | 尾款 | 3500 | 6（获批） | — |

**standard（共 12000）**
| seq | label | amount | bind_step | 退款说明 |
|---|---|---|---|---|
| 1 | 签约定金 | 5000 | 1（签约） | 如申请未获批，全额退还 |
| 2 | 尾款 | 7000 | 6（获批） | — |

**flagship（共 22000）**
| seq | label | amount | bind_step | 退款说明 |
|---|---|---|---|---|
| 1 | 签约定金 | 5000 | 1（签约） | 如 EP 未获批，全额退还 |
| 2 | EP 获批（收到 IPA） | 10000 | 6（获批） | — |
| 3 | DP 获批交尾款 | 7000 | 8（完成）或 DP 子案触发【待确认】 | DP 获批后结清，落地服务随后依次交付 |
