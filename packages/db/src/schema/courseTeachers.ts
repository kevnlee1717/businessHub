import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { teachers } from "./teachers";

export const courseTeachers = pgTable(
  "course_teachers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    courseKind: text("course_kind").notNull(),
    courseId: uuid("course_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("course_teachers_unique").on(table.teacherId, table.courseKind, table.courseId)]
);
