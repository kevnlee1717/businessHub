import { sql } from "drizzle-orm";
import { customType, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { employees } from "./employees";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  }
});

export const faceBaselines = pgTable(
  "face_baselines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    photoPath: text("photo_path").notNull(),
    embedding: bytea("embedding"),
    embeddingModel: text("embedding_model").notNull().default("webface_r50"),
    embeddingDim: integer("embedding_dim"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => [uniqueIndex("face_baselines_employee_active_unique").on(table.employeeId).where(sql`retired_at is null`)]
);
