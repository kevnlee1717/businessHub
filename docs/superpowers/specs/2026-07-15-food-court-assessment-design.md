# 食阁(食阁/Food Court)成本健康度 + 夫妻收入测算 设计文档

- 日期:2026-07-15
- 放置:加盟业务 → F&B → 新页「食阁测算」(现 `/franchise/fnb` 是空 placeholder)
- 范围:先 dev,验证后发 prod
- 状态:业务逻辑已随真实账单(Food Junction NEX 店 6 月)+ 用户 Q&A 确认

## 1. 目标

新加坡食阁档口:输入每家食阁的各项费用后,**立刻判断**:
1. 食阁总费用是否健康(占营业额 **30–35%**)
2. 三档营业额(2.5万/3万/3.5万)下,**夫妻实拿收入 + 投资人回款**
3. 要做到多少营业额才有 **5600 目标纯利润**

每家食阁**存一条**,可反复看 / 多家对比。

## 2. 真实费用结构(来源:Food Junction NEX 店账单)

| 项 | 算法 |
|---|---|
| Sales-Based Rent 抽成租金 | **max(抽成% × 营业额, 保底租金)**;账单抽成 24.5% |
| 广告费 | 广告% × 营业额(账单 0.70%) |
| 刷卡手续费 | **综合% × 营业额**(账单里 NETS 0.6% / VISA·MASTER 1.66% / BTGR 0.8% 分列,本工具简化为一个综合%) |
| 固定月费 | 清洁/洗碗、维护、POS租金、订阅、银行、法务、其它(各 $ 输入) |
| GST | **9% × 上述费用小计**(不含入场费;用户选"计入成本") |
| 入场费月摊 | **入场费总额 ÷ 摊销月数**(账单 18,598 → 1,430/月) |

## 3. 计算模型

**输入(每家食阁存一条)**
- 身份:食阁名称、档口号/名、品牌(夫妻店名)、备注、(可选)合约起止
- 租金:抽成% `rentPct`(默认 24.5)、保底租金/月 `minRent`
- 广告%`advPct`(默认 0.70)、刷卡综合%`mdrPct`(默认 1.5)
- 固定月费:清洁/洗碗、维护、POS、订阅、银行、法务、其它(各 number,加总 `fixed`)
- 入场费:总额 `entranceTotal`、摊销月数 `entranceMonths` → `entrance = entranceTotal/entranceMonths`
- 食材%`foodPct`(默认 35)、GST%`gstPct`(默认 9)、是否计 GST `includeGst`(默认 true)
- 夫妻薪水 `salary`(默认 8000)、投资人保底 `investorFloor`(默认 2800)、利润目标 `profitTarget`(默认 5600)
- 三档营业额 `tiers`(默认 [25000,30000,35000],可改)

**每档营业额 R 计算**
```
rent      = max(rentPct/100 * R, minRent)
adv       = advPct/100 * R
mdr       = mdrPct/100 * R
feeSub    = rent + adv + mdr + fixed
gst       = includeGst ? gstPct/100 * feeSub : 0
entrance  = entranceTotal / entranceMonths
F         = feeSub + gst + entrance            // 食阁总费用
healthPct = F / R * 100                          // 30–35 绿灯,<30 偏低(黄),>35 超标(红)
food      = foodPct/100 * R                       // 食材
remainder = R - F - food                          // “人工池” = 夫妻薪水 + 利润
P         = remainder - salary                    // 纯利润
```
**利润分配(夫妻/投资人各半 + 投资人保底)**
```
if P >= profitTarget:      // 例 P>=5600
    investor = P/2
    couple   = salary + P/2
else:                      // 投资人达不到保底,从夫妻扣
    investor = investorFloor          // 2800
    couple   = salary + P - investorFloor    // = (salary-2800) + P
couple = max(couple, 0)   // 兜底;若为 0 说明连保底都补不满,标红警告
```
- P = 5600 时:投资人 2800、夫妻 8000+2800=10800(各半、投资人刚达保底)
- 例(R=3万, F=30%=9000, 食材35%=10500):remainder=10500, P=2500 → 投资人2800、夫妻=8000+2500−2800=**7700**

**达标营业额(利润=目标)**:数值二分求解 `P(R) = profitTarget` 的 R(因 rent 有 max() 分段,二分最稳),显示「达到 5600 利润需营业额 ≈ $XX,XXX」。

## 4. 前端

`加盟 → F&B → 食阁测算`(替换 FranchiseFnbPlaceholder,或新增 tab)。
- **列表页**:各食阁卡片/行(名称、3万档健康%、3万档夫妻实拿、达标营业额),+ 新建。
- **详情/编辑页**:左侧分组输入表单;右侧/下方**结果表**:
  - 列:2.5万 | 3万 | 3.5万(跟随 tiers)
  - 行:租金、广告、刷卡、固定费、GST、入场月摊、**食阁总费用F**、**F健康%(色标)**、食材、剩余(人工池)、**纯利润P**、**夫妻实拿**、**投资人拿**
  - 顶部大字提示:**「达到 5600 利润需营业额 ≈ $X」**;健康徽章;夫妻是否 ≥ 薪水(被扣时标红)。
- 计算**纯前端实时**(输入即算);保存只存输入参数。
- 设计语言照 `docs/design-system/element-admin-reference.md`(Mantine)。

## 5. 数据与后端

- 新表 `fnb_food_courts`:id、name、stall、brand、notes、以及 §3 全部输入参数(fixed 各项可用独立列或 jsonb `fixed_fees`;tiers 用 int[] 或 jsonb)、created_by、created_at、updated_at。
- API `/fnb-food-courts` CRUD,权限沿用 `franchise.view`(看)/`franchise.manage`(增改删)。
- 计算不落库(纯公式前端算);后端只存/取输入。
- 迁移:drizzle schema + 手动 DDL(prod 沿用手动 apply 模式)。

## 6. 非目标(YAGNI)

- 不接真实账单导入/OCR(先手输)
- 刷卡不分支付方式(一个综合%)
- 不做多月历史/趋势(先单张测算)
- 不做权限细分(沿用 franchise.view/manage)

## 7. 受影响文件(预估)

- 新增:`packages/db/src/schema/fnbFoodCourts.ts`、migration、`packages/shared/src/schemas/fnbFoodCourt.ts`、`apps/api/src/routes/fnbFoodCourts.ts`、`apps/web/src/pages/franchise/FoodCourt*.tsx`、`apps/web/src/api/fnbFoodCourts.ts`
- 修改:`routes/index.ts`、`schema/index.ts`、`App.tsx`(路由)、`AppShell.tsx`(菜单,若加 tab)、i18n
