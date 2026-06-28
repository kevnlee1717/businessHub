# 招聘模块双语化（中英文实时翻译）设计

日期：2026-06-28
状态：已与用户确认，进入实施
试点范围：招聘模块（recruitment）

## 1. 背景与目标

系统同时有中文员工和英文员工，有人不会中文、有人不会英文。需求：
- 每个用户输入的业务字段都同时保存中文 + 英文。
- 输入中文时自动翻译出英文并保存；输入英文时自动翻译出中文。
- 界面语言为中文时显示中文，为英文时显示英文。
- 机器翻译不好的可以手动修改。
- 包括下拉选择（动态主数据下拉）。

先在招聘模块端到端做通，验证 UX / 翻译质量后再推广到全系统。

## 2. 已有基础设施（复用，不重造）

- **中央翻译表 `translations`**（`packages/db/src/schema/translations.ts`，已建表，迁移 0024 已入库 businesshub_dev）：
  `(entity_type, entity_id, field) → text_zh, text_en, source_lang`，唯一索引保证一字段一行。一张表通吃全系统所有字段，业务表不加列。
- **DeepL 翻译 `apps/api/src/lib/translate.ts`**：`translateText(text, target)`、`makeBilingual(text)`（按是否含汉字判断源语言）。DEEPL_API_KEY 已在 dev .env 配置且实测可用（免费额度 100 万字/月）。
- **翻译存取 `apps/api/src/lib/translationStore.ts`**：`saveTranslation`（写时重译 upsert）、`getTranslations`（批量读）。
- **react-i18next**（`apps/web/src/i18n.ts`）：界面标签 + 固定枚举的中英文。

## 3. 架构决策（已确认）

- **存储**：中央翻译表 sidecar 方案（不给业务表加列）。业务表原列继续存「用户首次输入的原文」，作来源 + 兜底。
- **翻译交互**：表单里**双栏并排**（中/英两格），输入一边、**失焦时自动翻译回填另一边**，可手改，两格一起提交保存。
- **覆盖策略**：失焦时**仅当对面那格为空才自动填**；对面已有内容则不动（保护人工修改）。要覆盖需点字段旁的「🔄 重新翻译」按钮。
- **引擎**：DeepL（快，适合失焦即时翻译）。Claude CLI 太慢，不用于逐字段翻译。
- **下拉**：
  - 动态主数据下拉（招聘行业 `recruitment_industries.name` 等用户可新增的）→ 走双语，按界面语言显示选项。
  - 固定枚举（状态 open/paused、优先级 urgent 等）→ 已由 i18n json 提供中英文，**不进翻译表**。

## 4. 数据流

### 写（保存职位/行业等）
1. 前端表单每个双语字段有 `_zh` / `_en` 两格。
2. 失焦时若对面为空 → 调 `POST /api/translate { text, target }` → 回填。
3. 提交时把每个字段的 zh + en 一起发给后端。
4. 后端业务表原列存「源语言原文」；同时对每个双语字段调 **`saveTranslationPair(entityType, entityId, field, {zh, en, sourceLang})`** —— 按前端送来的值原样 upsert 进 translations，**不再自己重译**（否则会覆盖手改）。

### 读（列表/详情）
1. 后端取业务行后，批量 `getTranslations(entityType, field, ids)`。
2. 每个双语字段在响应里附 `<field>_i18n: { zh, en }`，原列保留作兜底。
3. 前端 `pickLang(field_i18n, lang) ?? row[field]` 决定显示。**绝不空白**：当前语言译文 → 另一语言译文 → 业务表原文。

## 5. 新增/改动清单

### 后端
- `apps/api/src/lib/translationStore.ts`：新增 `saveTranslationPair(...)`（显式存 zh+en，不重译）。保留 `saveTranslation` 给回填/兜底。
- 新增路由 `POST /api/translate`：包 `translateText`，入参 `{ text, target: 'zh'|'en' }`，出参 `{ text }`；空文本/无 key/失败返回 `{ text: '' }`（前端容错）。
- `apps/api/src/routes/recruitment.ts`：
  - jobs 的 create / update：写业务列 + 对 title、job_content、requirements、salary_note 调 saveTranslationPair。
  - jobs 的 list / detail：附 `*_i18n`。
  - industries 的 create / update / list：name 双语。
  - （候选人 candidates、线下活动 campaigns 同法接入，作为试点第二批。）

### 前端
- 新增 `apps/web/src/components/BilingualInput.tsx`：props `{ labelKey, valueZh, valueEn, onChange, multiline? }`。渲染中/英两格 + 失焦翻译（对面空才填）+「重新翻译」按钮。可复用于全系统。
- 新增工具 `apps/web/src/lib/i18nField.ts`：`pickLang(field_i18n, lang)`、`tField(row, field, lang)` 兜底取值。
- 新增 API 封装 `apps/web/src/api/translate.ts`：`translate(text, target)`。
- 招聘职位表单（`apps/web/src/pages/recruitment/*`，表单用自写 useSimpleForm）：把 title/job_content/requirements/salary_note 换成 BilingualInput；提交带 zh+en。
- 招聘列表/详情：用 tField 按界面语言显示。
- 行业下拉：选项 label 按界面语言；新增行业走双语输入。

### 数据
- 一次性回填脚本 `packages/db/src/backfill-translations.ts`（或 apps/api scripts）：扫招聘各表双语字段，对非空原文调 `makeBilingual` 补译进 translations。dev 跑一次；发 prod 时也用它补历史数据。
- 核心**无新迁移**（translations 表已存在）。

## 6. 字段清单（试点）

| 实体 entity_type | 字段 |
|---|---|
| recruitment_job | title, job_content, requirements, salary_note |
| recruitment_candidate | name（人名，DeepL 会音译，常需手改）, notes |
| recruitment_campaign | name, location, notes |
| recruitment_industry | name（动态下拉） |

物料 materials（title/text_content，已有 AI 文案）二期并入。

最窄首条链路：**职位 + 行业下拉** 端到端跑通，再接候选人/活动。

## 7. 测试

- 单元：`saveTranslationPair`（upsert 行为）、`pickLang` 兜底链。
- 集成（API）：建职位带 zh+en → 读回 `*_i18n` 两语言正确；只填中文 → 英文被 DeepL 翻出；改英文且中文已存在 → 中文不被覆盖。
- e2e（playwright，:3012）：失焦翻译回填、手改后不被覆盖、切界面语言列表/详情显示随之变、动态下拉按语言显示。

## 8. 部署

- 在 worktree `.worktrees/bilingual-recruitment`（分支 feat/bilingual-recruitment）开发，隔离并发会话。
- 通过后合并进 `businessHub-dev`，`pnpm --filter @bh/web build` + 重启 `bh-dev`，在 dev-bh.youjia.sg 验证。
- prod 暂不动。

## 9. 非目标（YAGNI）

- 不做全系统其他模块（本次只招聘试点）。
- 不做翻译记忆/术语库/批量审校后台（后续按需）。
- 不改固定枚举的翻译方式（已由 i18n 覆盖）。
- 不引入 Claude CLI 做字段翻译。
