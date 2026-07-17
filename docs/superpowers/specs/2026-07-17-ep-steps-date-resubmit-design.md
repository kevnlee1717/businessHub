# EP 步骤增强：完成日期+修改历史 & 补材料/重新提交 · 设计文档

- 日期：2026-07-17
- 作用范围：**仅 EP 案件**。基于上一轮 [2026-07-17-ep-case-detail-redesign] 的 EpStepsPanel。
- 分支：feat/ep-steps-date-resubmit

## 需求（来自用户）

1. **每步完成日期可设/可改 + 修改历史**：check 时可设日期，之后可改；要有修改记录——改了几次、谁改的、谁 check 的。
2. **补材料 / 重新提交**：提交申请(第5步)后、获批前，政府可能要求补充材料；到这步比较重要，要能备注"需要准备什么材料"，然后重新提交，政府可能又要求，来回几次。一次获批的就没有这些轮次。

## 已确认取舍

| 项 | 决定 |
|---|---|
| 补材料显示位置 | **案件级循环**（非硬绑步骤号）。做成「补材料/重新提交记录」卡，放在 EP「步骤」页步骤列表下方；无轮次=空态（一次通过）。 |
| 每轮附件 | **纯文字备注**，不单独传附件；具体文件走已做好的案件「文件」网盘。 |
| 日期历史存储 | **独立审计表**（可查、清楚）。 |

## 设计

### A. 每步完成日期 + 修改历史（所有 EP 步骤）

**数据**
- `case_steps` 加列 `completed_by uuid`（谁 check 的，references employees on delete set null）。
- `completed_at`（现有 timestamptz）改为**可编辑的完成日期**：check 时默认今天、可改。
- 新表 `case_step_date_logs`：
  - `id uuid pk`
  - `case_step_id uuid not null → case_steps(id) on delete cascade`
  - `actor_id uuid → employees(id) on delete set null`
  - `action text not null` —— `'check' | 'uncheck' | 'edit_date'`
  - `old_completed_at timestamptz`、`new_completed_at timestamptz`
  - `created_at timestamptz not null default now()`
  - index on `case_step_id`

**后端**（`PATCH /case-steps/:id`，复用现有路由）
- body 新增可选 `completed_at`（ISO string，可 null）。
- 计算新 completed_at：body.completed_at 显式给了就用它；否则 status→done 默认 now()、status→非done 置 null；status 未变且给了 completed_at 则按给的改。
- 置 done 时写 `completed_by = request.user.id`；置非 done 时 completed_by 置 null。
- 写一条 `case_step_date_logs`：
  - 由"未完成→done" → `check`
  - 由"done→未完成" → `uncheck`
  - status 未变但 completed_at 变了 → `edit_date`
  - 记 actor_id、old/new completed_at。
- `serializeCaseStep` 增加 `completed_by`。
- 新端点 `GET /case-steps/:id/date-logs`（按需拉，形似 followUps），返回该步日志（含 actor 名）。权限 case.view。

**前端**（EpStepsPanel）
- CaseDetailPage 传入 `employeeById`。
- 每步卡：done 时显示完成日期 + "改日期"（date input / 小弹层，默认今天）+ "历史(n)" 可展开（列出：动作、操作人名、旧→新日期、时间；"谁 check 的"从 completed_by/日志 check 行取）。
- check → updateCaseStep({status:"done", force:true, completed_at: <today ISO>})；取消 → {status:"pending"}。日期可事后改。

### B. 补材料 / 重新提交（案件级，EP）

**数据** — 新表 `case_resubmissions`：
- `id uuid pk`
- `case_id uuid not null → cases(id) on delete cascade`
- `round_no integer not null`（创建时 = 现有最大+1，用于显示顺序）
- `required_note text`（政府要求准备的材料，纯文字）
- `status text not null default 'awaiting'` —— `'awaiting'(待补/待重交) | 'resubmitted'(已重交) | 'approved'(已通过)`
- `requested_at date`（政府要材料日期）、`resubmitted_at date`（重新提交日期）
- `created_by uuid → employees(id) on delete set null`
- `created_at timestamptz default now()`、`updated_at timestamptz default now()`
- index on `case_id`

**后端**（case 权限；EP 用，接口不强校验 business_type，前端只在 EP 渲染）
- `GET /cases/:id/resubmissions` → 按 round_no 列出（含 created_by 名）。
- `POST /cases/:id/resubmissions` `{ required_note?, requested_at? }` → round_no = max+1，status 'awaiting'，created_by = actor。
- `PATCH /cases/:id/resubmissions/:rid` `{ required_note?, status?, requested_at?, resubmitted_at? }`。
- `DELETE /cases/:id/resubmissions/:rid`。

**前端** — 新 `CaseResubmissionsPanel({ caseId, canManage })`
- 渲染在 CaseDetailPage 的 steps 分支里、EpStepsPanel 下方。
- 卡标题「政府补材料 / 重新提交」。列出各轮：round_no + 状态 badge + 政府要求材料备注 + 要求日期 / 重交日期。
- canManage：可加新一轮（备注 + 要求日期）、标记"已重新提交"（填重交日期→status resubmitted）、标"已通过"、编辑/删除。
- 空态：一句"一次通过，暂无补材料要求"提示 + "记录补材料要求"按钮。

### i18n
zh.json / en.json 双语加：`caseStep.date.*`（完成日期/改日期/历史/动作名 check·uncheck·edit_date/谁check）、`caseResubmission.*`（标题/轮次/状态/要求材料/要求日期/重交日期/加一轮/已重交/空态）。

## 迁移
- migration `0071_ep_step_dates_resubmissions.sql`：幂等（ADD COLUMN IF NOT EXISTS、CREATE TABLE IF NOT EXISTS、CREATE INDEX IF NOT EXISTS）。
- dev 库手动跑该 DDL（别 db:migrate）；发 prod 时 prod 库也跑同一 DDL。

## 主要改动文件
- 后端：新 schema `caseStepDateLogs.ts` / `caseResubmissions.ts` + `caseSteps.ts` 加列；migration 0071；`cases.ts` 路由（改 patch/case-steps、加 date-logs 与 resubmissions 端点）；`packages/shared/src/schemas/cases.ts` 加 completed_at 与 resubmission schemas。
- 前端：`api/cases.ts`（updateCaseStep 加 completed_at、getStepDateLogs、resubmission CRUD+类型）；`EpStepsPanel.tsx`（日期+历史）；新 `CaseResubmissionsPanel.tsx`；`CaseDetailPage.tsx`（传 employeeById、渲染 CaseResubmissionsPanel）；i18n。

## 非目标（YAGNI）
- 不动 ICA/DP。
- 补材料轮次不做附件（走案件网盘）。
- 不做步骤"计划日期"（仅完成日期）。
- 补材料不硬绑步骤号（案件级）。
