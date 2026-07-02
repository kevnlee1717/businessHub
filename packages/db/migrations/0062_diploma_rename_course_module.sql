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
