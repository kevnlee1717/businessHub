# businessHub 系统设计文档（框架版）

> 日期：2026-06-25
> 状态：框架设计，已与业主确认方向，待写实现计划
> 性质：新加坡移民/留学中介 + 自有学校的「公司人员管理 + 业务管理」内部系统

---

## 0. 背景与目标

一家新加坡移民/留学中介公司，旗下还有自己的学校。需要一套**纯内部**的管理系统，覆盖：

- 5 类业务：EP 申请、ICA 入境申诉、成人大专、成人英语、WSQ 课程
- 人事：员工/老师/校长/摄影师等角色、考勤、任务、工资（含 CPF / 劳工税 / 中国公积金）
- 文档管理：客户资料库、公司实体文件库、合同版本库

设计原则：**先抽共性、分层搭框架，跑通后再优化**（业主明确要求）。

### 关键约束（已确认）

| 项 | 决策 |
|---|---|
| 系统边界 | 纯内部，仅员工登录；学生端以后单独做再对接 |
| 界面语言 | 中文为主，**中英文可一键切换（i18n 第一优先做好）** |
| 货币 | 总价以 **SGD** 为准；客户用 RMB 付款时**手动输入当天汇率确认**，记录 RMB 金额 + 汇率 + 折算 SGD；中国团队工资用 RMB |
| 角色 | **一人一角色**（角色枚举挂在员工上，权限按角色在代码里映射） |
| 提成 | **百分比 / 固定金额两种都支持，每单可选**；每类业务有默认值，每个销售/每单可调 |
| 文件分类 | **预设 + 可自增减**（分类是可管理的表，带默认种子） |
| 检索 | **先做元数据搜索**；全文检索（提取正文）以后再加 |
| 到期提醒 | 先不做，只存文件 |
| 公司费用 | 月租等**记金额 + 费用统计**，可挂文件 |

---

## 1. 技术栈

- **后端**：Fastify + Drizzle ORM + PostgreSQL（轻量、贴合团队熟悉的 Drizzle）
- **前端**：React + Vite + **Mantine**（组件齐全、轻量、适合表格/表单/审批流多的内部系统）
- **i18n**：react-i18next（中/英 JSON 两份，右上角一键切换）
- **数据请求**：TanStack Query
- **表单**：react-hook-form + zod
- **共享**：zod schema + 类型在 `packages/shared` 一处定义，前后端共用
- **文件预览**：PDF（pdf.js）、图片（原生）、Word（服务端转 PDF 预览）；全部可下载

### 仓库结构（pnpm monorepo）

```
businessHub/
├─ apps/
│  ├─ api/        # Fastify + Drizzle 后端
│  └─ web/        # React + Vite + Mantine 前端
├─ packages/
│  ├─ shared/     # 共享 zod schema、类型、枚举、i18n key
│  └─ db/         # Drizzle schema + migrations
└─ docker-compose.yml   # PostgreSQL + 后续部署
```

---

## 2. 架构分层

三个功能层 + 一个横跨全系统的文档层，构建顺序自上而下：

1. **平台地基层**：登录/员工、角色权限、文档模型、金额&账单&收款、提成引擎
2. **人事层**：考勤、任务、工资（CPF/劳工税/公积金 + 发放与缴纳记录）
3. **业务层**：
   - 案件流程引擎：EP 申请 + ICA 申诉（共用可配置多步骤引擎）
   - 教育模块：成人大专、成人英语、WSQ
4. **文档管理层（DMS）**：横跨全系统——客户资料库、公司实体文件库、合同版本库

> 文档模型属于地基；三个「库」是按归属对象过滤出的视图，分散在各模块落地。

**建议构建顺序**：地基（含文档模型）→ 人事 → 案件引擎（EP/ICA）→ 教育模块 →（合同库 / 公司实体库可在其后或穿插）。

---

## 3. 数据模型

### 3.1 平台地基层

**employees（员工，同时是登录账号）**
- 基本信息：name, name_en, email, phone, password_hash
- `role`：单一角色枚举（见 §4）
- `employment_type`：full_time / part_time
- `status`：active / left；join_date
- `payroll_scheme`：`cpf`（新加坡公民/PR）｜`levy`（马来/外籍劳工税）｜`china_fund`（中国公积金）｜`none`
- `base_salary` + `salary_currency`（SGD / RMB）

**document_categories（文件分类，可管理）**
- id, name, name_en, parent_id（可选层级）, is_system（系统种子）, active
- 默认种子：护照、学历证明、合同、租房合同、bizfile、收据、其它…

**documents（统一文档模型，多态）**
- id, storage_path, filename, mime, size, uploaded_by, uploaded_at
- `subject_type` + `subject_id`：归属对象（client / company / case_step / payment / contract_version …）
- `client_id`（可空）：用于自动汇总进客户资料库
- `category_id`：分类
- `tags`（自由标签数组）
- 文件传入某步骤「必需文件槽」时，自动继承该槽的分类 + 盖上案件的 client_id → 自动归档

**billing（账单，多态，所有业务复用）**
- `ref_type`：ep / ica / diploma / english / wsq
- `ref_id`
- `total_price_sgd`、`deposit_sgd`（**可改，带修改记录**）
- `status`：unpaid / partial / paid
- `sales_id`（销售）
- `commission_type`：percent / fixed
- `commission_value`（每单可调，默认值来自业务类型配置）
- `commission_amount_sgd`（算出的提成额）

**price_adjustments（改价记录）**：billing_id, field, old_value, new_value, changed_by, changed_at

**payments（收款，挂在 billing 下）**
- id, billing_id
- `paid_currency`：SGD / RMB
- `paid_amount`
- `fx_rate`（RMB 付款时手动输入当天汇率）
- `sgd_equivalent`（折算后冲抵余额）
- `type`：deposit / final / installment
- recorded_by, paid_at, note
- 可带附件（documents 挂到此 payment）
- 「分期付了几次」= 数此表记录

### 3.2 业务层 · 案件流程引擎（EP / ICA 共用）

**workflow_templates（模板）**：id, business_type（ep/ica）, name

**template_steps（模板步骤，可配置定义）**
- id, template_id, `order`, name, name_en
- `description`（可改）
- `required_documents`：JSON 清单 [{name, name_en, required}]（**可改**）
- `default_assignee_role`

**cases（案件实例，ep/ica 共用 + business_type 区分）**
- id, business_type, client_id, `current_step`, `status`, billing_id
- ICA 额外：`guarantor_name`, `guarantor_relation`, `guarantor_contact`（担保人是谁）

**case_steps（实例步骤，建案时从模板快照）**
- id, case_id, `order`, name, name_en, description, `assignee_id`（本步负责人）
- `status`：pending / in_progress / done；completed_at
- **每个案件可独立调顺序/改内容/标完成**，互不影响；改模板只影响以后新案件

**case_step_documents（步骤必需文件）**
- id, case_step_id, doc_name, doc_name_en, is_required
- `status`：missing / uploaded；document_id（已传的文件）
- **缺件自动提示、步骤是否完成自动判断**

**follow_ups（跟进）**
- id, case_step_id, author_id, content, created_at
- 可带附件（documents 挂到此跟进）

### 3.3 人事层

**attendance（考勤）**
- id, employee_id, date, check_in, check_out
- `status`：present / leave / absent；note
- 员工/老师/摄影师都能打

**tasks（任务管理）**
- id, title, description, assignee_id, creator_id, due_date
- `status`：todo / doing / done；priority
- 可关联案件/课程（ref_type + ref_id）；可带附件

**payroll_settings（系统工资配置，可配置不写死）**
- CPF 比例（按年龄段：员工部分 / 雇主部分）
- 劳工税额（levy）
- 中国公积金比例
- 费率会变 → 全部可配

**payslips（工资单 = 发放记录）**
- id, employee_id, period（月份）
- base, allowances, `commission_total`（当月成交单算出）
- `cpf_employee`, `cpf_employer`, `levy`, `china_fund`（按 payroll_scheme 计）
- `net_pay`, currency
- `status`：draft / paid；paid_at, paid_by
- **所有发放都有记录**

**statutory_payments（缴税/缴金记录）**
- id, type（cpf / levy / china_fund）, period, employee_id（或批次）, amount, paid_at, reference
- **CPF / 劳工税 / 公积金各自有缴纳记录**

> 提成流转：单据成交/收款后算出销售提成 → 工资期内汇总进该员工 payslip 的 commission_total。

### 3.4 业务层 · 教育模块（学生现仅为数据，不登录）

**students（教育模块共用学生表）**：id, name, name_en, 联系方式, note

**成人大专 diploma_enrollments**
- student_id, program, enroll_date, billing_id（总价 + 分期次数）
- `installments_count`（约定分期次数；已付次数 = 数 payments）
- `graduated`（是否毕业）

**成人英语**
- `english_levels`：id, name, level, price_sgd, duration（等级/收费/时长）
- `english_classes`（排课）：level_id, teacher_id, schedule（星期/时间）, start_date, end_date
- `english_enrollments`：student_id, class_id/level_id, enroll_date, billing_id
- `english_attendance`：enrollment_id, session_date, present（每节课考勤 → 算「上了多久」）

**WSQ 课程**
- `wsq_courses`：name, content, start_date, duration, teacher_id, price_sgd, `min_students`（最低开课人数）
- `wsq_enrollments`：student_id, course_id, billing_id
- 报名人数 vs min_students → **能否开课自动判断**

> 所有教育模块走共用 billing / payments → 销售 + 提成统一处理。

### 3.5 文档管理层（DMS）

复用 §3.1 的 `documents` + `document_categories`。三个「库」是视图：

- **客户资料库**：`documents WHERE client_id = X` 按 category 分组；案件各步骤上传的文件自动盖 client_id 归入
- **公司实体文件库**：见下 companies + company_expenses
- **合同版本库**：见下 contracts + contract_versions

**companies（公司实体）**
- id, name, name_en, uen, status, note

**company_expenses（公司费用，记金额 + 统计）**
- id, company_id, `type`（rent / utility / other）, amount, currency, `period`（月份）, paid_at, note
- document_id（可挂对应文件，如月租收据）
- 支持按公司 / 月份统计支出

**contracts（合同）**
- id, `subject_type` + `subject_id`（关联 case / enrollment / company / client）
- title, party 信息, `status`, `current_version_no`

**contract_versions（合同版本）**
- id, contract_id, `version_no`, document_id（该版本文件）, created_by, created_at, note
- `status`：draft / signed / superseded

**检索（v1：元数据）**：按 客户 / 公司 / 分类 / 标签 / 日期 / 文件名 过滤。全文检索（上传时提取 PDF/Word 正文建索引）列为后续增强。

---

## 4. 角色与权限（RBAC）

每个人首先都是**员工**（有档案、考勤、工资），再挂**单一角色**，权限按角色在代码里映射。

| 角色 | 主要权限 |
|---|---|
| **老板 / 超管 (owner)** | 全部，含财务、工资、汇率、系统配置 |
| **管理员 / HR (admin)** | 员工档案、角色分配、考勤、工资发放 |
| **会计 (accountant)** | 参与 EP 步骤、收款/付款、定金尾款、工资税务记录 |
| **文员 (clerk)** | EP/ICA 案件主力：步骤跟进、上传文件、改进度 |
| **销售 (sales)** | 建案/招生、看自己的单和提成 |
| **老师 (teacher)** | 课程、排课、考勤、看自己工资（区分全职/兼职） |
| **校长 (principal)** | 学校层管理：课程、老师、学生（教育模块） |
| **摄影师 (photographer)** | 任务、考勤、看自己工资 |

---

## 5. i18n 策略（第一优先）

- 界面文字：react-i18next，中/英 JSON 两份，右上角一键切换
- 业务内容需双语处：用 `name` + `name_en` 双字段（步骤名、分类名、等级名等）

---

## 6. 暂不做（YAGNI / 后续）

- 客户/学生自助登录端（以后单独系统对接）
- 文件全文内容检索（先做元数据搜索）
- 文件到期提醒（bizfile/租约/护照）
- 多角色叠加（当前一人一角色）

---

## 7. 待业主后补的内容

- EP 申请的详细步骤流程
- ICA 申诉的详细步骤流程
- CPF / 劳工税 / 公积金的具体费率
- 各业务的默认提成数字
