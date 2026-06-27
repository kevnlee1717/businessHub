# 外部分成人 + 对账单 + 业务员自助提成 设计(2026-06-27)

## 背景与问题

「分成对象」(`deal_parties`)目前只是**角色名单**(us/sales/hr_source/partner/referrer/landing/guarantor)。成交时引擎算出"分 X 给介绍人"的金额并存进 `deal_line_amounts`,但:
- 不知道是**哪个**介绍人(没有个人实体);
- 除 `sales` 外不生成任何应付/台账(`commission_entries.sales_id` 死绑 `employees`,仅业务员);
- 外部分成人看不到自己的提成。

业务员是特例:是员工(`employees` 即登录用户),已有 `commission_entries` → 工资条闭环。

## 业主已拍板的方向

1. **查看方式**:外部人**不登录**,每人一个**只读对账单**(token 链接,可打印);
2. **身份**:维护「外部分成人名单」,成交时**从名单选**具体是谁;
3. **结算**:外部提成**走收支台账出账 + 强制凭证**(复用模块④),出账即标已结;
4. **业务员**:也加「我的提成」自助页(复用现有 `commission_entries`)。

## 三个子项目

- **A** 外部分成人名单 + 成交挂人 + 外部提成台账 + 台账结算(核心)
- **B** 对账单(每人只读 token 页,依赖 A)
- **C** 业务员「我的提成」自助页(小、独立)

落地顺序 A → B;C 随时插空。

---

## 数据层(migration 0020)

### 新表 `external_parties`(外部分成人名单)
| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| party_id | uuid → deal_parties (set null) | 默认角色(介绍人/加盟商/落地方/担保人),用于分组展示 |
| name | text not null | 姓名或公司名 |
| name_en | text | |
| contact | text | 联系方式(电话/邮箱/微信,自由文本) |
| note | text | |
| active | boolean not null default true | |
| statement_token | text not null unique | 对账单链接 token(随机) |
| created_at | timestamptz not null default now | |

### 新表 `external_commission_entries`(外部提成台账)
镜像 `commission_entries`,但 payee 指向外部人、结算指向 ledger:
| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| payee_id | uuid → external_parties (cascade) not null | 哪个人 |
| billing_id | uuid → billing (cascade) not null | 哪个成交单 |
| business_id | uuid → businesses (set null) | 哪个业务 |
| party_id | uuid → deal_parties (set null) | 这单的角色 |
| period | text not null | YYYY-MM |
| recurrence | commission_recurrence enum not null | one_time/monthly(复用) |
| seq | int not null default 1 | |
| amount_sgd | numeric(12,2) not null | |
| status | commission_entry_status enum not null default 'pending' | pending/settled/void(复用) |
| ledger_entry_id | uuid → ledger_entries (set null) | 结算出账那笔流水 |
| source_line_id | uuid | 来源 scheme line(纯 uuid,不加 FK) |
| note | text | |
| created_at | timestamptz not null default now | |

### `billing` 加列
- `external_payees jsonb` `$type<Record<string,string>>`:成交时挂人,映射 `sourceLineId → payeeId`。物化时读它定 payee。与现有 `billing.inputs` jsonb 同风格。

### seed
- `external_parties`:不预置真人(业主自己录);仅保证表存在。
- `expense_categories` 加一条 `commission_payout` / 「分成支出」/ report_section=`operating_expense`(外部提成结算出账用)。幂等 upsert。

---

## API

### 物化引擎(复用 `commissionUtils` 思路)
`refreshExternalCommissionEntries(billingRow, tx)`:
- 取该 billing 的 `deal_line_amounts` 中 `kind=commission` 且 party 属于**外部角色**(party.code ∉ {`us`,`sales`})的行;
- 每行按 `billing.external_payees[source_line_id]` 找 payee_id;**无 payee 的跳过**(未挂人不生成);
- upsert `external_commission_entries`(key = billing_id+source_line_id+period+seq);**preserve settled**(已结算的不动,只重算 pending);
- 在 billing create/update 事务里调用(与 `refreshSalesCommissionEntries` 并列)。

### 路由
- `externalParties`:`GET/POST/PATCH/DELETE /external-parties` + `POST /external-parties/:id/rotate-token`。权限 `finance.view`/`finance.manage`。
- `externalCommission`:
  - `GET /external-commission/entries`(筛 payee_id/business_id/status)、`/summary`、`POST /external-commission/recompute`;
  - `POST /external-commission/:id/settle`:body 带凭证 `proof_document_ids`(空→422 proof_required),建一笔 ledger **out** 流水(category=commission_payout,business=该单业务,挂凭证),设 entry.status=settled + ledger_entry_id。复用模块④ ledger 写入。
- `billing`:create/update schema 加 `external_payees`(可选 record);存到 `billing.externalPayees`。
- `commission`(自助):`GET /commission/mine` → `commission_entries` where `sales_id = request.user.id`(员工即用户),权限 `commission.view_own`,返回每笔:订单/业务/期间/金额/状态/payslip_id。
- `statement`(**公开,无 JWT**):`GET /statement/:token` → 按 token 找 payee,返回 payee 基本信息 + 其 `external_commission_entries`(连带 billing/业务/客户名、成交日)+ 合计(累计/已结/未结)。**注册在 authenticate hook 之外**,只读、只返回该 payee 数据。

### 权限
`commission.view_own` 已定义,给 sales 角色补上(若未含)。`statement` 无需权限(token 即凭据)。

---

## 前端

- **设置→外部分成人**:列表(按默认角色分组)+ 增删改 + 复制对账单链接。
- **成交单表单**:对每个外部分成行,下拉选 payee(名单),提交进 `external_payees`。
- **财务→外部提成台账**:筛选 payee/业务/状态;每笔可"结算"(传凭证→出账→标已结);合计卡。
- **对账单页 `/statement/:token`**:公开路由(无侧边栏/无需登录),展示该人的明细 + 合计 + 打印按钮。
- **我的提成页**(sales 角色可见):看自己每笔(订单/金额/状态/是否进工资条),只读。

## 验收
- `pnpm -r typecheck` 4 包绿;
- 端到端:建外部人张三(介绍人)→ 建带"介绍人10%"分成的成交单并挂张三 → 外部台账出现待结 entry → settle(无凭证422、有凭证→出 ledger 出账 + 标已结)→ 打开张三 statement token 页看到该笔(已结)+ 合计;业务员 commission/mine 返回自己的提成。

## 非目标(YAGNI)
- 外部人登录/账号体系;
- 对账单花哨 PDF 模板(浏览器打印即可);
- 一单同角色多人分(先一行一人;真要多人再说);
- 业务员改对账单口径(保持工资条流程,仅加只读自助页)。
