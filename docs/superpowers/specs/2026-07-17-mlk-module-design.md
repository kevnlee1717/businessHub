# 陆老师厨房(MLK)加盟门店管理模块 — 设计文档

> 2026-07-17。依据:《家庭(夫妻)合作协议 v1》《投资人主合同 v2》、用户口述需求。
> 一期全量交付(档案+状态+付款+台账+结算+文件+营业额)。

## 0. 菜单与权限

- 「加盟业务 → 餐饮」改名 **「食阁预测」**(`nav.franchise_fnb`,en: Food-court Forecast)。
- 新增 **「陆老师厨房」** `/franchise/mlk`(`nav.franchise_mlk`,en: Mrs Lu Kitchen)。
- 新权限 **`mlk.view` / `mlk.manage`**(投资人/夫妻资料含护照与钱,单独授权,不复用 franchise.*)。

## 1. 业务模型(合同摘要)

- **一店一 SPV**:投资人 A 类 51% / 夫妻运营公司 B 类 48% / Kaider Management C 类 1%。
- **投资人**:主合同一次签,每店一份《单店附表》。服务费两档:档一 S$20,000(1 店、无 PR);档二 S$50,000 + PR 获批后尾款 S$50,000(10 店 + PR 一条龙)。每店投资款 S$50,000 分 4 期(签意向 5k / 选定门店+夫妻 5k / 签食阁租约 30k / 开业 10k)+ 食阁押金 5–15k(可退)。月回款 ≈2,800 保底 + 25% 上升利润。
- **夫妻**:工资 8,000;入职保证金 10k(15/18/21/24 月各退 25%);分红保证金 = 月分红 30% 压存(满 1–5 年每年退 20%);开店垫款 ~50k 月还 4,167,还清后改收当月到手 10% 平台服务费(<6,000 免收);夫妻保底 3,000;EP 准证、PR 申请;师徒制(徒弟店利润 3/4/5%、徒孙 1.5%)。
- **门店生命周期**(付款节点即状态节点):签意向 → 选定门店+夫妻 → SPV 注册 → 签食阁租约(+押金)→ 装修 → 开业(第三期后 1.5 个月内)→ 营业中 → 关店/退出。
- **分账**(与食阁预测 `foodCourtCalc` 同一模型,直接复用):纯利润 P = 营业额 − 食阁费用 F − 食材 − 管理费 3% − 工资 8000;P≤5600 投资人 51%/夫妻 49%,>5600 部分 管理 50/投资人 25/夫妻 25;投资人保底 2800;夫妻工资在 [3000, 3833](还款期)。

## 2. 数据模型(migration 0069,前缀 mlk_)

### mlk_investors 投资人
| 列 | 说明 |
|---|---|
| id uuid PK | |
| name / company_name / uen / id_no / phone / wechat / address | 基本资料 |
| service_tier | `tier1` \| `tier2` |
| pr_status | `none` \| `applied` \| `granted`(档二尾款支付条件) |
| kyc_status | `pending` \| `done` |
| drive_folder_id uuid | → drive_nodes 文件夹 |
| notes / created_by / created_at / updated_at | |

### mlk_couples 夫妻(运营方)
| 列 | 说明 |
|---|---|
| id uuid PK | |
| operator_company / operator_uen | 运营公司 |
| husband_name / husband_id_no / husband_passport | 丈夫 |
| wife_name / wife_id_no / wife_passport | 妻子 |
| phone / wechat | |
| husband_ep / wife_ep | `none` \| `applied` \| `granted` |
| pr_status | `none` \| `applied` \| `granted` |
| mentor_id uuid FK→self | 师傅(师徒树) |
| status | `candidate` \| `active` \| `exited` |
| joined_at / exited_at | |
| drive_folder_id / notes / 审计列 | |

### mlk_stores 门店(SPV)
| 列 | 说明 |
|---|---|
| id uuid PK | |
| name / stall / address | 门店名、档口 |
| spv_name / spv_uen | SPV 公司 |
| investor_id FK / couple_id FK | 股东(51/48;Kaider 1% 固定不建表) |
| food_court_id FK→fnb_food_courts | **关联食阁预测**,复用费用参数与测算 |
| kitchen_store_id text | Kitchen PWA 的 store id(营业额同步映射) |
| status | `intent` \| `selected` \| `incorporated` \| `lease_signed` \| `renovation` \| `open` \| `closed` |
| intent_signed_at / selected_at / incorporated_at / lease_signed_at / renovation_at / opened_at / closed_at | 各节点时间点(状态步骤条) |
| fc_deposit_amount | 食阁押金 |
| drive_folder_id / notes / 审计列 | |

### mlk_payments 投资人付款进度
| 列 | 说明 |
|---|---|
| id / investor_id FK / store_id FK nullable | 服务费挂投资人(store 为空),投资款挂店 |
| kind | `instalment1..4` \| `fc_deposit` \| `service_tier1` \| `service_tier2_first` \| `service_tier2_second` |
| amount_due / amount_paid / paid_at | |
| status | `pending` \| `paid` \| `refunded`(押金可退) |
| notes | |

### mlk_ledger 夫妻逐月流水台账
| 列 | 说明 |
|---|---|
| id / couple_id FK / store_id FK nullable / month date | |
| kind | `advance_repay`(还垫款 4167)\| `retention_hold`(分红 30% 压存)\| `retention_refund`(年退 20%)\| `bond_paid` / `bond_refund`(入职保证金)\| `platform_fee`(10%)\| `mentor_income`(师徒分成) |
| amount / notes | 正=压入/缴,负=退还(约定统一) |

余额视图由 SUM 出:垫款剩余(50000−Σrepay)、分红保证金池、入职保证金余额。

### mlk_store_revenue 日营业额
| 列 | 说明 |
|---|---|
| id / store_id FK / date | unique(store_id, date) |
| turnover numeric | 折后实收 |
| source | `kitchen` \| `manual` |

### mlk_settlements 月结算
| 列 | 说明 |
|---|---|
| id / store_id FK / month date | unique(store_id, month) |
| turnover / net_profit / investor_payout / couple_payout / mgmt_payout | 快照 |
| detail jsonb | foodCourtCalc 完整结果(含构成明细) |
| created_by / created_at | |

生成:门店详情「生成月结算」按钮 → 取当月 Σ日营业额 + 关联食阁参数 → 跑 `calcAtRevenue`(还款期/还清后即第 1/2 年开关,按夫妻垫款是否还清自动选)→ 存快照。

## 3. 文件管理(复用网盘 drive_nodes)

- drive 根下自动维护目录:`陆老师厨房/门店|投资人|夫妻/<实体名>`。
- 实体创建时自动建文件夹并存 `drive_folder_id`;实体改名同步文件夹名。
- 详情页内嵌 **scoped 网盘面板**(复用 brochure 的 react-arborist 组件,root 限定为实体文件夹):门店放 SPV bizfile/股东协议/租约/牌照,投资人放 KYC/bizfile,夫妻放护照/EP/合同。

## 4. 页面(element-admin 骨架)

- `/franchise/mlk`:**Tabs 门店 | 投资人 | 夫妻**,各为标准列表页(筛选 + 表格 + 新建)。
  - 门店列表列:门店名/食阁/档口/投资人/夫妻/状态 Badge/开业日期/本月营业额。
  - 投资人列表列:姓名/公司/档次 Badge/门店数/KYC/PR。
  - 夫妻列表列:运营公司/丈夫/妻子/EP/PR/门店/垫款剩余/状态。
- `/franchise/mlk/stores/:id` 门店详情:
  - 顶部 sticky 操作条 + **生命周期 Stepper**(7 态,各节点日期可点改)。
  - 左(5):基本信息卡、**股权三方卡**(投资人 51%/夫妻 48%/Kaider 1%,前两个可点跳详情)、食阁预测关联(点开看该食阁测算)。
  - 右(7):**付款进度**(4 期+押金,进度条+明细表)、营业概览(本月/上月营业额、最近结算)。
  - 下方 Tabs:营业流水(日表,可手录/看来源)| 月结算(列表+生成按钮+构成浮框)| 文件(scoped 网盘)。
- `/franchise/mlk/investors/:id` 投资人详情:资料卡(档次/KYC/PR)| 名下门店卡片(每店付款进度、状态)| 服务费付款记录 | 文件。
- `/franchise/mlk/couples/:id` 夫妻详情:两人资料卡(证件/护照/EP/PR)| **钱的台账**(三个余额卡:垫款剩余/分红保证金池/入职保证金 + 逐月流水表可增删)| 所属门店 | 师徒(师傅链接+徒弟列表)| 文件。

## 5. Kitchen 营业额联动(API 契约)

- 新契约 `kitchen-revenue-feed`,lead: **kitchen**,consumer: **business-hub**。
- businessHub 需要:按 kitchen store id + 日期范围查询**日营业额(折后实收)**;鉴权方式由 kitchen 定(token)。
- businessHub 侧:定时(或手动「同步」按钮)拉取 → upsert `mlk_store_revenue`(source=kitchen)。
- 接口未就绪前手录可用(source=manual);kitchen 数据到达时覆盖同日 manual。
- 交付物:handoff prompt(按 dashboard api-contract-flow 规范起草,用户转发给 kitchen 会话)。

## 6. 交付清单(一期)

1. 菜单改名 + 新菜单 + `mlk.view/manage` 权限
2. migration 0069(7 张表)+ drizzle schema + shared zod + API routes(CRUD + 结算生成 + 营业额手录/同步占位)
3. 三列表 + 三详情页(含 Stepper、付款进度、台账、股权卡)
4. drive 文件夹自动创建 + 详情页 scoped 网盘面板
5. 月结算生成(复用 foodCourtCalc,含第 1/2 年自动判定)
6. kitchen-revenue-feed 契约草案 + handoff prompt 放 dashboard
7. i18n(zh/en)全量

## 7. 不做(一期明确排除)

- 师徒分成的自动计算(只记关系与手工台账行 mentor_income)
- 投资人月回款的自动打款/对账(结算只算应得,实付走台账手记)
- Kitchen 之外的 POS 对接
