# 财务系统 · 第 3 层模块 ⑥ 设计(新加坡报表导出 — 通用框架)

> 业主:导出符合新加坡会计标准的数据给专业会计审/报税。原则:内部只录基本数据(已具备:统一流水④ + 业务/类别),**输出自动专业化**。本模块做**通用框架**:从统一流水自动出损益表 + GST 估算,按新加坡会计科目归类,导出 CSV(Excel 直接打开,会计另存 xlsx / 套 Form C-S 模板)。具体 Form C-S / GST F5 / ACRA 模板字段,业主会计拿到后微调。

---

## 0. 现状与口径

- 数据源:`ledger_entries`(统一现金流水,direction in/out + business_id + expense_category_id + sgd_equivalent + occurred_at)——这是报表的唯一真相源(现金基础 cash basis)。
- `expense_categories`(可配置支出类别)、`businesses`(收入归属)、`companies`。
- **口径**:**现金基础(cash basis)** —— 简化录入的代价;权责发生制(accrual)调整由会计在导出后处理(spec 注明)。SGD 本位(RMB 已折算)。

---

## 1. 数据(migration `0017`,小改)

给 `expense_categories` 加报表归类:
```
ALTER expense_categories ADD report_section report_section NOT NULL default 'operating_expense';
```
新枚举 `report_section=[cost_of_sales, operating_expense, other]`。
seed 更新:现有 9 类默认 operating_expense(rent/utility/broadband/salary/cpf/levy/marketing/office),other→other;业主可改某类为 cost_of_sales。

---

## 2. 计算(api `reportUtils.ts`,纯聚合)

### 2.1 损益表 P&L(per 公司 或 全部,期间 from~to,按 occurred_at)
```
{
  company, period:{from,to}, basis:'cash',
  revenue: { lines:[{business_id,business_name,amount}], total },     // ledger in 按 business 分组
  cost_of_sales: { lines:[{category,amount}], total },                // ledger out 且 category.report_section='cost_of_sales'
  gross_profit,                                                        // revenue.total - cos.total
  operating_expenses: { lines:[{category,amount}], total },           // report_section='operating_expense'
  other_expenses: { lines:[{category,amount}], total },               // 'other' + 无类别的 out
  net_profit_before_tax                                               // gross_profit - opex.total - other.total
}
```
未归类的 out(expense_category_id 空)归 other_expenses「未分类」。

### 2.2 GST F5 估算(可选,标"估算")
GST 未逐笔记录 → 按可配置税率(默认新加坡 9%)估:
```
{ rate, output_tax_est: revenue.total*rate/(1+rate)(含税倒算) 或 revenue.total*rate(看口径,默认按含税倒算并注明),
  input_tax_est: taxable_expenses*rate/(1+rate), net_gst_est, note:'估算,未逐笔记录 GST,仅供参考' }
```
口径在代码注明;默认含税倒算(假设录入金额为含 GST 价)。

### 2.3 CSV 生成(零依赖,纯字符串)
把 P&L 拼成多段 CSV(中文/英文双列标题),UTF-8 BOM 开头(Excel 中文不乱码)。

---

## 3. API(`routes/reports.ts`,注册 index;权限 `finance.view`)

- `GET /reports/pnl?company_id=&from=&to=` → §2.1 JSON(company_id 省略=全部公司汇总 + 各公司分列)。
- `GET /reports/pnl.csv?company_id=&from=&to=` → CSV 下载(header `Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="pnl_<company>_<from>_<to>.csv"`,body 带 BOM)。
- `GET /reports/gst?company_id=&from=&to=&rate=` → §2.2。
- `routes/expenseCategories.ts`(模块④已有)PATCH 扩展支持 `report_section`。
- shared:`schemas/reports.ts`(查询参数 zod)+ report_section 加入 expenseCategory schema。

---

## 4. 前端(`apps/web/src/pages/finance/ReportsPage.tsx`,财务导航加子项「财务报表」)

- 选 公司(或全部)+ 期间(from/to,默认本月/本年)。
- **屏幕损益表**:收入(按业务)/ 销货成本 / 毛利 / 营业费用(按类别)/ 其它 / 税前净利,分段表格,数字右对齐,合计加粗。
- **GST 估算**卡(可折叠,标"估算仅供参考")。
- **「导出 CSV」按钮** → 调 `/reports/pnl.csv` 下载(blob)。
- 顶部说明条:「现金基础;权责发生制调整由会计处理;导出后可套 Form C-S / ACRA 模板」。
- 支出类别的 report_section 维护:在模块④的「支出类别」管理处加一列下拉(若该页存在),或本页提供入口。i18n 中英。

---

## 5. 验收

- `pnpm -r typecheck`、web build 全绿;migration 0017 本地 migrate。
- HTTP:`/reports/pnl?company_id=恺德&from=2026-06-01&to=2026-06-30` → 收入(目前恺德 ledger in=0,显示 0)/ 支出(房租 4000 + 测试 500 在 operating_expense)/ 税前净利(负);`/reports/pnl.csv` 返回带 BOM 的 CSV(curl 看到中文表头 + 数字)。改某类别 report_section=cost_of_sales → P&L 该类移到销货成本段。
- 数据稀疏(DEMO)时报表能正确显示 0/负,空段友好。

## 6. 不在本模块(业主会计接手)

- Form C-S / GST F5 / ACRA 的精确字段映射与官方模板(本模块出通用 P&L,会计套模板)
- 权责发生制(accrual)调整、折旧、预提
- 真正 xlsx 带格式(先 CSV;将来可加 exceljs)
- 多币种合并报表的本位币重估
