# 进度跟踪 (progress.md)

> 用途:对话被打断时,看这份就能接上。**每完成一步及时勾选 + 更新"下一步"。**

---

## 🔖 最新快照(2026-06-25,会话重启前)

- **项目位置**:`~/project/businessHub`(已从旧的 `~/businessHub` 搬过来;旧路径暂留软链,重启后可 `rm ~/businessHub` 清掉)。**下次从 `~/project/businessHub` 启动。**
- **git**:remote `origin = git@github.com:kevnlee1717/businessHub.git`,`master` 已 push 并跟踪 `origin/master`。工作区干净。
- **已完成**:
  - Phase 1 第2批 HR API(考勤/KPI/绩效/法定缴款/工资条 5 路由)→ commit `5a54a69`,typecheck 过
  - 历史对话设计提取 + spec 补全 → commit `6b2e6e3`(含 `docs/superpowers/specs/2026-06-25-design-extracted-delta.md`)
- **下一步建议**:Phase 1 收尾(如还有未做的 HR 子模块)或开 Phase 2(考勤进阶/移动端 —— delta 里 lead_visits 核验、代录打卡、company_assignments、随机抽查推送都属这阶段)。具体见文末「下一步」。

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

## 下一步

第2批已提交并 push,工作区干净。下次可选方向(等用户拍板):
1. **Phase 1 收尾** —— 核对 plan/spec,看人事层是否还有未覆盖的 API(如工资发放 `payslips/:id/pay`、考勤日 status 自动判定等)。
2. **Phase 2 考勤进阶/移动端** —— 把 delta 里被简化的机制实现回来:site_visits 到访核验(distance_to_lead_m + 状态机 + 人工覆盖)、`on_behalf_user_id` 代录、`company_assignments` 历史分配、RANDOM_CHECK 主动抽查推送、人脸微服务接入。
3. **补业主待定数字**(若业主已给):CPF/劳工税/公积金费率 → 完善 payslip 扣项 + statutory;各业务默认提成 → commission。

⚠️ 重启后从 `~/project/businessHub` 启动;确认新会话路径无误后可 `rm ~/businessHub`(旧软链)。
