# businessHub 设计提取 vs 现有 spec — Delta 分析

> 来源对话：history-transcript.txt（1539 行）
> 对照基准：docs/superpowers/specs/2026-06-25-businesshub-design.md
> 重要背景：**这份 spec 是在这同一场对话里边讨论边写的、并迭代更新过两次**（commit 6999ea1 → 07daf2a）。因此对话里 80%+ 的决策已经同步进 spec。真正的 delta 集中在两类：
> 1) ifm 调研报告里的**实现级技术细节**（具体阈值、库版本、API 端点、SQL 列名、活体动作判定门限），spec 只做了归纳概括 → 🔶 更细
> 2) 对话里出现、spec 里没明确落字的少量小决策/约束 → 🆕 缺失
>
> 标注：✅ 已收录（粒度一致）｜🔶 更细（对话比 spec 具体，列出多出来的）｜🆕 缺失（spec 完全没有）

---

## A. 5 类业务

> 关键事实：用户在第一条需求里给了 5 类业务的**字段级**要求，并明确说"EP 有流程，我后面补，每一步都有相应的负责人"。**详细步骤流程始终没有提供**——spec §7「待业主后补」已正确记录这点。所以这里没有"漏掉的步骤流程"，只有字段层面的核对。

### A1. EP 申请
- ✅ 2-3 人配合、文员+会计参与、每步有负责人、每步有介绍+文件清单且可改、缺件提示、是否完成提示、步骤顺序可调、状态机、跟进+附件（可预览 PDF/Word/图片+下载）、定金+尾款、可调定金和总价、销售提成（%或固定、每人可不同、有默认值）→ 全部进 spec §3.2 + §3.1。
- ✅ 详细步骤流程：用户明说"后面补" → spec §7 已记为待补。

### A2. ICA 入境申诉
- ✅ 同 EP 的步骤引擎；需要新加坡担保人、要知道谁担保、申请进度；主要文员参与；定金尾款+调价+销售提成 → spec §3.2 cases 有 guarantor_name/relation/contact。
- 🔶 **更细（措辞）**：用户原话强调"**需要新加坡的担保人担保**"（担保人是 SG 身份这一约束）。spec 只存了 guarantor 三个字段，没标注"担保人须为新加坡身份/PR"这个业务校验点。属于很弱的 delta，可不追。

### A3. 成人大专
- ✅ 学生+老师信息、入学时间、总付款、分期几次、已付几次、是否毕业、销售提成 → spec §3.4 diploma_enrollments（含 installments_count、graduated、已付=数 payments）。

### A4. 成人英语
- ✅ 多等级、每等级收费/时长、排课、学生报课、上课时长、考勤、老师管理（全职/兼职、排课、工资）、销售提成 → spec §3.4 english_levels/classes/enrollments/attendance。

### A5. WSQ
- ✅ 课程名/内容/开课时间/时长/老师/价格、学生数、是否能开课（min_students 判断）、销售提成 → spec §3.4 wsq_courses/enrollments。

> 5 类业务全部 ✅ 收录，字段粒度一致。**唯一可记的是 A2 担保人「须 SG 身份」这条业务约束没显式写。**

---

## B. 人事 — 角色

- ✅ 8 个角色（owner/admin-HR/accountant/clerk/sales/teacher/principal/photographer），含摄影师、校长 → spec §4 完整。
- ✅ 一人一角色、角色枚举挂员工、权限代码映射 → spec 约束表 + §4。
- ✅ 每个人首先都是"员工"（有档案/考勤/工资）→ spec §4 开头。

---

## C. 人事 — 工资（绩效组合）

- ✅ 两层薪酬配置（公司×岗位模板 + 个人覆盖，留空继承）、绩效组合工资（底薪+全勤奖+任务完成度奖+任务满意度奖+KPI 奖+提成−法定扣除）、月度绩效评分（自动算+可人工调）、KPI（主要给销售）、发薪日、所有发放有记录、CPF/劳工税/中国公积金可空、缴纳记录三类各自有 → spec §3.3 完整。
- ✅ 全勤奖=达标制；任务完成度/满意度/KPI=按得分百分比折算 → spec 计算公式段。
- ✅ 任务满意度由创建人/派发人打分（1–5）→ spec tasks 表。
- ✅ payroll_settings 可配不写死（CPF 按年龄段比例、劳工税额、公积金比例、全勤阈值、KPI 是否封顶 100%）→ spec §3.3。

- 🆕 **缺失（小）**：实施记录里提到 seed 默认 owner 账号 `admin@bh.local` / 密码 `changeme`，以及"7 个默认文件分类"、固定专用端口 **api 3011 / web 5190**（strictPort）。这些是**实现产物/部署事实**，不是设计决策，spec 不写也合理——但如果 spec 想充当部署参照，端口/默认账号值得补一句。

> 工资模块在对话里没有出现 spec 之外的新算法决策。CPF/劳工税/公积金**具体费率**用户始终没给，spec §7 已记为待补。✅

---

## D. 人事 — 考勤 / 移动端 / 人脸 / GPS（最大的 🔶 区）

> 这一整块的 delta 来源是 **ifm 调研报告**（transcript 486–1081 行）。spec §3.6 + §1 把它归纳进去了，但**报告里有大量实现级数字和结构，spec 做了抽象**。下面逐条列 spec 比对话粗的地方。

### D1. 已收录（粒度一致）
- ✅ 多打卡点（clock_points + employee_clock_points 多对多）、班次 work_shifts（迟到/早退、allowed_late_count）、人脸基线/挑战、attendance_records/days（状态机 PRESENT/LATE/EARLY_LEAVE/LATE_AND_EARLY/INCOMPLETE/ABSENT）、site_visits 外勤、gps_tracks 轨迹、照片走 documents、Capacitor 原生 App、Python 人脸微服务自建实例、leaflet → 都在 spec §3.6/§1。
- ✅ 商用 license 坑：用 webface_r50 不用 buffalo_l → spec §1 + 约束表。
- ✅ 人脸服务自建实例、不依赖 ifm 运行实例、systemd Restart=always、代码拷自 ~/project/ifm/face-service → spec §1。

### D2. 🔶 更细 — 阈值与判定门限（spec 只写了"阈值可配"，对话给了具体数）
- 🔶 人脸相似度阈值 **cosine > 0.55** 通过（spec §3.6 写了 >0.55 ✅ 实际已收）。
- 🔶 活体置信阈值 **> 0.5**（Silent-Face live softmax）（spec 写了 >0.5 ✅ 已收）。
- 🔶 人脸质量最低分 **det_score > 0.5**（spec 写了 ✅ 已收）。
- 🔶 **人脸服务推理超时 60s**（spec 未写）🆕。
- 🔶 嵌入维度 **512**、存储为 **2048 字节 Float32 BLOB/bytea**（spec §3.6 写了 512×4 字节 ✅ 已收）。
- 🔶 **MediaPipe 活体动作的具体判定门限**（spec 只说"眨眼/张嘴/转头"，没给数值）🆕：
  - 眨眼 **2 次**（eyeBlinkLeft + eyeBlinkRight > 0.5）
  - 张嘴（jawOpen > 0.4）
  - 转头左右（eyeLookOutLeft > 0.4 && eyeLookOutRight > 0.4）
  - MediaPipe 检测 **52 个特征点 + 52 个 blendshapes**；模型 `face_landmarker.task`（float16）
- 🔶 炫光颜色序列 **Red→Green→Blue**，每色 1–2 秒，记录 3~5 帧（480×480）；主照 640×640（spec 没写帧规格/序列）🆕。

### D3. 🔶 更细 — 地理围栏 & 距离
- 🔶 默认围栏半径 **200m**（spec §3.6 clock_points radius_m 默认 200 ✅ 已收）。
- 🔶 距离算法 **Haversine**（地球半径 6371km）、客户端+服务端**双重校验防作弊**（spec 提了 Haversine + 双重，✅ 已收）。
- 🔶 外勤距离拒绝阈值：lead_visits 里 **REJECTED_DISTANCE（如 >1km）**（spec site_visits 的 status 没列 REJECTED_DISTANCE 的距离门限 1km）🆕。
- 🆕 **lead_visits 这张"规范化外勤记录"表**：ifm 里 site_visit 之外还有一张 `lead_visits`（visit_date/visit_at、distance_to_lead_m、status: PENDING/VERIFIED/REJECTED_DISTANCE/REJECTED_FACE/MANUAL_OVERRIDE、reject_reason、overridden_by/at）。spec 只合并出一张 site_visits，**没有"到访距离自动核验 + 管理员手动覆盖"这套状态机**。这是 spec 比对话**简化**掉的一块。

### D4. 🔶 更细 — GPS 轨迹采集
- 🔶 触发方式 TIME（**30 秒/次**）/ MOTION（加速度计）/ MANUAL（spec §3.6 写了 TIME/MOTION/MANUAL + 30 秒 ✅ 已收）。
- 🔶 本地队列 Capacitor SQLite，**每次最多 flush 50 条**（spec 没写 batch=50）🆕。
- 🔶 字段 altitude/speed/heading/battery_level/is_moving/app_state（FOREGROUND/BACKGROUND/TERMINATED）→ spec §3.6 已列 ✅。
- 🔶 轨迹查询端点 `GET /api/tracking/user/{userId}?from=&to=`、上报端点 `POST /api/tracking/points`（spec 没写具体 API 路径）🆕。

### D5. 🔶 更细 — 代录/On-behalf 打卡
- 🆕 **代录打卡**：ifm 打卡 API 有 `on_behalf_user_id`——本人打卡时 image_base64 必填、代录时人脸可跳过。spec 完全没提"管理员/他人代录打卡、代录免人脸"这条。

### D6. 🔶 更细 — 多公司打卡的历史追踪
- 🔶 ifm 用 `company_assignments` 表（status=ACTIVE + ended_at 软删除）管员工↔公司，**支持历史追踪**；取最近公司作为打卡地点。spec 用 clock_points + employee_clock_points 表达"一人多点"，但**没有"主公司+副公司 + 带生效/失效时间的历史分配"**这层。属于 spec 比对话简化。🆕

### D7. 🔶 更细 — 人脸挑战 purpose 枚举
- 🔶 ifm face_challenges.purpose = BASELINE_ENROLL / RANDOM_CHECK / VISIT_CHECKIN。spec §3.6 写成 BASELINE_ENROLL / RANDOM_CHECK / ATTENDANCE / VISIT_CHECKIN（spec **多加了 ATTENDANCE**，合理扩展）。✅ 已收且更全。
- 🆕 **RANDOM_CHECK（日常随机抽查扫脸）+ 服务端 push 挑战机制**（PENDING_PUSH/PUSHED 状态、nonce 防重放、推送给用户）：spec 列了 status 枚举含 PENDING_PUSH/PUSHED，但**没描述"服务端主动推送随机人脸抽查"这个业务玩法**，只把它当被动验证。设计意图层面的 delta。

---

## E. 文档管理 / 公司实体 / 合同

- ✅ 统一 documents 模型（多态 subject_type+subject_id、client_id 自动归档、category_id、tags）、document_categories（预设+可增减+is_system 种子）、三个"库"是视图、客户资料库自动盖 client_id、公司实体文件库、合同 contracts+contract_versions（多版本、version_no、status draft/signed/superseded）、company_expenses（金额+类型+月份+挂文件+按公司/月统计）、检索 v1 元数据、全文检索后做、到期提醒先不做 → spec §3.5 完整。
- ✅ 文件传入步骤"必需文件槽"自动继承分类+盖 client_id → spec §3.1 documents 说明。
- 🔶 **更细（实现事实）**：seed 落了 **7 个默认文件分类**（spec §3.1 列举"护照、学历证明、合同、租房合同、bizfile、收据、其它…"约 7 个，✅ 基本一致）。

---

## F. 公司实体 / 多币种 / i18n（地基约束）

- ✅ 多公司实体、每公司多文件（租房合同/bizfile/月租）、分类保存检索 → spec §3.5。
- ✅ 货币：总价 SGD 为准；RMB 付款手输当天汇率，记 RMB 金额+汇率+折算 SGD 冲抵；中国团队工资 RMB → spec 约束表 + payments 表。
- ✅ i18n 第一优先、中英一键切换、业务内容 name+name_en 双字段 → spec §5 + 约束表。

---

## G. 技术栈 / 架构 / 流程决策

- ✅ 后端 Fastify+Drizzle+PostgreSQL（替换原想的 AntD/换轻量前端）、前端 Mantine（否决 AntD、否决 shadcn 备选）、TanStack Query、react-hook-form+zod、pnpm monorepo、shared 共享 zod、PC+移动双入口+人脸微服务三件套 → spec §1 完整。
- ✅ 三层架构 + DMS 横切层、构建顺序（地基→人事→案件引擎→教育模块）→ spec §2。
- ✅ 纯内部系统、仅员工登录、学生端以后单独做 → spec 约束表 + §6。

### G1. 🆕 缺失 — 开发执行层面的决策（非系统设计，但用户明确说了）
- 🆕 用户明确指令：**"写代码用 codex"**、"不要停"、"每 2 分钟报告进度"、"有要选择的用你的建议"。这是协作流程约定，不属于系统 spec，**合理地不在 spec 里**。仅作记录。
- 🆕 实现拓扑事实：**固定专用端口 api 3011 / web 5190（strictPort）**、人脸服务端口 17010（spec §1 写了 17010 ✅）。3011/5190 是这台多项目机器端口冲突后选定的，spec 未记。如需部署参照可补。
- 🆕 默认登录：seed owner `admin@bh.local` / `changeme`（spec 未记，属实现）。

---

## H. spec 里有、但对话里没明确确认的（反向检查）

- spec face_challenges.purpose 加了 **ATTENDANCE**（ifm 原报告无）——spec 主动扩展，合理。
- spec §6「暂不做」列了"多角色叠加"——对话里用户选了"一人一角色"，spec 把多角色叠加列为未来项，是合理推断，非用户明说。
- spec §3.4 把"已付次数=数 payments"做成隐式，对话里用户原话"付了多少次了"——一致。

---

## 汇总：真正值得用户看的 Delta

### 🆕 缺失（spec 完全没有，按重要性排序）
1. **lead_visits 到访核验状态机**（distance_to_lead_m + REJECTED_DISTANCE(>1km)/VERIFIED/MANUAL_OVERRIDE + 管理员手动覆盖）——spec 把外勤简化成一张 site_visits，丢了"自动核验到访真实性 + 人工覆盖"这套。
2. **代录打卡 on_behalf_user_id**（他人代打卡、代录免人脸验证）——spec 未提。
3. **多公司分配的历史追踪**（company_assignments：主公司+副公司、生效/失效时间、软删除）——spec 用静态多对多表达，丢了时间维度。
4. **服务端主动推送的随机人脸抽查 RANDOM_CHECK**（push 挑战机制）——spec 列了 status 但没把它当主动业务玩法。
5. **MediaPipe 活体动作判定门限**（眨眼 2 次 >0.5 / jawOpen>0.4 / yaw>0.4；52 特征点+52 blendshapes）、炫光序列 Red→Green→Blue 每色 1–2 秒、帧规格 640/480、人脸服务超时 60s、GPS flush batch=50、tracking API 路径——这些实现级数字 spec 未落字。
6. **部署事实**：固定端口 api 3011 / web 5190、默认账号 admin@bh.local/changeme（属实现产物，spec 可选补）。

### 🔶 更细（spec 有但更粗，对话给了具体数）
- 人脸/活体所有阈值 spec 已收（0.55 / 0.5 / det 0.5 / 512 维），但**推理超时、动作门限、帧序列规格**更细。
- GPS 触发与字段 spec 已收，**batch=50、API 端点**更细。
- ICA 担保人「须 SG 身份/PR」业务校验，spec 只存字段未标约束。

### ✅ 已收录（粒度一致）
- 5 类业务全部字段、8 角色、绩效组合工资全套、两层薪酬、文档/公司/合同 DMS、多币种、i18n、三层架构、技术栈、人脸/考勤/GPS 主体表结构与状态机——共约 30+ 大项，spec 与对话粒度一致。

> 结论：spec 质量很高，是边聊边写的，业务设计层面几乎无遗漏。真正的 delta 集中在 **ifm 考勤/外勤实现报告里被 spec 抽象掉的几个二级机制**（lead_visits 核验、代录、公司历史分配、随机抽查推送）和一批**实现级阈值/端点数字**。用户后补的 EP/ICA 步骤、CPF 费率、提成数字 spec 已正确标为待补，对话里也确实从未提供。
