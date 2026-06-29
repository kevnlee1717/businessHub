import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { diplomaPrograms } from "./diplomaPrograms";
import { diplomaCourses } from "./diplomaCourses";

export const diplomaIntakes = pgTable("diploma_intakes", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 批次现在挂专业(program);course_id 保留为 nullable 遗留列(迁移用,后续可删)
  programId: uuid("program_id").references(() => diplomaPrograms.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").references(() => diplomaCourses.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startDate: date("start_date"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
