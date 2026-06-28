# 招聘管理模块 设计文档(Recruitment Module)

> 日期:2026-06-28
> 状态:已与需求方确认范围,待最终评审 → 进实现计划
> 所属:businessHub 新增一级模块 `/recruitment`

---

## 1. 背景与目标

公司多个行业同时招人(保安、保洁、餐饮等),目前缺一套系统化的招聘管理:

- **保安/保洁**:要新加坡本地长者;保洁还要招"场地管理"(能带人、管几个人的)。
- **餐饮**:要会做各种菜的熟手,新加坡 PR/本地、马来西亚人(主力)、也可中国人。

需要把"岗位 → 推广(线上发布 + 线下活动)→ 候选人/线索 → 邀约 → 面试 → 录用/人才库"全链路登记、追踪、统计起来,并用一个**专门的招聘 Dashboard** 回答经营问题:现在缺多少人、哪些岗位缺人、哪些紧急、每条发布每天进多少人、每场活动来多少人、同一岗位哪个平台更好招。

---

## 2. 范围(一期 vs 二期)

### 一期(本 spec)
- 岗位库(按行业自由增删岗位)
- 物料管理(文案/配图/传单/展架,可复用)
- **线上发布**管理(平台、素材、状态、负责人、咨询数)
- **线下招聘活动**管理(计划 vs 实际、选用物料、负责人、现场快速登记)
- 候选人/线索全链路(来源、意向岗位、状态流转、指派邀约文员、人才库、以后可用)
- 跟进记录 + 面试记录
- **系统内**超时未跟进提醒("待跟进"列表 + 侧边栏待办计数)
- **AI 文案生成**(接 Claude API,只生成文本:广告词/岗位描述/邀约话术)
- **招聘 Dashboard**(缺口、紧急、每日新增趋势、活动战报、平台效果对比、待跟进)

### 二期(非本 spec,明确排除)
- 自动发布到各招聘平台(多数平台无开放 API,需爬虫/第三方,风险高)
- 自动回复咨询
- 自动查询/同步外部平台数据
- AI 生成图片/配图(需接图像模型,按张计费)
- AI 生成传单/展架草稿(平面设计,定稿仍需设计师)
- 外部推送提醒(Telegram/邮件/短信)

> 一期把"人工发布 + 全程登记追踪 + AI 文案 + 经营看板"做扎实,数据沉淀后二期再上自动化。

---

## 3. 关键决策(已与需求方确认)

| 决策点 | 结论 |
|---|---|
| 自动化(发布/回复/查询) | 二期再做,一期人工 |
| AI 生成范围 | **只做文案**(Claude API);图片/传单/展架人工上传 |
| 超时提醒送达 | **系统内**(待跟进列表 + 侧栏红点),阈值可在设置里调 |
| 线上发布 vs 线下活动建模 | **分两张表**(字段差异大,各自干净,统计清楚) |
| 缺口/紧急 | 自动算(缺口=招聘人数−已录用);另加手动 `priority` 紧急标记 |
| 行业列表 | 招聘专用 `recruitment_industries`,与员工那套 `industries` 分开 |
| 公司隔离 | 所有表带 `companyId`,沿用现有公司闸权限过滤 |
| UI | 严格照 `docs/design-system/element-admin-reference.md`(列表骨架 §3.1、表单 §3.2、看板 §3.3) |

---

## 4. 数据模型

新增 8 张表 + 若干枚举。全部:`id uuid pk default random`、`companyId uuid → companies`、`createdAt/updatedAt timestamptz`。Schema 文件放 `packages/db/src/schema/recruitment*.ts`,枚举进 `packages/db/src/schema/enums.ts` + `packages/shared/src/enums.ts`。

### 4.1 枚举(`enums.ts`)

```
recruitmentJobStatus      = ["open", "paused", "filled", "closed"]            // 在招/暂停/招满/关闭
recruitmentJobPriority    = ["normal", "urgent"]                              // 紧急标记(手动)
recruitmentMaterialType   = ["copy", "image", "flyer", "stand"]              // 文案/配图/传单/展架
recruitmentPostingStatus  = ["publishing", "paused", "ended"]                // 发布中/暂停/结束
recruitmentCampaignType   = ["roadshow", "flyer", "booth", "other"]          // 路演/发传单/摆展台/其他
recruitmentCampaignStatus = ["planned", "done", "cancelled"]                 // 计划中/已完成/取消
recruitmentSourceType     = ["posting", "campaign", "walk_in", "referral"]   // 线上发布/线下活动/上门/转介绍
recruitmentCandidateStatus= ["new", "invited", "interview_scheduled",
                              "interviewed", "offered", "rejected", "on_hold"] // 见 §4.7 流转
recruitmentInterviewResult= ["pending", "pass", "fail"]                       // 待定/通过/不通过
recruitmentInterviewStatus= ["scheduled", "done", "no_show", "cancelled"]     // 已约/已完成/未到场/取消
recruitmentFollowupType   = ["call", "message", "invite", "note"]            // 电话/消息/邀约/备注
```

### 4.2 `recruitment_industries` — 招聘行业
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(120) | 行业名(保安/保洁/餐饮…) |
| sortOrder | int | 排序 |
| active | boolean default true | 是否启用 |

唯一约束:`(companyId, name)`。

### 4.3 `recruitment_jobs` — 招聘岗位
| 字段 | 类型 | 说明 |
|---|---|---|
| industryId | uuid → recruitment_industries | 行业 |
| title | varchar(200) | 岗位名(如"保洁场地管理") |
| headcount | int notnull default 1 | 招聘人数 |
| salaryMin / salaryMax | int (分/元,二选一统一单位) | 薪资区间 |
| salaryNote | varchar(200) | 薪资补充(如"包吃住""时薪") |
| jobContent | text | 工作内容 |
| requirements | text | 要求(国籍/年龄/能否带人管理/经验) |
| nationalities | text[] / varchar | 可接受国籍标签(SG本地/PR/马来/中国…),便于筛选 |
| status | recruitmentJobStatus default open | |
| priority | recruitmentJobPriority default normal | 手动紧急标记 |
| ownerId | uuid → employees (nullable) | 岗位负责人(可空) |

> "已录用数 / 缺口"不存字段,由候选人 `status=offered & intendedJobId` 实时统计(见 §10)。

### 4.4 `recruitment_materials` — 物料(可复用)
| 字段 | 类型 | 说明 |
|---|---|---|
| jobId | uuid → recruitment_jobs | 所属岗位 |
| type | recruitmentMaterialType | 文案/配图/传单/展架 |
| title | varchar(200) | 物料名 |
| textContent | text (nullable) | type=copy 时的文案正文 |
| documentId | uuid → documents (nullable) | type=image/flyer/stand 时上传的文件 |
| aiGenerated | boolean default false | 文案是否 AI 生成 |

### 4.5 `recruitment_postings` — 线上发布
| 字段 | 类型 | 说明 |
|---|---|---|
| jobId | uuid → recruitment_jobs | 岗位 |
| platform | varchar(120) | 平台名(自由填,如 FB/小红书/某招聘站) |
| copyMaterialId | uuid → recruitment_materials (nullable) | 选用的文案 |
| imageMaterialId | uuid → recruitment_materials (nullable) | 选用的配图 |
| publishedOn | date | 发布日期(发了几天 = today − publishedOn) |
| status | recruitmentPostingStatus default publishing | 发布中/暂停/结束 |
| ownerId | uuid → employees | **负责人(谁盯这条)** |
| inquiryCount | int default 0 | 咨询人数(手填,可随时更新) |
| notes | text | 备注 |

> 候选人通过 `sourcePostingId` 反查"这条发布带来多少线索/面试/录用"。

### 4.6 `recruitment_campaigns` — 线下招聘活动
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(200) | 活动名 |
| type | recruitmentCampaignType | 路演/发传单/摆展台/其他 |
| status | recruitmentCampaignStatus default planned | 计划中/已完成/取消 |
| location | varchar(255) | 地点 |
| plannedDate | date | 计划哪天去 |
| plannedStart / plannedEnd | time | 计划几点到几点 |
| actualDate | date (nullable) | 实际哪天去 |
| ownerId | uuid → employees | 负责人 |
| notes | text | 备注 |

关联表:
- `recruitment_campaign_jobs` (campaignId, jobId) — 一场活动可覆盖多个岗位
- `recruitment_campaign_materials` (campaignId, materialId) — 选用了哪些传单/展架

> 现场快速登记的人通过 `sourceCampaignId` 归到此活动。

### 4.7 `recruitment_candidates` — 候选人/线索
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(200) | 姓名 |
| phone | varchar(64) | 手机号 |
| nationality | varchar(80) | 国籍 |
| photoDocumentId | uuid → documents (nullable) | 现场拍的照片 |
| resumeDocumentId | uuid → documents (nullable) | 简历文件 |
| sourceType | recruitmentSourceType | 来源类型 |
| sourcePostingId | uuid → recruitment_postings (nullable) | 来源发布 |
| sourceCampaignId | uuid → recruitment_campaigns (nullable) | 来源活动 |
| intendedJobId | uuid → recruitment_jobs (nullable) | 意向岗位 |
| status | recruitmentCandidateStatus default new | 状态流转 |
| assignedClerkId | uuid → employees (nullable) | 指派的邀约文员 |
| inTalentPool | boolean default false | 是否进人才库 |
| reusableLater | boolean default false | 以后是否可用 |
| reusableNote | varchar(255) | "以后可用"备注 |
| lastContactedAt | timestamptz (nullable) | 最后跟进时间(算超时用) |
| notes | text | |

**状态流转**:`new(新线索) → invited(已邀约) → interview_scheduled(约了面试) → interviewed(面试完) → offered(录用) / rejected(婉拒) / on_hold(待定)`。
任意状态可勾选 `inTalentPool` 进人才库、`reusableLater` 标以后可用。

### 4.8 `recruitment_followups` — 跟进记录
| 字段 | 类型 | 说明 |
|---|---|---|
| candidateId | uuid → recruitment_candidates | |
| byEmployeeId | uuid → employees | 谁跟进的 |
| type | recruitmentFollowupType | 电话/消息/邀约/备注 |
| note | text | 内容 |
| contactedAt | timestamptz default now | 跟进时间 |

> 新增一条 followup 时同步刷新候选人 `lastContactedAt`。

### 4.9 `recruitment_interviews` — 面试
| 字段 | 类型 | 说明 |
|---|---|---|
| candidateId | uuid → recruitment_candidates | |
| scheduledAt | timestamptz | 约的时间 |
| interviewerId | uuid → employees (nullable) | 面试官 |
| mode | varchar(80) | 方式(现场/电话/视频) |
| status | recruitmentInterviewStatus default scheduled | |
| result | recruitmentInterviewResult default pending | 通过/不通过/待定 |
| rating | int (1–5, nullable) | 评分 |
| notes | text | 面试评价 |

> 创建面试时把候选人 status 推进到 `interview_scheduled`;录结果后可推进到 `interviewed`。

### 4.10 设置项
超时阈值不单独建表,用现有设置机制存(如一条 `recruitment_settings` 单行表或复用通用 settings):
- `overdueInviteDays`(默认 2):线索进来超过 N 天仍 `status=new` 未邀约 → 超时
- `overdueFollowupDays`(默认 3):`lastContactedAt` 超过 N 天未跟进 → 超时

---

## 5. 后端 API(Fastify,`apps/api/src/routes/recruitment*.ts`)

沿用现有模式:`app.addHook("preHandler", app.authenticate)`、`requirePerm(...)`、`parseWithSchema(zodSchema, ...)`、公司闸 `getAccessibleCompanyIds(request)` 过滤、返回 `{ resource }` / `{ resources }`。Zod schema 放 `packages/shared/src/schemas/`。

```
# 行业
GET    /api/recruitment/industries
POST   /api/recruitment/industries            requirePerm recruitment.manage
PATCH  /api/recruitment/industries/:id        recruitment.manage

# 岗位
GET    /api/recruitment/jobs                   ?industryId&status&priority&q
POST   /api/recruitment/jobs                   recruitment.manage
GET    /api/recruitment/jobs/:id               (含物料/发布/活动/漏斗汇总)
PATCH  /api/recruitment/jobs/:id               recruitment.manage

# 物料
GET    /api/recruitment/jobs/:id/materials
POST   /api/recruitment/materials              recruitment.manage (图片走 multipart 复用 saveUpload)
PATCH  /api/recruitment/materials/:id          recruitment.manage
DELETE /api/recruitment/materials/:id          recruitment.manage
POST   /api/recruitment/materials/ai-copy      recruitment.manage  (见 §7,生成文案,不落库直接返回草稿)

# 线上发布
GET    /api/recruitment/postings               ?jobId&platform&status&ownerId
POST   /api/recruitment/postings               recruitment.manage
PATCH  /api/recruitment/postings/:id           recruitment.manage (改状态/咨询数等)

# 线下活动
GET    /api/recruitment/campaigns              ?status&type
POST   /api/recruitment/campaigns              recruitment.manage
GET    /api/recruitment/campaigns/:id          (含关联岗位/物料/现场登记的候选人)
PATCH  /api/recruitment/campaigns/:id          recruitment.manage

# 候选人/线索
GET    /api/recruitment/candidates             ?status&intendedJobId&sourceType&assignedClerkId&overdue&inTalentPool
POST   /api/recruitment/candidates             recruitment.candidate.manage (现场快速登记走这个,multipart 传照片)
GET    /api/recruitment/candidates/:id         (含跟进记录 + 面试记录)
PATCH  /api/recruitment/candidates/:id         recruitment.candidate.manage (改状态/指派/人才库/可用)

# 跟进
POST   /api/recruitment/candidates/:id/followups   recruitment.candidate.manage (同步 lastContactedAt)

# 面试
POST   /api/recruitment/interviews             recruitment.candidate.manage
PATCH  /api/recruitment/interviews/:id         recruitment.candidate.manage

# Dashboard 汇总(见 §9)
GET    /api/recruitment/dashboard              recruitment.view
```

注册:`apps/api/src/routes/index.ts` 加 `await app.register(registerRecruitmentRoutes)`。

---

## 6. 权限(`packages/shared/src/permissions.ts`)

新增 3 个权限:
| 权限 | 含义 |
|---|---|
| `recruitment.manage` | 管岗位/物料/发布/活动/行业/设置 |
| `recruitment.view` | 只读(含 Dashboard) |
| `recruitment.candidate.manage` | 管候选人/跟进/面试(给**邀约文员**这个就够,不必给全权) |

角色矩阵(`ROLE_PERMISSIONS`)建议:
- `owner` / `admin`:全部三个
- 邀约文员:用现有合适角色 + override 授予 `recruitment.view` + `recruitment.candidate.manage`(无需新增角色;通过候选人 `assignedClerkId` 指派具体人)

公司隔离:所有列表/详情按 `getAccessibleCompanyIds` 过滤;`:id` 端点校验资源 companyId 在可访问范围,否则 403(对齐 Phase 7 公司闸全覆盖)。

---

## 7. AI 文案生成(新能力)

- 后端新增一个轻量 LLM 客户端(`apps/api/src/lib/ai.ts`),接 **Claude API**(默认用最新可用模型,如 `claude-opus-4-8` / 视成本选 `claude-sonnet-4-6` / `claude-haiku-4-5`)。API key 走环境变量,不硬编码。
- 端点 `POST /api/recruitment/materials/ai-copy`:入参 = 岗位信息(行业、岗位名、薪资、工作内容、要求)+ 文案类型(招聘广告词 / 岗位描述 / 邀约话术)+ 可选语气/平台。返回纯文本草稿,**不自动落库**——前端展示在物料编辑框里,人工改完再保存为 `recruitment_materials`(`aiGenerated=true`)。
- 失败降级:LLM 不可用时返回明确错误,前端提示"AI 暂不可用,可手动填写",不阻塞主流程。

---

## 8. 超时提醒(系统内)

- 无需定时任务:在 `GET /api/recruitment/candidates?overdue=1` 和 Dashboard 汇总里**实时按阈值计算**:
  - `status=new` 且 `now − createdAt > overdueInviteDays` → 超时未邀约
  - `lastContactedAt` 为空或 `now − lastContactedAt > overdueFollowupDays` 且状态未结束(非 rejected/offered)→ 超时未跟进
- 前端:候选人页加"待跟进"Tab;**侧边栏菜单项显示待办计数 Badge**(轮询 dashboard 汇总数)。

---

## 9. 招聘 Dashboard(`/recruitment` 首页)

`GET /api/recruitment/dashboard` 一次返回所有卡片数据。图表用 ECharts(§3.3)。卡片:

1. **缺口总览**:总缺口 = Σ(open 岗位的 headcount − 已录用数);按岗位列出缺几个,按缺口降序。已录用数 = `candidates where status=offered & intendedJobId=该岗位` 计数。
2. **紧急岗位**:`priority=urgent` 置顶 + 自动判定(缺口>0 且发布天数 > 阈值仍未招满 / 最近 N 天该岗位无新线索),红色高亮。
3. **每日新增线索趋势**:按 `candidates.createdAt` 按天分组,可切换"按发布 / 按岗位"维度;直接看每条发布每天进多少人,掉零预警。
4. **招聘活动战报**:每场 campaign 的 线索数 / 约面试数 / 录用数(经 sourceCampaignId 关联统计)。
5. **平台效果对比**:选定岗位 → 各 posting.platform 的 线索数/面试数/录用数 横向对比 → 看哪个平台更好招。
6. **待跟进提醒**:超时线索计数 + 名单入口(见 §8)。

---

## 10. 统计口径(避免歧义)

| 指标 | 定义 |
|---|---|
| 某岗位"已录用" | `candidates` 中 `intendedJobId=该岗位 AND status=offered` 计数 |
| 某岗位"缺口" | `max(0, headcount − 已录用)` |
| 发布"发了几天" | `today − publishedOn`(status=publishing 时实时;ended 时算到结束) |
| 发布"带来线索" | `candidates where sourcePostingId=该发布` 计数 |
| 活动"带来线索" | `candidates where sourceCampaignId=该活动` 计数 |
| 转化:面试数 | 关联候选人有至少一条 `interviews` |
| 转化:录用数 | 关联候选人 `status=offered` |

> "咨询数(inquiryCount)"是发布上的手填字段(对外咨询量),与"线索数"(已登记进系统的人)是两个不同口径,Dashboard 分别展示。

---

## 11. 前端页面(`apps/web/src/pages/recruitment/`)

路由(`App.tsx`):
```
/recruitment (RecruitmentLayout)
  index            → RecruitmentDashboardPage   (§9 看板,首页)
  jobs             → JobsPage                    (岗位列表,§3.1 骨架)
  jobs/:id         → JobDetailPage               (岗位详情:物料/发布/活动/漏斗,§3.3 卡片分块)
  postings         → PostingsPage                (线上发布列表)
  campaigns        → CampaignsPage               (线下活动列表 + 计划日历视图)
  campaigns/:id    → CampaignDetailPage          (含现场登记入口)
  candidates       → CandidatesPage              (管道列表 + "待跟进" Tab)
  candidates/:id   → CandidateDetailPage         (跟进记录 + 面试记录时间线)
  talent-pool      → TalentPoolPage              (inTalentPool 过滤视图)
  capture          → QuickCapturePage            (现场快速登记,手机端优化)
  settings         → RecruitmentSettingsPage     (行业管理 + 超时阈值)
```

**UI 落地约定(照 element-admin-reference.md):**
- 所有列表页:`<Box p="md">` 外壳 → `filter-container`(`<Group align="flex-end" wrap="wrap">` 定宽筛选 + 主操作"新建"靠左)→ `<Table withTableBorder withColumnBorders highlightOnHover>`(无大标题,状态用 `<Badge>` 按 §4 状态色,操作列最右)→ 右对齐 `<Pagination>`。模板参照 `pages/business/CasesPage.tsx`。
- 新建/编辑:岗位/发布/活动字段中等,用 `<Modal>`(§3.1);若岗位表单偏长可升级为独立创建页(§3.2)。
- 候选人管道:看板/列表二选一,先做列表 + 状态 Badge + 行内推进状态;"待跟进"Tab 用 `overdue=1`。
- **现场快速登记**:单列大输入,姓名 + 手机 + 拍照(`<FileButton>` 调摄像头)+ 意向岗位下拉,一屏提交;手机端宽度优先。
- API 客户端:`apps/web/src/api/recruitment.ts`,fetch + `credentials:"include"`,React Query 缓存,key 命名 `["recruitment", ...]`。
- 菜单:侧边栏新增"招聘管理"一级项 → `/recruitment`,带待跟进计数 Badge。
- i18n:`locales/` 加 `recruitment.*` 中英文 key。

---

## 12. 动代码位置清单(实现时按此落)

| 层 | 文件/目录 |
|---|---|
| 枚举 | `packages/db/src/schema/enums.ts` + `packages/shared/src/enums.ts` |
| 表 | `packages/db/src/schema/recruitment*.ts`(8 表 + 关联表)→ `schema/index.ts` 导出 → `pnpm db:generate` + `pnpm db:migrate` |
| Zod schema | `packages/shared/src/schemas/recruitment.ts` |
| 权限 | `packages/shared/src/permissions.ts`(+3 权限,改 ROLE_PERMISSIONS) |
| API | `apps/api/src/routes/recruitment*.ts` → `routes/index.ts` 注册 |
| AI 客户端 | `apps/api/src/lib/ai.ts`(Claude API) |
| 前端页面 | `apps/web/src/pages/recruitment/*`(11 页) |
| API 客户端 | `apps/web/src/api/recruitment.ts` |
| 路由 | `apps/web/src/App.tsx` |
| 菜单 | AppShell 侧边栏 |
| i18n | `apps/web/src/locales/*` |

---

## 13. 风险 / 待确认

- AI 文案用哪个 Claude 模型档(opus/sonnet/haiku)按成本敏感度定,实现时给可配置项,默认 sonnet。
- 薪资单位(分 vs 元、月薪 vs 时薪)需在实现前敲定字段语义,本 spec 暂定 int + salaryNote 兜底。
- "现场快速登记"是否需要离线可用(网络差的展台现场)——一期假设有网;离线缓存留二期。
- 二期自动化依赖各平台能力,届时单独立项。
