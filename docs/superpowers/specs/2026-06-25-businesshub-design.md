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
| 系统入口 | PC 后台（管理）+ 移动 App（考勤/外勤，Capacitor 原生）共享同一后端 |
| 考勤 | 一人多打卡点；外出销售用 GPS+人脸打卡、到点 faceid+照片+GPS 外勤汇报、后台 GPS 轨迹（参考 ifm） |
| 人脸识别 | 复用 ifm 的 Python 人脸微服务方案，businessHub 自建实例（用商用模型 webface_r50） |

---

## 1. 技术栈

**PC 后台（主入口）**
- **后端**：Fastify + Drizzle ORM + PostgreSQL（轻量、贴合团队熟悉的 Drizzle）
- **前端**：React + Vite + **Mantine**（组件齐全、轻量、适合表格/表单/审批流多的内部系统）
- **i18n**：react-i18next（中/英 JSON 两份，右上角一键切换）
- **数据请求**：TanStack Query；**表单**：react-hook-form + zod
- **共享**：zod schema + 类型在 `packages/shared` 一处定义，前后端共用
- **文件预览**：PDF（pdf.js）、图片（原生）、Word（服务端转 PDF 预览）；全部可下载

**移动端（考勤 / 外勤入口，参考 ifm）**
- **Capacitor** 把 React 包成 iOS/Android 原生 App（后台 GPS 必须原生，PWA 做不到）
- 插件：`@capacitor/geolocation`（定位）、`@transistorsoft/capacitor-background-geolocation`（后台持续轨迹）、`@capacitor-community/sqlite`（离线点位队列）、`@capacitor/preferences`
- 前端活体：`@mediapipe/tasks-vision`（眨眼/张嘴/转头动作）+ 炫光颜色挑战；`browser-image-compression`（压图）
- 地图：`leaflet`（轨迹/点位可视化）

**人脸识别微服务（复用 ifm 方案，businessHub 自有实例）**
- 独立 **Python FastAPI** 服务（端口 17010，自己的 systemd 单元 `Restart=always`）
- InsightFace **`webface_r50`**（512 维，可商用 license；**不用 buffalo_l**）+ Silent-Face 活体（onnxruntime）
- API：`/v1/embed`、`/v1/compare`、`/v1/liveness`、`/healthz`
- 代码从 `~/project/ifm/face-service` 拷入 `services/face`，不依赖 ifm 运行实例

### 仓库结构（pnpm monorepo）

```
businessHub/
├─ apps/
│  ├─ api/        # Fastify + Drizzle 后端
│  ├─ web/        # PC 后台 React + Vite + Mantine
│  └─ mobile/     # 移动端 React + Capacitor（考勤/外勤）
├─ packages/
│  ├─ shared/     # 共享 zod schema、类型、枚举、i18n key
│  └─ db/         # Drizzle schema + migrations
├─ services/
│  └─ face/       # Python FastAPI 人脸微服务（拷自 ifm，用 webface_r50）
└─ docker-compose.yml   # PostgreSQL + 后续部署
```

### 部署事实（实现产物，便于部署参照）

- 固定专用端口（Vite/Fastify strictPort）：**api 3011 / web 5190**、人脸微服务 17010（本机多项目，避端口冲突选定）
- seed 默认 owner 账号：`admin@bh.local` / `changeme`（首次登录后应改）
- seed 默认文件分类 7 个：护照、学历证明、合同、租房合同、bizfile、收据、其它

---

## 2. 架构分层

三个功能层 + 一个横跨全系统的文档层，构建顺序自上而下：

1. **平台地基层**：登录/员工、角色权限、文档模型、金额&账单&收款、提成引擎
2. **人事层**：考勤（多打卡点 / 人脸 / GPS 外勤汇报 / 轨迹）、任务、工资（绩效组合 + CPF/劳工税/公积金 + 发放与缴纳记录）
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
- `company_id`：所属公司（见 §3.5 companies）
- `position_id`：岗位（见 §3.3 positions）
- `employment_type`：full_time / part_time
- `status`：active / left；join_date
- `payroll_scheme`：`cpf`（新加坡公民/PR）｜`levy`（马来/外籍劳工税）｜`china_fund`（中国公积金）｜`none`（**个人属性，可空**）
- `salary_currency`：SGD / RMB
- 具体薪酬（底薪 / 各项奖金 / 提成默认 / 发薪日）来自薪酬配置（见 §3.3），不直接存在员工上

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
  > 业务约束：ICA 申诉的担保人**须为新加坡公民/PR**（用户明确要求"需要新加坡的担保人担保"）——录入时应校验/提示。

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

**考勤**：含多打卡点、人脸验证、GPS 围栏、外勤汇报、轨迹跟踪，详见 §3.6（员工/老师/摄影师都能打）。按天汇总的 `attendance_days.status` 直接喂给绩效评分的"全勤达标"判定。

**tasks（任务管理）**
- id, title, description, assignee_id, creator_id, due_date
- `status`：todo / doing / done；priority；`completed_at`、`on_time`（是否按时完成，自动判断）
- `satisfaction_rating`（满意度评分 1–5）、`rated_by`、`rated_at`（**由任务创建人/派发人打分**）
- 可关联案件/课程（ref_type + ref_id）；可带附件

工资不是固定数字，而是 **绩效组合工资**：底薪 + 各项奖金×对应绩效得分 + 提成 − 法定扣除。

#### 薪酬配置（两层：公司×岗位模板 + 个人覆盖）

**positions（岗位）**：id, name, name_en, note

**compensation_templates（薪酬模板，按 公司 × 岗位）**
- id, company_id, position_id（唯一组合）
- `base_salary`（底薪）、`salary_currency`
- `attendance_bonus`（全勤奖，**达标制**）
- `task_completion_bonus`（任务完成度奖，**百分比折算**）
- `task_satisfaction_bonus`（任务满意度奖，**百分比折算**）
- `kpi_bonus`（KPI 奖，**百分比折算**）
- `default_commission_type` / `default_commission_value`（提成默认）
- `payday`（发薪日 1–28）
- 所有字段可空

**employee_compensation（个人薪酬覆盖）**
- id, employee_id（唯一）
- 与模板相同的全套字段，**全部可空**
- 取值顺序：个人值 ?? 模板值（公司×岗位）?? 不适用/0

> CPF / 劳工税 / 公积金是否适用看员工的 `payroll_scheme`（个人属性，可空）。

#### 绩效评分（月度，系统自动算 + 可人工调）

**performance_scores（每员工每月一行）**
- id, employee_id, period（月份）
- `attendance_qualified`：是否全勤达标（bool）
- `task_completion_pct`：按时完成的到期任务比例
- `task_satisfaction_pct`：当月被评分任务满意度均值归一
- `kpi_pct`：KPI 达成率
- 每项存 `auto_value`（系统算）+ `manual_override`（可空）；最终取 override ?? auto

自动算规则（默认，阈值可在 payroll_settings 配）：
- 全勤达标：当月无缺勤/迟到（允许迟到次数可配）→ bool
- 任务完成度：当月到期任务中按时完成的比例
- 任务满意度：当月被评分任务满意度均值归一到 %
- KPI 达成：见 kpi_targets，封顶 100%（可配是否允许超 100%）

**kpi_targets（KPI 目标，主要给销售，可空表示无 KPI）**
- id, employee_id, period, `metric`（如成交额 / 成交单数）, `target`, `actual`（可系统从 billing/cases 自动算或人工填）, `achievement_pct`

#### 月工资计算 + 发放/缴纳记录

**payslips（工资单 = 发放记录，绩效组合）**
- id, employee_id, period、`payday`（该期计划发薪日）
- `base_salary`
- `attendance_bonus_paid` = 达标 ? 全勤奖 : 0
- `task_completion_bonus_paid` = 任务完成度奖 × task_completion_pct
- `task_satisfaction_bonus_paid` = 任务满意度奖 × task_satisfaction_pct
- `kpi_bonus_paid` = KPI 奖 × kpi_pct
- `commission_total`（当月成交单算出）
- `gross`、`cpf_employee` / `cpf_employer` / `levy` / `china_fund`（按 payroll_scheme，可空）、`other_deductions`
- `net_pay`, currency
- `status`：draft / paid；paid_at, paid_by
- **所有发放都有记录**

计算公式：

```
全勤奖   = attendance_qualified ? attendance_bonus : 0          (达标制)
完成度奖 = task_completion_bonus   × task_completion_pct        (百分比折算)
满意度奖 = task_satisfaction_bonus × task_satisfaction_pct      (百分比折算)
KPI 奖   = kpi_bonus × kpi_pct                                  (百分比折算)
gross    = base_salary + 全勤奖 + 完成度奖 + 满意度奖 + KPI 奖 + commission_total
net_pay  = gross − cpf_employee − levy − china_fund − other_deductions
```

**payroll_settings（系统工资配置，可配不写死）**
- CPF 比例（按年龄段：员工部分 / 雇主部分）
- 劳工税额（levy）、中国公积金比例
- 全勤达标阈值（允许迟到次数等）、KPI 是否封顶 100%
- 费率/规则会变 → 全部可配

**statutory_payments（缴税/缴金记录）**
- id, type（cpf / levy / china_fund）, period, employee_id（或批次）, amount, paid_at, reference
- **CPF / 劳工税 / 公积金各自有缴纳记录**

> 提成流转：单据成交/收款后算出销售提成 → 工资期内汇总进 payslip 的 commission_total。

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

### 3.6 考勤与外勤（参考 ifm，复用其方案）

照片（自拍/现场照）一律走 §3.1 的 `documents` 模型，按 `uploads/visits/YYYY/MM/<uuid>.<ext>` 分目录存。

#### 打卡点（一人多打卡点）

**clock_points（打卡点）**：id, name, name_en, `lat`, `lng`, `radius_m`（围栏半径，默认 200）, company_id（可选关联公司）, active

**employee_clock_points（员工 ↔ 打卡点，多对多）**：employee_id, clock_point_id → **一人多打卡点** ✓

> 进阶（参考 ifm `company_assignments`，留待 Phase 2）：员工 ↔ 公司可带**历史分配**——主公司 + 副公司、生效/失效时间、软删除（status ACTIVE + ended_at）；打卡时取当前生效公司为打卡地点。Phase 1 先用静态 `employee_clock_points` 表达"一人多点"，不带时间维度。

**work_shifts（班次，判定迟到/早退）**：按角色/岗位或个人，`start_min` / `end_min`（如 540/1020 = 09:00–17:00 SGT）、`allowed_late_count`（允许迟到次数）

#### 人脸（沿用 ifm 表结构）

**face_baselines（人脸基线，员工的"人脸身份证"）**
- id, employee_id（同时仅 1 个活跃，唯一索引 where retired_at is null）
- `photo_path`、`embedding`（bytea，512×4 字节 Float32）、`embedding_model`（webface_r50）、`embedding_dim`
- enrolled_at, retired_at（换模型时弃用旧基线）

**face_challenges（每次扫脸事件）**
- id, employee_id, `purpose`（BASELINE_ENROLL / RANDOM_CHECK / ATTENDANCE / VISIT_CHECKIN）
- `status`（PENDING_PUSH / PUSHED / PASSED / FAILED / TIMEOUT / ABORTED）
- `nonce`（防重放）、`similarity`、`liveness_action_passed`、`liveness_color_score`、`baseline_id`、`failure_reason`
- 关联：related_attendance_id / related_site_visit_id；client_ip, user_agent, 时间戳
- 阈值（可配）：人脸相似度 >0.55、活体 >0.5、人脸质量 det_score >0.5
- 活体动作门限（前端 MediaPipe，可配）：眨眼 2 次（eyeBlinkLeft/Right >0.5）、张嘴（jawOpen >0.4）、转头（eyeLookOutLeft & eyeLookOutRight >0.4）；检测 52 特征点 + 52 blendshapes（模型 `face_landmarker.task` float16）
- 炫光活体序列：Red→Green→Blue 每色 1–2 秒，采 3~5 帧（480×480）；主照 640×640；服务端推理超时 60s
- **RANDOM_CHECK 主动抽查**：服务端可主动 push 一次扫脸挑战给指定员工（status PENDING_PUSH→PUSHED，nonce 防重放），用于日常随机考勤核验——不只是被动验证

#### 打卡记录

**attendance_records（打卡明细）**
- id, employee_id, `work_date`（YYYY-MM-DD, SGT）, `kind`（CLOCK_IN / CLOCK_OUT）, `clocked_at`
- `clock_point_id`、`lat`、`lng`、`distance_m`（Haversine 到最近打卡点）、`in_geofence`
- `face_challenge_id`、`face_pass`、`face_similarity`
- `deviation_minutes`（迟到/早退分钟）、`reason`、`method`（fixed_point / gps / face）
- `on_behalf_user_id`（代录打卡：管理员/他人代打；本人打卡时自拍 image 必填，代录时人脸验证可跳过）
- UNIQUE(employee_id, work_date, kind)

**attendance_days（按天汇总）**
- id, employee_id, work_date, clock_in_id, clock_out_id
- `status`：PRESENT / LATE / EARLY_LEAVE / LATE_AND_EARLY / INCOMPLETE / ABSENT
- UNIQUE(employee_id, work_date)；**直接喂绩效评分的全勤达标**

#### 外勤汇报（sitevisit）

**site_visits（外勤汇报）**
- id, employee_id, `client_id`（拜访对象，可事后关联）, `captured_at`, `synced_at`
- `lat`、`lng`、`accuracy`、`address`（可逆地理编码）
- `selfie_document_id`（人脸自拍）、`site_photo_document_ids`（现场照数组，最多 20 张）
- `face_challenge_id`、`face_status`（PENDING / PASSED / FAILED / SKIPPED）、`face_similarity`
- `distance_to_lead_m`（到拜访对象的距离，用于自动核验到访真实性；超阈值如 >1km 自动置 REJECTED_DISTANCE）
- `note`、`status`（PENDING / VERIFIED / REJECTED_DISTANCE / REJECTED_FACE / MANUAL_OVERRIDE）、`reject_reason`、`overridden_by` / `overridden_at`（管理员手动覆盖）
- 流程：移动端 multipart 上传 自拍+现场照+GPS+备注 → 服务端按 `distance_to_lead_m` + 人脸比对基线**自动核验到访真实性**（VERIFIED / REJECTED_DISTANCE / REJECTED_FACE）→ 管理员可 **MANUAL_OVERRIDE** 覆盖并记 `reject_reason` → 可事后关联客户
  > 这张表即 ifm `lead_visits`「到访核验状态机」的合并落地——把外勤汇报与到访真实性核验收在一张 site_visits 里。

#### GPS 轨迹（销售外出持续定位）

**gps_tracks（轨迹点）**
- id, employee_id, `recorded_at`（设备本地）, `received_at`（服务端）
- `lat`、`lng`、`accuracy`、`altitude`、`speed`、`heading`、`battery_level`、`is_moving`
- `trigger`（TIME / MOTION / MANUAL）、`device_id`、`app_state`（FOREGROUND / BACKGROUND / TERMINATED）
- employees 加 `gps_tracking_enabled`（是否对该员工开启后台轨迹）
- 采集：Capacitor 后台定位 + 本地 SQLite 队列 + 30 秒触发、**每批最多 flush 50 条**上报 `POST /api/tracking/points`；查询 `GET /api/tracking/user/{userId}?from=&to=`；leaflet 画轨迹

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
- 各岗位薪酬包数字（底薪 / 各项奖金）、KPI 指标定义、全勤达标规则
- 各打卡点坐标与围栏半径、班次时间（迟到/早退判定）、人脸/活体阈值是否沿用 ifm 默认
