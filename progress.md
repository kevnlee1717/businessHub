# 进度跟踪 (progress.md)

> 用途:对话被打断时,看这份就能接上。**每完成一步及时勾选 + 更新"下一步"。**

---

## 🔖 最新快照(2026-06-27 第七轮:财务系统第 1 层地基)

- **业主提了一整套财务系统大需求**(业务绑公司、公司财务数据/新加坡报表导出、KPI 反推不亏损、总现金流面板、灵活收入模型/方案版本、强制凭证、对公账户对账…)。已拆成 **3 层 7 模块**,设计 + 实现都**自下而上一层层来**。
- **设计 spec**:`docs/superpowers/specs/2026-06-27-finance-layer1-businesses-schemes-design.md`(含整套分层表 + 第 1 层详设)。**会计走「简化录入 + 生成专业报表导出」**;收入模型用**通用条目规则引擎 + 预设模板**(业主确认方向)。
- **第 1 层地基(模块 ①②)已全部做完、commit、运行时验证**(commit `33d7788`→`bc9cefa`,codex 写 + Claude 审/typecheck/端到端冒烟):
  - **批1 数据层**:`businesses`(绑公司)/`deal_parties`/`scheme_versions`/`scheme_lines`/`deal_line_amounts` 5 表 + 5 枚举 + `billing` 加 `business_id`/`scheme_version_id`/`inputs`。**migration `0012` 已 migrate 本地库**。
  - **批2 计算引擎**:`@bh/shared` 的 `computeDealEconomics` 纯函数(两遍求值 percent_of_revenue/margin/per_unit/fixed,one_time/monthly/per_event)+ 4 业态预设 `DEAL_PRESETS` + **vitest 6 单测全绿**(项目首次引入 vitest)。
  - **批3 API**:`businesses`/`schemeVersions`(preset 展开 + `/preview` + profit_rate 重算)/`dealParties` 路由 + `billing` 事务写 `deal_line_amounts` 快照;`financeUtils.ts` 复用层。
  - **批4 seed**:5 系统 `deal_parties` + 现有 5 业务建实体(ep/ica→JUYI 咨询,diploma/english/wsq→恺德学校)+ 各 v1 默认版本(一次性卖断);**幂等已验**。billing 0 行无回填。
  - **批5 前端**:「业务方案」导航区 —— 业务列表(按公司分组)/ 业务详情 + 方案版本编辑器(预设模板 + 规则行表格 + 示范利润率实时 preview)/ 分成对象;i18n 中英。`pnpm --filter @bh/web build` 过。
  - **端到端冒烟**(真实 HTTP):建「保安保洁/按人头多方抽成」业务 → preview headcount=10/12月 → 每月净利 2950、年 35400、profit_rate 0.8429,与 spec 算例一致。
- **第 2 层模块 ③a(学院月度收款面板)也已做完、commit、端到端验证**(spec `6185cf6`,后端 `8d10fb0`,前端 `79b2c4e`):
  - spec:`docs/superpowers/specs/2026-06-27-finance-layer2-module3a-academy-collection-design.md`
  - 读现有 `diploma_payments`,不改大专既有逻辑。API:`GET /academy/collection|/overdue|/health`(收款进度/欠款名单/招生缺口雏形)+ 复用 `PATCH /diploma-payments/:id` 标记已交。
  - 前端:教育导航「学院收款」`/education/academy-collection`(月份选择 + 收款进度卡 + 欠款名单可标记已交 + 当月期数 + 近 6 月趋势 + 缺口健康卡)。
  - **演示 seed**:`seedAcademyDemo`(4 个 `[DEMO]` 学生 + 报名 + 月度学费 + 恺德当月固定成本 4000,幂等)。**业主录真实学生后即看真实数据;DEMO 数据可删**。
  - 验证:health 当月在读 4、固定成本 4000、人均 2500、保本 2 人、缺口 0;collection/overdue 聚合手工核对正确。
- **③b(scheme 驱动通用期数台账 `billing_periods`)未做**:目前无周期性成交单(按摩椅/床垫/保安尚无真实成交),YAGNI 待真实成交再起。
- **本轮共 10 commit,全部待 push**;未 migrate 生产库(只 migrate 本地 cc docker postgres,migration 到 **0012**)。本地测试时在 JUYI 名下建过占位「保安保洁派遣」业务 + DEMO 学院数据(均可在 UI 删)。
- **下一步(财务第 2 层剩余 + 第 3 层)**:④ 收支总账本 + 强制凭证 + 对公账户对账 → ⑤ 销售跨业务/底薪/提成账本 → ⑥ 新加坡报表导出(Form C-S/GST/ACRA)→ ⑦ KPI 反推(**招生缺口 = 月固定成本 ÷ 每生月净利 − 现有学生数**,已在 ③a /health 出雏形)+ 总现金流面板。每模块各自 spec;多处需业主补真实数字(各业务真实价格/提成/成本、CPF 费率等)。

---

## 🔖 旧快照(2026-06-26 第五轮:上线 + EP/ICA 域深化)

- **已上线** https://bh.youjia.sg(单进程同源 systemd `bh-prod`:3011 → frpc 3099 → byte nginx + certbot SSL;postgres 在 cc docker)。改代码后 `XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart bh-prod`。owner=admin@bh.local/**changeme**(待改)。
- **本轮新增并上线**:① 行业可管理实体(移民/留学/学院)+ 公司关联行业 + 公司状态枚举下拉;② EP「申请」8步 / ICA「申诉」7步 / DP「申请」5步 流程模板(seed);③ EP 挂多个 DP 子申请(parent_case_id);④ 担保人库(guarantors)+ ICA 选担保人;⑤ 提交/拒绝周期(case_submissions,ICA 失败重提记时间);⑥ 补材料中(need_materials)步骤状态;⑦ 步骤 meta(KYC 预约时间)。migrations 到 **0007**,均已 migrate 生产库。
- **EP/ICA 步骤内容是 Claude 拟的默认值**,业主可在 业务→流程模板 自行增删改。
- **仍未做**:Python 人脸微服务(需 ifm 源/模型/阈值)、Capacitor 移动端(业主暂缓)、CPF/levy/公积金费率(工资条扣项空)、KYC 视频专用播放(现按普通文件存)。

---

## 🔖 旧快照(2026-06-25 第四轮,全 Phase 闭环会话后)

- **里程碑**:Phase 1→5 后端 + PC 后台前端**全部前后端闭环**;本轮在第三轮基础上又加 Phase 3(案件 EP/ICA)、Phase 4(教育)、Phase 5(DMS/公司实体)。全程 `pnpm -r typecheck` 4 包绿 + `pnpm --filter @bh/web build` 过(仅 chunk-size warning)。代码全由 codex 写、Claude 审查验收,每片单独 commit。
- **migrations**:已生成到 **0005**(0002 考勤/外勤/人脸、0003 案件、0004 教育、0005 DMS),**均未 migrate**(postgres 没起)。
- **PC 后台导航**:人事(7 tab)/ 业务(案件·客户·模板)/ 教育(学生·大专·英语·WSQ)/ 文档(检索·客户库·公司费用·合同·分类)/ 设置(公司·岗位·班次)。
- **收款闭环已补完**:billing/payments/price_adjustments API + 「财务」区 UI;提成按销售当月成交单据汇总进工资条 commission_total(不再写死 0)。
- **仍阻塞/暂缓**(均需外部输入,本机无法验证):
  - Python 人脸微服务 —— 需 ifm 源码 / InsightFace 模型 / 业主确认阈值;businessHub 侧集成点已就绪(/face/challenges/:id/result + FACE_SERVICE_URL + embedding 待回填)
  - Capacitor 移动端 —— 业主 2026-06-25 明确暂缓
  - 业主后补数字 —— CPF/levy/公积金费率(工资条扣项仍留空)、EP/ICA 详细步骤流程(模板引擎已就绪,待填模板内容)、各业务默认提成/薪酬包数字
- **下次第一件事**:`docker compose up -d` 起 postgres → `pnpm db:migrate`(跑 0002-0005)→ `pnpm db:seed` → `pnpm dev` 本地起后端 :3011 / 前端 :5190 联调。

---

## 🔖 旧快照(2026-06-25 第三轮,大推进会话后)

- **项目位置**:`~/project/businessHub`;git remote `origin`,`master` 待 push(本会话 11 个新 commit 未 push)。工作区干净。
- **代码全部由 codex 写,Claude 拆解/审查/typecheck 验收**;全程 `pnpm -r typecheck` 4 包绿、`pnpm --filter @bh/web build` 过(仅 chunk-size warning)。
- **本会话已完成(commit `d377f01`→`5b1bab1`)**:
  - **Phase 1 收尾**:`POST /payslips/:id/pay` 发放;`/attendance/clock` 按班次算迟到/早退 + 考勤日 status 自动判定
  - **Phase 2 后端全栈**:数据层 6 表 + 6 枚举 + migration `0002`(**未 migrate,DB 没起**);打卡点 CRUD + 员工分配 + GPS 围栏(Haversine)+ 代录打卡;外勤 site_visits(multipart 上传+距离核验+人工覆盖);GPS 轨迹 tracking;人脸 face_challenges 状态机 + 基线录入(retire 事务+nonce+结果回写)
  - **PC 后台前端**:人事区 7 tab(员工/考勤/工资/打卡点/外勤/薪酬配置/绩效KPI)+ 设置区 3 tab(公司/岗位/班次)
- **下一步(见文末「下一步(2026-06-25 第三轮后)」)**:① `pnpm db:migrate`(需先起 postgres)② Python 人脸微服务(复用 ifm,**阻塞:需 ifm 源 + InsightFace 模型 + 业主阈值**)③ Capacitor 移动端 —— **业主已要求暂缓** ④ 业务层 Phase 3+(案件/教育/DMS)。

---

## 当前任务

**Phase 1 · 第 2 批 HR API**:考勤打卡 / KPI / 绩效覆盖 / 法定缴款 / 工资条生成。
接续已提交的「第 1 批」(commit `552bd44`),数据层表在 `d468272` 已建好,不动 db/迁移。

设计依据:
- spec:`docs/superpowers/specs/2026-06-25-businesshub-design.md` §3.3 人事层(薪酬/绩效/工资条公式在 207–262 行)
- plan:`docs/superpowers/plans/2026-06-25-businesshub-implementation.md`(Phase 1 在总览,未细展)

## 断点状态(开工前)

未提交改动只在两个文件:
- `packages/shared/src/schemas/hr.ts`:已加 5 个 Zod schema(attendanceClock / kpiTarget / performanceOverride / statutoryPayment / payslipGenerate)✅
- `packages/shared/src/permissions.ts`:`principal` 去掉 `attendance.manage`(有意,校长只打自己卡)✅

## TODO(按顺序)

- [x] 1. `hr.ts` 末尾补 5 个 `export type … = z.infer<…>`
- [x] 2. `routes/attendance.ts` — POST `/attendance/clock`、GET `/attendance`、GET `/employees/:id/attendance`
- [x] 3. `routes/kpi.ts` — GET / PUT `/employees/:id/kpi`(upsert,算 achievement_pct)
- [x] 4. `routes/performance.ts` — GET / PUT `/employees/:id/performance`(写 *Override 列,返回 effective)
- [x] 5. `routes/statutory.ts` — GET `/statutory`、POST `/statutory`
- [x] 6. `routes/payslip.ts` — GET `/payslips`、POST `/payslips/generate`(按 spec 公式生成 draft)
- [x] 7. `routes/index.ts` 注册以上 5 个路由
- [x] 8. `pnpm --filter @bh/api typecheck` + `pnpm --filter @bh/shared typecheck` 通过 ✅
- [x] 9. commit(`5a54a69`)+ docs commit(`6b2e6e3`)+ push origin/master ✅

## 已知简化(需在 commit message / 后续批次交代)

- **工资条扣项(CPF/levy/中国公积金)**:生成 draft 时**先留空**。CPF 按年龄段分级算 + payroll_settings 的 jsonb 费率较复杂,且员工无生日字段;留给「法定缴款 / 工资发放」环节填。draft 的 `net_pay` 暂 = gross − 已填扣项(初始 = gross)。
- **commission_total**:提成表尚未建模(无 commissions 表),暂记 0。

## 验收(怎么算"完成")

项目**无测试体系**(api package.json 只有 `typecheck`,lint=skip)。所以:
- `tsc --noEmit` 两个包都过 = 通过
- 5 个路由文件 + index 注册齐全,字段名与 db schema / Zod schema 对得上

---

## 附:历史对话设计提取 + spec 补全(2026-06-25 第二轮)

**背景**:被打断的历史对话 `cb9543c0…jsonl`(那场 brainstorming)里有更多设计。已通读提取,和现有 spec 逐条比对。
- 完整逐条对照:`docs/superpowers/specs/2026-06-25-design-extracted-delta.md`(已纳入 git)
- 结论:spec 是那场对话里边聊边写的,业务设计 80%+ 已收录;真正 delta 集中在 **ifm 考勤/外勤被简化掉的二级机制 + 实现级数字**。

**已补进 spec**(`specs/2026-06-25-businesshub-design.md`,已 review + commit `6b2e6e3`):
- §1 加「部署事实」:固定端口 api 3011 / web 5190 / 人脸 17010、默认账号 `admin@bh.local`/`changeme`、7 个默认文件分类
- §3.2 ICA 担保人「须 SG 公民/PR」业务约束
- §3.6 打卡点:`company_assignments` 历史分配(主/副公司+生效失效,留待 Phase 2)
- §3.6 人脸:活体动作门限(眨眼2次/jawOpen>0.4/转头>0.4、52 特征点+blendshapes)、炫光序列 Red→Green→Blue、帧 640/480、推理超时 60s、RANDOM_CHECK 主动 push 抽查
- §3.6 attendance_records:`on_behalf_user_id` 代录打卡(代录免人脸)
- §3.6 site_visits:`distance_to_lead_m` + REJECTED_DISTANCE(>1km) + reject_reason + overridden_by/at + 到访自动核验流程(即 ifm lead_visits 状态机的合并落地)
- §3.6 GPS:flush batch=50、`GET /api/tracking/user/{id}`、`POST /api/tracking/points`

**仍待业主后补**(spec §7,对话里从未提供,非遗漏):EP/ICA 详细步骤、CPF/劳工税/公积金费率、各业务默认提成数字、各岗位薪酬包数字、KPI 指标定义、打卡点坐标/班次时间/人脸阈值是否沿用 ifm。

**这些 delta 多属 Phase 2(考勤进阶/移动端),与已完成的 Phase 1 第2批不冲突。**

## 下一步(2026-06-25 第三轮后)

**本会话产出全部本地验证通过、已 commit 但尚未 push。** 剩余:

1. **`git push origin master`**(11 个 commit 待推)+ `pnpm db:migrate`(先 `docker compose up -d` 起 postgres,再跑 0002 迁移)。
2. **Python 人脸微服务**(spec §3.6,复用 ifm):businessHub 侧集成点已就绪 —— `POST /face/challenges/:id/result` 回调 + `FACE_SERVICE_URL` env + face_baselines.embedding 待回填。**阻塞项**:需 ifm 源码 / InsightFace 模型 / 业主确认人脸·活体阈值是否沿用 ifm 默认(spec §7 待业主后补)。
3. **Capacitor 移动端** —— 业主 2026-06-25 明确要求**暂缓**,不做。
4. **业务层**:Phase 3 案件流程(EP/ICA)、Phase 4 教育、Phase 5 DMS/公司实体 —— 多处依赖业主后补数字(费率/提成/步骤流程,见 spec §7)。
5. **零散**:工资条 CPF/levy/公积金扣项仍留空(需业主费率);commission 仍记 0(提成表未建模);web 包 vite chunk>500kB(可后续 code-split,非阻塞)。

---

## 下一步(历史 · 第二轮)

第2批已提交并 push,工作区干净。下次可选方向(等用户拍板):
1. **Phase 1 收尾** —— 核对 plan/spec,看人事层是否还有未覆盖的 API(如工资发放 `payslips/:id/pay`、考勤日 status 自动判定等)。
2. **Phase 2 考勤进阶/移动端** —— 把 delta 里被简化的机制实现回来:site_visits 到访核验(distance_to_lead_m + 状态机 + 人工覆盖)、`on_behalf_user_id` 代录、`company_assignments` 历史分配、RANDOM_CHECK 主动抽查推送、人脸微服务接入。
3. **补业主待定数字**(若业主已给):CPF/劳工税/公积金费率 → 完善 payslip 扣项 + statutory;各业务默认提成 → commission。

⚠️ 重启后从 `~/project/businessHub` 启动;确认新会话路径无误后可 `rm ~/businessHub`(旧软链)。
