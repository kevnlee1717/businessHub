# 加盟业务 · 物业拜访跟踪 设计文档

- 日期：2026-06-28
- 模块前缀：`franchise_*`
- 参考实现：招聘模块（recruitment）—— schema / Fastify 路由 / 前端 `Layout + Tabs + Shared` / React Query / 权限 / company 数据隔离全部照搬范式
- 设计语言：vue-element-admin（落地用 Mantine 7），见 `docs/design-system/element-admin-reference.md`
- ⚠️ 开发只在 `~/project/businessHub-dev`，验证 `dev-bh.youjia.sg`，确认 OK 再按 `docs/runbooks/deploy-pitfalls.md` 发 prod

## 1. 背景与目标

加盟业务分两个大类：**综合物业**（贩卖机 / 按摩椅 / AI床垫 / 保洁机器人 / 保洁 / 保安）和**餐饮**（食阁、咖啡厅）。两类都需要业务员去拜访物业/场地，留下经理或招商的联系方式、了解场地条件、填写需求问券、持续跟踪。

本期**不展开**每个加盟业务的细节经营，只做两件事：

1. **加盟业务各子业务二级菜单占位**（Coming Soon）
2. **物业拜访跟踪 CRM**（核心）—— 场地档案、联系人、拜访/问券录入、KPI 看板

后续每个加盟业务（尤其贩卖机的 600 台机器位置/盈利）再单独细化。

## 2. 范围

### 本期做（四块核心）
- 场地档案（综合物业场地 + 餐饮场地，两套）
- 联系人/经理（共享，含转介绍关系网）
- 拜访记录 + 问券录入（两套问券）
- KPI 看板（四维度 + 待拜访提醒）

### 本期只占位
- 加盟业务 → 综合物业（6 个子业务卡片占位）
- 加盟业务 → 餐饮（食阁 / 咖啡厅占位）
- 600 台贩卖机场地：本期仅「标记 + 备注」，机器位置/盈利数据等后续

### 明确不做
- 贩卖机/按摩椅/AI床垫等具体业务的经营管理功能
- 合同、报价、回款（财务模块另有归属）

## 3. 关键设计决策（已与用户确认）

| 决策 | 结论 |
|---|---|
| 餐饮 vs 综合物业 | **场地 / 拜访 / 问券 分两套**；`org`（集团公司）+ `contact`（联系人）两边**共享** |
| 为什么联系人共享 | 要统计「认识多少食阁集团经理、多少物业公司经理」；且餐饮经理↔物业经理会**互相转介绍** |
| 转介绍关系 | `contact.referred_by_contact_id` 自关联，支持「一个经理介绍一串」的扇出 + 跨类型互介 |
| 场地是谁介绍的 | 场地表 `introduced_by_contact_id` + `relationship_note` |
| 餐饮问券 | **单独一份**（`franchise_fnb_survey`），装租金/管理费/洗碗费/合约/招商条件 |
| 综合物业问券 | 数字化 PDF《Property Service Needs Form》，②感兴趣服务 + ③各业务明细 |
| 问券录入方式 | 现场手机填 + 回来补录都支持 → 表单**移动端友好** |
| KPI 维度 | 全要：拜访量 / 场地覆盖 / 问券回收 / 意向漏斗 |
| 权限 key | `franchise.view` / `franchise.manage` |

## 4. 菜单 / 路由结构

侧栏（`apps/web/src/layout/AppShell.tsx` 的 `navItems`）：

```
加盟业务 (franchise, 一级)
├─ 拜访跟踪   /franchise/tracking      ← 本期开发, 内部 Tab
│     看板 / 综合物业场地 / 餐饮场地 / 联系人 / 拜访记录
├─ 综合物业   /franchise/property      ← 占位页(卡片: 贩卖机·按摩椅·AI床垫·保洁机器人·保洁·保安)
└─ 餐饮       /franchise/fnb           ← 占位页(卡片: 食阁·咖啡厅)
```

路由（`apps/web/src/App.tsx`，仿 recruitment 嵌套）：

```tsx
<Route path="franchise/tracking" element={<TrackingLayout />}>
  <Route index element={<TrackingDashboardPage />} />        {/* 看板 */}
  <Route path="properties" element={<PropertiesPage />} />
  <Route path="properties/:id" element={<PropertyDetailPage />} />
  <Route path="fnb-sites" element={<FnbSitesPage />} />
  <Route path="fnb-sites/:id" element={<FnbSiteDetailPage />} />
  <Route path="contacts" element={<ContactsPage />} />
  <Route path="contacts/:id" element={<ContactDetailPage />} />
  <Route path="visits" element={<VisitsPage />} />
</Route>
<Route path="franchise/property" element={<FranchisePropertyPlaceholder />} />
<Route path="franchise/fnb" element={<FranchiseFnbPlaceholder />} />
```

## 5. 数据模型（`packages/db/src/schema/franchise.ts`，8 张表）

所有表含标准字段：`id uuid pk`、`company_id uuid → companies`（数据隔离）、`created_at`、`updated_at`。
负责业务员统一 `owner_id uuid → employees`。

### 共享层

**`franchise_org` 集团/公司**
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(200) | 集团/公司名 |
| type | enum | 食阁集团 / 物业公司 / 业主 / 咖啡厅品牌 / 其他 |
| note | text | 备注 |

**`franchise_contact` 联系人/经理**
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(200) | 姓名 |
| role | varchar(120) | 职务（经理 / 招商 / 业委会 …） |
| phone | varchar(64) | 电话 |
| org_id | uuid → franchise_org | 所属集团（可空） |
| referred_by_contact_id | uuid → franchise_contact | **谁介绍认识的**（自关联，可空） |
| next_visit_at | timestamptz | 下次拜访时间（驱动待拜访提醒） |
| owner_id | uuid → employees | 负责业务员 |
| note | text | 备注 |

> 「多少食阁集团经理 / 多少物业公司经理」= `contact` join `org` 按 `org.type` 计数。

### 综合物业子模块

**`franchise_property` 场地**
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(200) | 物业名称 |
| property_type | enum | 问券①：Mall/Office/Condo/Hotel/Industrial/Airport/Train_MRT/Food_court/Hospital_School/Other |
| address | text | 地址/位置 |
| org_id | uuid → franchise_org | 所属物业公司/业主 |
| is_vending_site | boolean | **是否 600 台贩卖机场地** |
| vending_note | text | 贩卖机备注（位置/盈利后续细化） |
| introduced_by_contact_id | uuid → franchise_contact | 谁介绍的场地 |
| relationship_note | text | 关系说明（熟人/介绍背景） |
| priority | enum | 高/中/低 |
| footfall | enum | 日均人流 很高/高/中/低 |
| decision_maker | enum | 我可决定 / 需上报管理层 / 需业委会 |
| has_public_space | enum | 有/无/待定 |
| status | enum | 未拜访/跟进中/已成交/已放弃 |
| owner_id | uuid → employees | 负责业务员 |

**`franchise_property_visit` 综合物业拜访记录**
| 字段 | 类型 | 说明 |
|---|---|---|
| property_id | uuid → franchise_property | 场地 |
| contact_id | uuid → franchise_contact | 当次对接联系人（可空） |
| by_employee_id | uuid → employees | 业务员 |
| visited_at | timestamptz | 拜访日期 |
| interest_level | enum | 意向 高/中/低 |
| services_pitched | text[] | **介绍了哪些项目**（贩卖机/按摩椅/…多选） |
| result | text | 拜访结果 |
| note | text | 备注 |

**`franchise_property_survey` 综合物业问券**（数字化 PDF，1:1 挂拜访）
| 字段 | 类型 | 说明 |
|---|---|---|
| visit_id | uuid → franchise_property_visit | 所属拜访 |
| interested_services | text[] | ②感兴趣服务多选 |
| details | jsonb | ③各业务明细（贩卖机&按摩椅场地条件 / 保洁机器人 / AI床垫 / 保安 / 保洁，按勾选区块存） |

### 餐饮子模块

**`franchise_fnb_site` 餐饮场地**（稳定属性）
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(200) | 场地名 |
| org_id | uuid → franchise_org | 所属食阁集团/咖啡厅品牌 |
| location | text | 场地位置 |
| has_aircon | boolean | 是否冷气 |
| introduced_by_contact_id | uuid → franchise_contact | 谁介绍的 |
| relationship_note | text | 关系说明 |
| priority | enum | 高/中/低 |
| status | enum | 未拜访/跟进中/已成交/已放弃 |
| owner_id | uuid → employees | 负责业务员 |

**`franchise_fnb_visit` 餐饮拜访记录**
| 字段 | 类型 | 说明 |
|---|---|---|
| site_id | uuid → franchise_fnb_site | 场地 |
| contact_id | uuid → franchise_contact | 当次对接联系人（可空） |
| by_employee_id | uuid → employees | 业务员 |
| visited_at | timestamptz | 拜访日期 |
| interest_level | enum | 意向 高/中/低 |
| result | text | 拜访结果 |
| note | text | 备注 |

**`franchise_fnb_survey` 餐饮问券**（1:1 挂拜访）
| 字段 | 类型 | 说明 |
|---|---|---|
| visit_id | uuid → franchise_fnb_visit | 所属拜访 |
| rent_fixed | numeric | 固定租金/月 |
| rent_revenue_share_pct | numeric | 抽营业额成数 % |
| management_fee | numeric | 管理费 |
| dishwash_fee | numeric | 洗碗费 |
| contract_expiry | enum | 现合约到期（无/3月内/6月内/1年内） |
| extra | jsonb | 招商条件/可租摊位/空摊位等附加字段 |

### 新增 enum（`packages/shared/src/enums.ts` + `schema/enums.ts`）
`franchiseOrgType`、`franchisePropertyType`、`franchisePriority`、`franchiseFootfall`、`franchiseDecisionMaker`、`franchiseTriState`(有/无/待定)、`franchiseSiteStatus`、`franchiseInterestLevel`、`franchiseService`(贩卖机/按摩椅/保洁机器人/AI床垫/保安/保洁)、`franchiseContractExpiry`。

## 6. 后端 API（`apps/api/src/routes/franchise.ts`，注册进 `routes/index.ts`）

Fastify + Zod + Drizzle，`preHandler: requirePerm("franchise.view"|"franchise.manage")`，列表统一 `getAccessibleFilter` 注入 company 数据隔离。

标准 CRUD（list 带 `q` 搜索 + 过滤 + 分页）：
- `/franchise/orgs` GET/POST/PATCH/DELETE
- `/franchise/contacts` GET/POST/PATCH/DELETE（list 支持 `org_type`、`due_before` 过滤 → 待拜访）
- `/franchise/properties` GET/POST/PATCH/DELETE（过滤 `is_vending_site`、`priority`、`status`、`owner_id`）
- `/franchise/properties/:id/visits` GET/POST（拜访 + 问券一次提交）
- `/franchise/fnb-sites` GET/POST/PATCH/DELETE
- `/franchise/fnb-sites/:id/visits` GET/POST（拜访 + 餐饮问券一次提交）
- `/franchise/visits` GET（跨两套的拜访流水，看板/列表用）
- `/franchise/kpi` GET（聚合，见 §8）

Zod schema 放 `packages/shared/src/schemas/franchise.ts`。

## 7. 前端（`apps/web/src/pages/franchise/`）

仿 recruitment：`TrackingLayout.tsx`（Tab 容器）+ `TrackingShared.tsx`（列表/详情/表单实现）+ 各 `*Page.tsx` re-export。
API 客户端 `apps/web/src/api/franchise.ts`（React Query keys + 函数）。

- **场地列表**：Mantine `Table` + 过滤（优先级/状态/是否600台/负责人）+ 搜索；行点开详情。
- **场地详情**：基本信息 + 联系人 + 拜访时间线（按 visited_at 倒序）+「新增拜访」按钮。
- **拜访/问券表单**：Modal 或独立页，**移动端友好**；综合物业问券按 PDF 版式，②勾服务 → ③动态展开对应明细区块；餐饮问券走 fnb_survey 字段。
- **联系人**：列表（按集团类型筛、按 next_visit_at 排「待拜访」）+ 详情（含转介绍关系：谁介绍了 TA、TA 介绍了谁）。
- **看板**：KPI 卡片 + 排行 + 待拜访提醒列表。
- **占位页**：综合物业/餐饮各一个，element-admin 卡片网格列子业务，标 Coming Soon。

i18n：`apps/web/src/locales/{zh,en}.json` 加 `nav.franchise.*`、`franchise.*` 文案。

## 8. KPI 看板（`/franchise/kpi`，跨两套聚合）

入参 `from`、`to`、可选 `employee_id`：
1. **拜访量**：按业务员统计区间内 `property_visit + fnb_visit` 家数，排行榜。
2. **场地覆盖**：场地总数 / 已拜访 / 待拜访（status=未拜访）/ 是否600台占比。
3. **问券回收**：区间内 survey 份数（两套合计，按业务员）。
4. **意向漏斗**：高意向场地数 → 已成交数。
5. **待拜访提醒**：`contact.next_visit_at <= now()+N天` 的联系人列表（也可按场地 status 排）。

## 9. 迁移与上线

1. `packages/db/src/schema/franchise.ts` 定义 8 表 + enums，`index.ts` 导出。
2. `drizzle-kit generate postgresql` 生成新迁移（当前最新 0029，本模块约 0030+）。
3. dev 库 `businesshub_dev` 应用迁移并自测。
4. 加 `franchise.view` / `franchise.manage` 权限到权限系统 + 角色默认授予。
5. `dev-bh.youjia.sg` 验证 → 按 `deploy-pitfalls.md` 发 prod。

> ⚠️ dev 树当前有并发会话在改 recruitment（migration 0029 未提交）；生成本模块迁移前先 `git status` 核对，避免迁移序号/journal 冲突。

## 10. 未决 / 后续

- 600 台贩卖机：机器位置、盈利、与场地的绑定关系 —— 待用户给数据后单独细化（届时 `vending_note` 升级为关联表）。
- 综合物业问券 `details` 用 jsonb 起步；若后续要按服务字段做报表，再拆结构化列。
- 餐饮问券 `extra` 字段集待用户给餐饮问券终稿后补全。
