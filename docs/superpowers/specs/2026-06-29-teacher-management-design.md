# 师资管理 + 课程多老师(设计)

日期:2026-06-29
状态:已确认设计,待实现(worktree feat/teacher-mgmt)

## 目标
- 老师是**独立名单**(可外聘,不一定是公司员工),有专门管理页(CRUD)。
- **一门课可挂多个老师**(多对多)。
- **一套老师名单全教育业务共用**(diploma 成人课程 / english 英语 / wsq)。

## 现状
- 三张课程表 `diploma_courses` / `english_classes` / `wsq_courses` 各有一个 `teacher_id`(单老师,指向 employees)。`TeacherSelect` 组件从员工列表选老师。
- 教育路由:/education/diploma|english|wsq|academy-collection。

## 数据模型
- 新表 `teachers`:id, name(notNull), name_en, phone, note, active(bool, default true), created_at。
- 新表 `course_teachers`(多态多对多):id, teacher_id(uuid FK→teachers, onDelete cascade), course_kind(text, 'diploma'|'english'|'wsq'), course_id(uuid), created_at;唯一约束 (teacher_id, course_kind, course_id)。course_id 不设 DB 外键(多态),删课程时应用层清理对应 course_teachers 行。
- 三张课程表的 `teacher_id` 列**退役**(暂留不删,新关联表为准)。

## 后端
- `teachers` CRUD 路由:GET 列表(可按 active 过滤)、POST 建、PATCH 改、DELETE 或 PATCH active=false 停用。权限 education.manage 写 / education.view 读。
- 课程读接口(三种):join course_teachers + teachers,返回 `teachers: [{id,name,name_en}]` 数组。
- 课程存接口(create/update,三种):接收 `teacher_ids: string[]`,事务里删旧 course_teachers(该 course)再插新。保留 teacher_id 入参兼容但以 teacher_ids 为准。
- 删课程:级联清 course_teachers。

## 前端
- 教育模块新增「师资」页(路由 /education/teachers,加进教育导航):列表 + 新增/编辑/停用 弹窗(照 PositionsPage 等现有列表+Modal 模式)。
- 新组件 `TeacherMultiSelect`(从 teachers 名单多选,可内联新建老师),替换三个课程编辑表单里的单个 `TeacherSelect`。
- 三课程列表 Teacher 列:显示多个老师名(标签/逗号分隔)。

## 迁移 + 落地
- 迁移建 teachers + course_teachers 两表(db:generate,压到最后避开并发招聘会话撞号)。
- 现有 course.teacher_id 数据 best-effort 迁移:对每个有 teacher_id 的课程,按该 employee 生成/复用一条 teacher 记录(按名字去重)+ 写 course_teachers。dev 数据少,迁不动就留空。
- worktree 隔离开发,代码 codex 写,先 dev 验证(curl + UI),再合并 master、发 dev。

## 验收
- 师资页能增删改老师。
- 课程编辑能多选老师、保存生效,课程列表显示多老师。
- 一套老师名单在 diploma/english/wsq 都能选。
