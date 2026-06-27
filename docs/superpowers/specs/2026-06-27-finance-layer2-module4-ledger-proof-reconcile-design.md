# 财务系统 · 第 2 层模块 ④ 设计(收支总账本 + 强制凭证 + 对公账户对账)

> 业主反复强调的账务地基:
> - 「系统里每一个地方的收款、付款都必须有截图凭证。」
> - 「每个公司都有一个对公账户,每一笔的进出跟公户上的明细要对得起来。」
> - 「每一笔的收入支出都要跟业务或者开支类别对应起来。方便以后查账、对账。」
>
> 本模块建立**统一现金流水账(cash book)**:每一笔进出都落一行,带【公司 + 对公账户 + 方向 + 金额 + 对应(业务/支出类别)+ 强制凭证 + 对账状态】,并能与导入的**对公账户明细**逐笔对账。

---

## 0. 现状与复用

- `documents`:多态凭证(subject_type/subject_id + category + tags),有 `POST /documents` multipart 上传。→ **凭证全部走它**,流水行存 `proof_document_ids uuid[]`。
- `payments`(收款,挂 billing)、`company_expenses`(支出,挂 company,type 粗枚举 rent/utility/other,有 documentId)。→ 这两个是现有的"进/出"来源,本模块**把它们桥接进统一流水**,而非废弃。
- `companies`、`businesses`(模块①,业务归属)。
- 金额内部本位币 SGD,RMB 用 fx 折算(沿用 payments 口径)。

---

## 1. 数据模型(新增,migration 预计 `0013`)

### 1.1 `bank_accounts`(对公账户,每公司可多个)
```
bank_accounts {
  id uuid PK
  company_id uuid → companies NOT NULL (cascade)
  name text NOT NULL            # 账户别名:DBS 主账户
  bank_name text                # 开户行
  account_no text               # 账号(可空/脱敏)
  currency currency NOT NULL default 'SGD'
  is_primary boolean default false   # 公司主账户(每公司至多一个 true,应用层保证)
  active boolean default true
  note text
  created_at timestamptz default now()
}
```

### 1.2 `expense_categories`(支出类别,可配置,取代粗枚举)
```
expense_categories {
  id uuid PK
  code text UNIQUE             # rent/utility/broadband/salary/cpf/levy/marketing/rental_deposit/other...
  name text NOT NULL
  name_en text
  active boolean default true
  is_system boolean default false
}
```
> 种子:房租 rent、水电 utility、宽带 broadband、工资 salary、CPF cpf、劳工税 levy、市场推广 marketing、办公杂费 office、其它 other。`company_expenses.type` 旧枚举保留兼容,新流水用 `expense_category_id`。

### 1.3 `ledger_entries`(统一现金流水 = cash book 核心)
```
ledger_entries {
  id uuid PK
  company_id uuid → companies NOT NULL
  bank_account_id uuid → bank_accounts (可空:现金/未指定账户)
  direction ledger_direction NOT NULL        # in(收) / out(付)
  amount numeric(12,2) NOT NULL              # 原币金额
  currency currency NOT NULL default 'SGD'
  fx_rate numeric(12,6)                       # 非 SGD 时换算率
  sgd_equivalent numeric(12,2) NOT NULL       # 折算 SGD(本位)
  occurred_at timestamptz NOT NULL            # 资金发生日期
  # 对应(二选一,按 direction):
  business_id uuid → businesses (可空)         # in 通常挂业务(哪个业务的收入)
  billing_id uuid → billing (可空)             # in 可进一步挂到具体成交单
  expense_category_id uuid → expense_categories (可空)  # out 挂支出类别
  counterparty text                            # 对方(客户/供应商/员工名)
  # 凭证(强制):
  proof_document_ids uuid[] NOT NULL default '{}'   # ≥1,API 层强制
  # 来源桥接:
  source_type ledger_source NOT NULL default 'manual'  # manual / payment / company_expense
  source_id uuid                               # 对应 payments.id 或 company_expenses.id
  # 对账:
  reconcile_status reconcile_status NOT NULL default 'unreconciled'  # unreconciled/reconciled/ignored
  statement_line_id uuid → bank_statement_lines (可空)
  note text
  recorded_by uuid → employees
  created_at timestamptz default now()
}
```
新枚举:`ledger_direction=[in,out]`、`ledger_source=[manual,payment,company_expense]`、`reconcile_status=[unreconciled,reconciled,ignored]`。

### 1.4 `bank_statement_lines`(对公账户明细,用于对账)
```
bank_statement_lines {
  id uuid PK
  bank_account_id uuid → bank_accounts NOT NULL (cascade)
  occurred_at timestamptz NOT NULL
  direction ledger_direction NOT NULL
  amount numeric(12,2) NOT NULL
  currency currency NOT NULL default 'SGD'
  description text                  # 银行流水摘要
  balance_after numeric(12,2)       # 该笔后余额(可空)
  import_batch text                 # 导入批次标识(同一次导入同值)
  matched boolean default false
  ledger_entry_id uuid → ledger_entries (可空,匹配到的系统流水)
  note text
  created_at timestamptz default now()
}
```

---

## 2. 关键规则

1. **强制凭证**:`POST/PATCH ledger_entries` 时 `proof_document_ids` 必须非空(≥1),否则 422。前端先 `POST /documents`(subject_type='ledger_entry')上传得到 id,再带进来。
2. **进出必有归属**:`direction=in` 必须有 `business_id`(可再挂 billing_id);`direction=out` 必须有 `expense_category_id`。API 层校验。
3. **桥接(不破坏现有流程)**:
   - 记 `payment`(收款)时,**自动生成**一条 `ledger_entries`(direction=in,source=payment,金额/币种/sgd 同 payment,business_id/billing_id 从 billing 推,proof 取该 payment 已挂的 documents;**若无凭证则该流水标 `proof_missing` 警告**,见 §4 校验报表)。
   - 记 `company_expense`(支出)时,自动生成一条 `ledger_entries`(direction=out,source=company_expense,expense_category 从旧 type 映射,proof 取 expense.documentId)。
   - 提供一次性**回填脚本**把存量 payments / company_expenses 生成流水(当前 payments 0 行;company_expenses 视实际)。
4. **对账**:某账户某期,系统流水(ledger_entries WHERE bank_account_id)对账户明细(bank_statement_lines)逐笔配对:
   - **自动建议**:同 account、同 direction、金额相等、occurred_at 在 ±N 天(默认 3)→ 候选匹配。
   - **确认匹配**:写 ledger_entries.statement_line_id + reconcile_status=reconciled,bank_statement_lines.matched=true + ledger_entry_id。
   - **未匹配两侧高亮** + 合计核对(系统流水合计 vs 明细合计,应相等)。

---

## 3. API(新路由,注册进 index;权限 `finance.manage` 写 / `finance.view` 读)

- `routes/bankAccounts.ts`:`GET/POST/PATCH /bank-accounts`(可 ?company_id=;设主账户)。
- `routes/expenseCategories.ts`:`GET/POST/PATCH /expense-categories`(is_system 禁改 code/删)。
- `routes/ledger.ts`:
  - `GET /ledger`(筛选 company_id/bank_account_id/direction/business_id/expense_category_id/period[from,to]/reconcile_status;返回行 + 合计 in/out/净)
  - `POST /ledger`(强制 proof + 归属校验;算 sgd_equivalent)
  - `PATCH /ledger/:id`、`DELETE /ledger/:id`(manual 来源可删;桥接来源只读关键字段)
- `routes/reconcile.ts`:
  - `POST /bank-accounts/:id/statement-lines`(批量导入明细,带 import_batch)、`GET /bank-accounts/:id/statement-lines`
  - `GET /bank-accounts/:id/reconcile?from=&to=`(返回:系统流水未对 + 明细未匹配 + 自动建议配对 + 两侧合计)
  - `POST /reconcile/match`(body {ledger_entry_id, statement_line_id} → 确认匹配)、`POST /reconcile/unmatch`、`POST /ledger/:id/ignore`(标记 ignored,如银行手续费无需系统流水)
- shared:`packages/shared/src/schemas/ledger.ts` 全套 zod + 桥接用的 ledger 行写入 helper(放 api `financeUtils` 或新 `ledgerUtils.ts`)。
- 桥接:改 `routes/billing.ts` 记 payment 处 + `routes/companyExpenses.ts` 记支出处,事务内顺带 upsert 一条 ledger_entry(同一 source_id 幂等)。

---

## 4. 校验/查账辅助

- `GET /ledger/proof-missing`:列出 `proof_document_ids` 为空的流水(尤其桥接来的缺凭证收款/支出)→ 提醒补传截图。**这是"每笔必须有凭证"的兜底视图。**
- `GET /ledger/uncategorized`:列出缺 business_id/expense_category_id 的流水。

---

## 5. 前端(`apps/web/src/pages/finance/` 下新增,挂财务导航)

- **对公账户**页:按公司列账户,增改、设主账户。
- **收支流水**页:筛选条(公司/账户/方向/类别/业务/期间)+ 流水表(日期/方向/金额/币种/对应业务或类别/对方/凭证缩略/对账状态)+ 顶部合计(收/付/净)。「新增流水」Modal:方向、金额币种、账户、按方向选业务或支出类别、对方、**上传凭证(必填,复用 documents 上传)**、备注。行内可看凭证、标记 ignored。
- **对账**页:选账户 + 期间 → 左「系统流水未对」/ 右「账户明细未匹配」并排 + 中间自动建议配对(一键确认)+ 顶部两侧合计与差额。明细导入:粘贴/表单批量录入(CSV 解析列为后续增强)。
- **凭证缺失**提醒条:`proof-missing` 有数据时在财务首页/流水页顶部红条提示「N 笔缺凭证待补」。
- i18n 中英;沿用 Mantine + react-query。

---

## 6. 迁移/seed

- migration `0013`:4 新表 + 3 枚举。
- seed:`expense_categories` 9 个系统种子(幂等);为现有 2 公司(JUYI/恺德)各建 1 个 `bank_accounts`(is_primary,DEMO 可改);桥接回填存量 payments/company_expenses(当前 payments 0、expenses 视实际)。
- 演示:给恺德上月那条 `[DEMO] 月租` company_expense 桥接出一条 out 流水(挂 salary/rent 类别),并造 1~2 条 bank_statement_lines 演示对账(一条可自动匹配、一条故意对不上)。

---

## 7. 验收

- `pnpm -r typecheck` 全绿;web build 过;migration 0013 本地 migrate 成功。
- 真实 HTTP:建对公账户 → 录一条 out 流水(不传凭证应 422,传了成功)→ 导入 2 条明细 → reconcile 返回 1 条自动建议 → 确认匹配后两侧合计相等、该流水 reconcile_status=reconciled。
- `proof-missing` / `uncategorized` 视图能正确列出缺口。

## 8. 不在本模块(后续)

- CSV/银行 API 自动导入明细(先手工录入/粘贴)
- 多账户币种混合的本位币统一报表(→ ⑥)
- 复式记账科目映射(简化路线不做总账借贷,→ 仅 ⑥ 导出时映射)
- 自动催缴 / 审批流
