# diploma 模块术语重命名 + 周/月单位 — 设计文档

日期：2026-07-02
分支：`feat/diploma-rename-course-module`（待建，在 `~/project/businessHub-dev`）
页面：`https://dev-bh.youjia.sg/education/diploma`

## 背景 / 目标

diploma（成人大专）模块当前的术语层级是「Program（专业）→ Course（课程）」。改为「**Course → Module**」，让层级语义更贴合实际：

- 原 **Program** → **Course**（一门课程，以**月**计时长）
- 原 **Course** → **Module**（课程下的模块，以**周**计时长，更准确；一个 module 约 1.5 个月 = 6 周）

范围：**全量改名**（含数据库表名、列名、API 路由、代码符号、i18n 中英文文案）。用户已确认。

## 术语映射

| 现在 | 改成 | 中文 现在 → 改成 |
|---|---|---|
| Program（表 `diploma_programs`） | **Course** | 专业 → **课程** |
| Course（表 `diploma_courses`） | **Module** | 课程 → **模块** |

中文是级联下移：原「专业 / 课程」→「课程 / 模块」。

## 数据模型改动

### 表 `diploma_programs` → `diploma_courses`（= 新 Course）
字段基本不动，保留：
- `id, name, name_en, active, sort_order, price_sgd, created_at`
- `months` integer —— 课程时长（月），手动输入，保持不变（"course 以月算"现成）

### 表 `diploma_courses` → `diploma_modules`（= 新 Module）
- `program_id` → **`course_id`**（FK 指向新 `diploma_courses`）
- **新增 `weeks` integer** —— 模块时长（周），如 6
- **删除 `duration` text** —— 原自由文本时长（仅 1 行旧值，直接丢弃）
- `month_index` → **`sort_order`** —— 模块在课程内的排序号
- 其余不动：`id, name, name_en, content, teacher_id, price_sgd, created_at`

### 引用列级联改名
- `diploma_enrollments`: `program_id`→`course_id`、`course_id`→`module_id`
- `diploma_intakes`: `program_id`→`course_id`、`course_id`→`module_id`
- `diploma_assignments`: `course_id`→`module_id`

## 迁移（顺序敏感，防命名冲突）

"courses" 既是旧名（要腾走）又是新名（要占用），故顺序必须严格：

```sql
-- 1. 先把旧 courses 腾成 modules，空出 "diploma_courses" 名字
ALTER TABLE diploma_courses  RENAME TO diploma_modules;
-- 2. 旧 programs 顶上 "diploma_courses"
ALTER TABLE diploma_programs RENAME TO diploma_courses;

-- 3. 双列表:先 course_id→module_id，再 program_id→course_id（避免撞名）
ALTER TABLE diploma_enrollments RENAME COLUMN course_id  TO module_id;
ALTER TABLE diploma_enrollments RENAME COLUMN program_id TO course_id;
ALTER TABLE diploma_intakes     RENAME COLUMN course_id  TO module_id;
ALTER TABLE diploma_intakes     RENAME COLUMN program_id TO course_id;

-- 4. module 表自身列调整
ALTER TABLE diploma_modules RENAME COLUMN program_id  TO course_id;
ALTER TABLE diploma_modules RENAME COLUMN month_index TO sort_order;
ALTER TABLE diploma_modules ADD  COLUMN weeks integer;
ALTER TABLE diploma_modules DROP COLUMN duration;

-- 5. assignments
ALTER TABLE diploma_assignments RENAME COLUMN course_id TO module_id;
```

FK 约束名（如 `diploma_courses_program_id_...`）会随列改名保留旧约束名——功能不受影响，可不重命名约束（YAGNI）。

数据量极小：`diploma_programs`=1、`diploma_courses`=1、其余全 0，且 dev 库 `businesshub_dev` 与 prod 库 `businesshub` 一致 → 迁移风险低。

### 发布策略（铁律）
- 本次只在 **dev**：写幂等 DDL（`IF EXISTS`/`IF NOT EXISTS` 包裹）灌 `businesshub_dev` + 生成/写入 drizzle migration 文件存档 + rebuild 前端 + `restart bh-dev` + `dev-bh.youjia.sg/education/diploma` 验证。
- 之后用户说"更新到 prod"时：对 prod 库 `businesshub` 手动跑同一套幂等 DDL（**别 `db:migrate`**，drizzle 追踪已漂移到 44），1+1 行数据就地适配，不推 dev 数据。

## 代码爆炸半径（约 15 文件）

**packages/db/src/schema/**
- `diplomaPrograms.ts` → 文件改名 `diplomaCourses.ts`，`export const diplomaPrograms` → `diplomaCourses`，`pgTable("diploma_programs")` → `"diploma_courses"`
- `diplomaCourses.ts` → 文件改名 `diplomaModules.ts`，`export const diplomaCourses` → `diplomaModules`，`pgTable("diploma_courses")` → `"diploma_modules"`，列 `programId/program_id`→`courseId/course_id`、`monthIndex/month_index`→`sortOrder/sort_order`、加 `weeks`、删 `duration`
- `diplomaEnrollments.ts` / `diplomaIntakes.ts`：`programId`→`courseId`、`courseId`→`moduleId`，更新 import 与 `.references()`
- `diplomaAssignments.ts`：`courseId`→`moduleId`
- `schema/index.ts`：更新 re-export

**apps/api/src/routes/**
- `diplomaPrograms.ts` → 文件改名 `diplomaCourses.ts`，端点 `/diploma-programs*`→`/diploma-courses*`，`:programId`→`:courseId`，注册函数名
- `diplomaCourses.ts` → 文件改名 `diplomaModules.ts`，端点 `/diploma-courses*`→`/diploma-modules*`
- `diploma.ts`：enrollments/intakes/assignments 里的字段名与端点引用
- `routes/index.ts`：注册调用改名

**packages/shared/src/schemas/education.ts**：zod schema 字段（`programId`→`courseId`、`courseId`→`moduleId`、加 `weeks`、去 `duration`、`monthIndex`→`sortOrder`）

**前端**
- `apps/web/src/api/education.ts`：API client 函数名 + 请求路径 + 类型
- `apps/web/src/pages/education/DiplomaPage.tsx`：tab 文案、表头、表单字段（周/月输入）
- `apps/web/src/locales/zh.json` + `en.json`：`diploma.*`、`diplomaProgram.*`、`diplomaCourse.*`、导航 `programs/courses` 等键的文案 + 结构

## 明确不改（安全边界）

- `courseTeachers`（`packages/db/src/schema/courseTeachers.ts`）+ `courseTeacherUtils.ts`：**多态共享表**，`courseKind`+`courseId` 跨 diploma/wsq/english 复用。module 的 `id` 不变，其 `courseId` 引用照常有效，`courseKind` 判别值也保持不变。
- `courseDesign*`、`wsqCourses`、`englishCourses/englishEnrollments`、导航里的"课程设计"等：都是**别的功能**，与 diploma 无关，一律不动。
- FK/index 约束的内部名称：随列改名保留旧名即可，不额外重命名。

## 验证

- typecheck（`pnpm -r typecheck` 或对应命令）全绿。
- 幂等 DDL 灌 dev 库后：`\d diploma_courses`、`\d diploma_modules` 确认表名/列名/新 `weeks`/无 `duration`/`sort_order`。
- rebuild 前端 + `restart bh-dev`。
- 冒烟 `dev-bh.youjia.sg/education/diploma`：
  - tab 显示 "Courses" / "Modules"（中文"课程"/"模块"）
  - Course 列表出现「商科大专 / Business Diploma」，可编辑 months（月）
  - Module 可编辑 weeks（周）、sort_order
  - Enrollments/Intakes/Assignments 相关接口不报 500（字段改名到位）
- 全外键孤儿扫描（复用之前脚本）在 dev 库跑一遍，确认改名后引用完整性无破坏。

## 非目标（Out of scope）

- 不动其它 education 子模块（english / wsq / course-design / teachers 页面本身）。
- 不重命名 FK/index 约束内部名。
- 不引入 course.months 由 module.weeks 自动汇总的逻辑（用户选了 months 保持手动）。
