# 招聘素材:平台主数据下拉 + 文案双层提示词(图片生成留二期)

日期:2026-06-30。范围:招聘模块 material 生成 + platform 输入统一。

## 决策(用户已拍板)
- 图片(image/flyer/stand)**本期不动**,仍手动上传;ChatGPT 订阅无编程出图通道,留二期。
- 文案类型**复用现有 `copy` 枚举值**(UI 标签改显示 "Text/文案",枚举不变零迁移)。
- 平台用**名字**存(不引 id 外键),主表只喂选项 + 持久化新增名,零数据迁移。
- 三块一起做。迁移号 **0046**(master 已到 0045,避并发撞号),idempotent SQL,直接施加 dev 库。

## A. 平台主数据 + 可搜索可新增下拉

### DB(镜像 recruitmentIndustries,去掉 bilingual)
表 `recruitment_platforms`:`id / company_id(fk companies cascade) / name varchar(120) / sort_order int default 0 / active bool default true / created_at / updated_at`,`unique(company_id, name)`。
迁移里 backfill:把 `recruitment_postings.platform` 去重 + `unnest(recruitment_materials.platforms)` 去重,按 company 插入(ON CONFLICT DO NOTHING)。

### 后端(apps/api/src/routes/recruitment.ts)
- `GET /recruitment/platforms?company_id=&active=` 列出
- `POST /recruitment/platforms` `{company_id,name}` 新增(ON CONFLICT 返回已存在行)
权限沿用 recruitment.view / recruitment.manage。

### 前端
- 新组件 `PlatformSelect`(单选,基于 `CreatableEntitySelect`):选项来自 listPlatforms,onCreate→createPlatform 持久化。用在 **Posting 表单**(替换 L628 Autocomplete)。
- **Material 表单**多值 platforms:保留 Mantine `TagsInput`(本就是可搜索+可新增 UX),但 `data` 换成平台主数据名字;onChange 检测到新名字→fire-and-forget `createPlatform` 持久化。
- 不迁移历史:posting.platform(text)、material.platforms(text[])仍存名字;matchesPlatform 等照旧。

## B. 文案双层提示词

### DB
表 `recruitment_prompt_templates`:`id / company_id(fk cascade) / material_type(复用 recruitment_material_type 枚举) / base_prompt text default '' / created_at / updated_at`,`unique(company_id, material_type)`。
迁移 seed:每 company × 每 material_type 建行(ON CONFLICT DO NOTHING);copy 的 base_prompt 默认 = 现 ai.ts 那段指令("你是新加坡本地招聘文案助手…")。
`recruitment_materials` 加列 `tune_prompt text`(可空)。

### 后端
- `GET /recruitment/prompt-templates?company_id=` 列出各类型
- `PATCH /recruitment/prompt-templates/:id` `{base_prompt}` 更新
- 重构 `apps/api/src/lib/ai.ts`:`buildRecruitmentPrompt` 接受 `base_prompt`(替换硬编码首行指令)+ `tune_prompt`(拼在 base 后)+ 保留岗位上下文块 + 参考原文。无 base_prompt 行时回退现硬编码指令(向后兼容)。
- `POST /recruitment/materials/ai-copy`:入参加 `tune_prompt`、`material_type`(或沿用 copy_type);路由先查该 company+type 的 base_prompt,连同 tune_prompt 传给 generateRecruitmentCopy。生成仍走 `claude -p`(已可用)。
- material create/update:接受并存 `tune_prompt`。

### 前端
- MaterialModal(copy 类型)加「微调提示词」Textarea→`tune_prompt`,生成时传给 ai-copy,Save 时存到 material。
- RecruitmentSettingsPage 加 Card「素材提示词」:按 company 列各类型 base_prompt,Textarea onBlur 保存(很少改)。再加 Card「平台」列出/停用(镜像 industries,可选)。
- i18n:`recruitment.materialType.copy` 标签 zh"文案"/en"Text";新增 tune_prompt / 平台设置 / 提示词设置 文案 key。
- api/recruitment.ts:listPlatforms/createPlatform/listPromptTemplates/updatePromptTemplate;material+ai-copy 类型加 tune_prompt。

## C. 图片:本期不动(手动上传)。base prompt 行已为各类型预留,二期接通道再启用。

## 不做
ChatGPT 出图;platform 历史转 id;动 Posting/Campaign 引用素材逻辑。

## 测试/验证
- buildRecruitmentPrompt 纯函数单测(base+tune+context 拼接、无 base 回退)。
- 平台 CRUD + backfill;dev 冒烟:Posting/Material 平台下拉可选可新增;设置页改 base prompt;Material 填微调提示词→AI 生成→Generated copy 显示。

## 并发注意
dev 主树有并发会话(documents/brochure)。本分支会改 en/zh.json + _journal.json(与之冲突面),合并前查 master tip + 扫冲突;迁移用 0046 避号。
