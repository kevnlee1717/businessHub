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
3. **套餐价作案件基础价**：选套餐即把 `billing` 基础价设为 7000/12000/22000，订金/尾款照现有里程碑算；额外服务各自单独生成一笔收款。
4. **老案件不显示套餐区**：`package_id` 为空 → 详情页不显示套餐/服务卡片区，完全照旧。本功能只对新建案件生效。
5. **选套餐位置**：放在"新建 EP 案件"表单里（签约即定档）。【默认决定，待 review 确认】
6. **标准/旗舰明细**：先 seed 基础版的服务勾选；标准/旗舰只建好套餐（含价 12000/22000），具体含哪些服务留用户后台勾，或后续拿到明细表再补 seed。【默认决定，待 review 确认】

## 3. 数据模型

新增 4 张表 + `cases` 加 1 列。迁移号 `0048`（当前最新 0047）。

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
| active | boolean default true | |
| sort_order | integer | |

**`package_items` — 套餐↔服务 映射（含哪些=免费项）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial PK | |
| package_id | FK packages (cascade) | |
| service_item_id | FK service_items | |
| | | (package_id, service_item_id) 唯一 |

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

- `billing_charges.chargeKind` enum 增加一个值 `service`（现有 `milestone` / `period` / `event`），标记"加购服务"这笔收款。
- 加购一个服务 → 建 `case_services`(source=extra, is_billable=true) + 建一笔 `billing_charges`(chargeKind=service, label=服务名, amountExpected=成交价, billingId=案件的 billing) → 把 charge_id 写回 case_service。
- 实际收款仍走现有"收款计划"流程 / `ChargeSchedulePanel`（`collectChargeWithProofs`，带转账凭证）。两边数据天然一致。

## 4. 业务流程

### 4.1 新建 EP 案件（选套餐）

新建 EP 案件表单加一个**套餐选择器**（必选）。提交时，除现有建案逻辑外：

1. `cases.package_id` = 选中套餐。
2. `billing` 基础价 = 套餐 `base_price_sgd`（写入 `billing.inputs.price` 覆盖，沿用现有 override 机制；订金/尾款里程碑照算）。
3. 把套餐的 `package_items` 快照进 `case_services`：每条 source=package、is_billable=false、name_snapshot=服务名、price=NULL。

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

## 5. 后台「套餐管理」页

新增一个后台页（入口待定，可挂教育/EP 业务区或系统设置）：

- **服务目录 tab**：`service_items` 列表，可增删改单价、分类、启用、排序、is_core/billable。
- **套餐 tab**：`packages` 列表（改名/改基础价/启用）；点开某套餐勾选包含哪些 `service_items`（维护 `package_items`）。

权限：复用现有 position/权限体系（参考记忆 [[project-position-permissions]]），建议归到具备 EP 管理权限的岗位。

## 6. 改动落点清单

- **迁移** `packages/db/migrations/0048_ep_packages_services.sql`：建 4 表 + `cases.package_id` + `billing_charges.chargeKind` 加 `service` + seed。
- **schema** `packages/db/src/schema/`：`serviceItems.ts` / `packages.ts` / `packageItems.ts` / `caseServices.ts`；`cases.ts` 加 `packageId`；`billingCharges.ts` enum 加 `service`。
- **seed**：服务目录全量（按《单项服务价格表》）、3 套餐（含价）、基础版的 `package_items`。
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

## 8. 待 review 确认点

1. 选套餐放在"新建案件表单"（vs 建好后在 step1 卡片里选）—— 默认前者。
2. 标准/旗舰是否现在就要明细 seed —— 默认只 seed 基础版，其余后台勾。
3. 「套餐管理」后台页入口挂在哪个菜单 —— 待定。
