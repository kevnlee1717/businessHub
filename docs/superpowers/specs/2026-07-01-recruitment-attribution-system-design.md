# 招聘:候选人详情/面试工作流/效果归因统计(3 阶段)

日期:2026-07-01。用户已确认:发布 免费/付费+金额、活动 金额;新「效果分析」tab;三阶段全做。

## 现状关键(摸底结论)
- 面试表 recruitment_interviews 已有 scheduled_at/interviewer_id/mode/status(scheduled/done/no_show/cancelled)/result(pending/pass/fail)/rating/notes;详情页只暴露 约时间/方式/面试官。
- 候选人新字段 ethnicity/age_band/experience_level/nationality 后端 list 不支持筛选;详情页基本只读。
- 归因主键齐(source_posting_id/source_campaign_id→素材/平台/地点),但**发布/活动无任何费用字段**。
- 看板只有数量漏斗,无平台汇总/金额/ROI;interview 计数有重复计 bug。
- platform 是 posting 上自由文本 varchar(有 recruitment_platforms 字典但未外键)。

## 阶段 1 — 候选人详情页 + 标签筛选
- 后端:GET /recruitment/candidates/:id 附带 `resume_document`{id,storage_path,filename,mime}(按 resumeDocumentId 查 documents)。
- 详情页 CandidateDetailPageImpl 加「候选人信息」编辑卡:nationality(下拉 SG/PR/Malaysia/China)、ethnicity/age_band/experience_level(下拉,代码+i18n,复用 0048 的命名空间)、notes、assigned_clerk_id、status(recruitmentCandidateStatuses)、in_talent_pool(Checkbox);简历=有则 fileUrl 查看链接(重传本阶段不做,PATCH 暂 JSON-only)。Save→updateRecruitmentCandidate(PATCH JSON)。
- 候选人列表 CandidatesPageImpl 加 nationality/ethnicity/age_band/experience_level 前端筛选(和现有 company/job/status 并列)。

## 阶段 2 — 面试工作流 + 未来预约 tab
- 详情页面试区:约面试表单补全(time/interviewer/mode);每条面试可改 status(已约/已面/未出现/已取消≈不愿来)+ result(通过/不通过)+ rating + notes(评语);一键放入人才库(toggle in_talent_pool)。
- 「未约面试超时」:候选人无任何面试 + createdAt 超 N 天 → 列表标记/可筛(回答"多久还没约")。
- 新 tab「未来预约」:新接口 GET /recruitment/interviews/upcoming(scheduled_at≥今天 且 status=scheduled,join 候选人 name/phone/job/source + 面试官),新页面+导航 tab。

## 阶段 3 — 效果归因统计(新「效果分析」tab)
- 费用字段:postings 加 `is_paid` boolean + `cost` numeric(付费才填);campaigns 加 `cost` numeric。迁移+schema+zod+表单(发布表单加 免费/付费 toggle+费用;活动表单加费用)。
- 归因聚合(新接口 GET /recruitment/analytics):以 candidates 为事实表,按 source 回溯,漏斗 lead→interview(去重候选人,修 bug)→offer(status offered/hired)。维度:
  - 平台:按 platform 文本跨 posting 汇总 + 总费用 + cost-per-lead/hire + 免费vs付费对比。
  - 素材/文案:每 copy/image material → 参与 posting/campaign 带来的 lead/interview/offer 排名。
  - 地点:按 campaign location 汇总 + 费用 + ROI。
  - 某岗位最优平台/素材/地点。
- 新 tab「效果分析」展示排名表;顺手修面试重复计数。

## 工程约定
每阶段独立 worktree+codex+部署 dev;迁移幂等 IF NOT EXISTS,直接施加 dev 库,避并发撞号;主树有并发会话(EP/documents),合并前查 tip。未发 prod。
