# MLK 菜系经理（Cuisine Manager）设计

日期：2026-07-18 ｜ 状态：用户已口头确认（数据模型=菜系表中转、分成=半自动），按此实施
来源：《陆老师厨房·菜系经理·合作方案》PDF + 用户需求（做菜系经理 tab、关联门店、月度分成）

## 1. 业务模型（来自 PDF）

菜系经理是管理公司下的角色：一个经理管多个门店、名下多个菜系（菜品唯一不冲突），只负责培训 + 菜品质量 + 冲营业额。收入构成 6 项：

| # | 收入项 | 规则 | 系统数据来源 |
|---|--------|------|--------------|
| 1 | 管理费 | 门店营业额 × 3% | 自动：mlk_settlements.turnover，缺则 Σ mlk_store_revenue |
| 2 | 物料利润 | 一人一半 | 手动录入 |
| 3 | 培训费 | 按店实报实销 | 手动录入 |
| 4 | 开店结余 | (5 万投资款 − 真实开店开销) ÷ 2，一次性 | 手动录入（记在发生月份，备注写门店） |
| 5 | 超额奖励 | max(0, 店净利 − 5600) × 50% × 10% | 自动：mlk_settlements.net_profit |
| 6 | 中央厨房 | 利润一人一半 | 手动录入 |

联名方式：有名气的牌子可联名（你的牌子 × 陆老师厨房），小牌子直接挂陆老师招牌。

## 2. 数据库（migration 0075，手写幂等 SQL，不走 db:migrate）

### mlk_managers（菜系经理）
name, phone, wechat, id_no, brand_name, branding(co_brand/mrs_lu), status(candidate/active/exited), joined_at, exited_at, mgmt_fee_rate numeric 默认 3, excess_bonus_rate numeric 默认 10, profit_threshold numeric 默认 5600, drive_folder_id, notes + auditColumns

### mlk_cuisines（菜系）
name, manager_id FK→mlk_managers **可空**（允许菜系先建、经理后签；老数据回填需要）, notes + auditColumns

### mlk_manager_settlements（经理月度分成单）
manager_id NN FK, month date, mgmt_fee, material_share, training_fee, opening_surplus, excess_bonus, central_kitchen, other, total, detail jsonb（每店明细）, notes + auditColumns；唯一索引 (manager_id, month)。风格对齐 mlk_settlements。

### mlk_stores 改造
- 加 cuisine_id FK→mlk_cuisines（可空）
- 回填：现有 cuisine 文本 DISTINCT → 插入 mlk_cuisines（manager_id 空）→ 回填 cuisine_id → **DROP COLUMN cuisine**（避免双写漂移；prod 发布时同样 DDL+回填）

## 3. API（apps/api/src/routes/mlk.ts，读 mlk.view 写 mlk.manage）

- GET/POST /mlk/managers，GET/PATCH/DELETE /mlk/managers/:id（list 带菜系数、门店数；detail 带菜系数组+每菜系门店）
- GET /mlk/cuisines?managerId=，POST/PATCH/DELETE（PATCH 可换 manager_id；DELETE 有门店引用时 409）
- GET /mlk/managers/:id/settlements
- GET /mlk/managers/:id/settlements/preview?month=YYYY-MM-01 → 计算建议值：mgmt_fee = Σ(店营业额×经理费率)；excess_bonus = Σ max(0, net_profit−threshold)×50%×bonus_rate；detail=[{storeId, storeName, turnover, turnoverSource(settlement/revenue/none), mgmtFee, netProfit, excessBonus}]
- POST /mlk/manager-settlements，PATCH/DELETE /mlk/manager-settlements/:id（total 后端算=六项+other 之和）
- stores：POST/PATCH 收 cuisine_id；GET list/detail join 出 cuisineName, managerId, managerName
- DELETE /mlk/managers/:id：名下有菜系或分成单 → 409

## 4. 前端（apps/web/src/pages/franchise/mlk/）

- MlkLayoutPage 加第 4 个 tab「菜系经理」（?tab=managers）→ MlkManagersTab：列 = 姓名/挂牌方式/名下菜系 badges/门店数/状态/电话，mlk.manage 控新建；行点击进详情
- MlkManagerDetailPage（/franchise/mlk/managers/:id），子 tab：
  - 基本信息：档案 + 分成参数（费率/奖励率/门槛）编辑
  - 菜系与门店：菜系 CRUD；名下门店按菜系分组表，行点跳门店详情
  - 月度分成：每月一行（六项+other+合计+备注），新建选月→preview 预填→可改→保存；行展开每店明细
  - 文件：复用 MlkFilePanel（drive_folder_id）
- 门店侧：表单 cuisine 文本框 → 菜系 Select（显示所属经理，支持快捷新建菜系）；门店详情 info 显示「菜系 · 菜系经理」链接；MlkStoresTab 加菜系/经理列
- App.tsx 注册详情路由；api/mlk.ts 加类型与 client

## 5. 权限 / 部署

- 权限复用 mlk.view / mlk.manage，不加新权限位
- 只在 dev 树开发；dev 库手动跑 0075（幂等），rebuild + restart bh-dev，dev-bh.youjia.sg 验证
- 发 prod：跑 0075 DDL + cuisine 回填（存量就地适配），不动行数据

## 6. 明确不做（YAGNI）

- 不做分成单状态流转（草稿/确认/已付）——先一行一单，要了再加
- 不做经理登录账号/门户；不做物料进销存；不做中央厨房独立模块（金额列先留）
