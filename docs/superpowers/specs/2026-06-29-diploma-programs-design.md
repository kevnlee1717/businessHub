# 成人大专「专业(program)」层(设计)

日期:2026-06-29
状态:已确认设计(方案 B 全重构),待实现(worktree feat/diploma-programs)

## 目标
成人大专要分"专业":商科大专、酒店大专……每个专业下挂自己的课(商科大专=6门课),每门课有"专业内第几个月"。报名选一个专业 → 自动含该专业所有课。开班批次挂在专业下(整个专业一期一起开)。

## 现状(另一会话刚重构的 265e94e)
- `diploma_courses` 扁平,无专业。`month_index` 全局。
- `diploma_intakes` **per-course**(course_id):每门课各自排期。
- `diploma_enrollments.program` 是 text(notNull),报名 UI 已去掉 program 输入、自动用课程名填。
- DiplomaSection 分 课程/报名/学生 三 tab。

## 方案 B:加专业层(会重构批次与报名)
**和上面那套是相反方向**,需用户协调那个会话停手成人大专。

### 数据模型
- 新表 `diploma_programs`(专业):id, name(notNull), name_en, active(default true), sort_order, created_at。例:商科大专、酒店大专。
- `diploma_courses` 加 `program_id`(uuid FK→diploma_programs, onDelete restrict/set null)。`month_index` 语义=专业内第几个月。
- `diploma_intakes`:`course_id` → 改 `program_id`(批次挂专业)。
- `diploma_enrollments`:`program`(text)→ 改/加 `program_id`(FK→diploma_programs)。过渡保留 program text 列或迁移后弃用。
- assignments / payments 结构不变(per-enrollment)。

### 报名流程
- 报名选 **专业 program_id**(+ 该专业的批次 intake_id)→ 为该专业的所有 diploma_courses 自动建 diploma_assignments(现逻辑已建 assignments,收窄到选中专业的课)。
- program 文本字段:迁移后由 program 名自动带,或弃用。

### 后端
- `diploma_programs` CRUD 路由(GET/POST/PATCH/DELETE,权限 education.view/manage)。
- 课程 CRUD:create/update 收 `program_id`;课程列表可按 program 筛选;返回带 program 信息。
- 批次 intake CRUD:从 course_id 改 program_id(挂专业)。
- 报名 create:收 program_id + intake_id,按该专业课程建 assignments。

### 前端
- 教育模块加「专业」管理页(CRUD 商科大专等)。
- 课程表单加"所属专业"下拉;课程 tab 列表按专业分组/筛选。
- 批次 UI:从挂课程改为挂专业。
- 报名表单:选专业(+该专业的批次)。

### 迁移现有数据
- 建默认专业「商科大专」。
- 现有 diploma_courses 全挂到「商科大专」。
- 现有 diploma_intakes:course_id → 该课所属专业(默认商科大专)的 program_id。
- 现有 diploma_enrollments:program 文本 → 映射到默认专业 program_id。

### 落地约束
- 重构了那个会话刚 ship 的 per-course 批次 → 用户已确认协调那个会话停手成人大专。
- worktree feat/diploma-programs 隔离;codex 写;迁移压最后避撞号;先 dev 验证再合并。

## 验收
- 专业管理页能增删改专业;课程能选所属专业、按专业分组看。
- 批次挂在专业下;报名选专业 → 自动含该专业所有课。
- 现有数据迁移后默认归到「商科大专」,不丢。
