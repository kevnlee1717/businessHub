import { boolean, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { diplomaEnrollments } from "./diplomaEnrollments";

export const diplomaPayments = pgTable(
  "diploma_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => diplomaEnrollments.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    paid: boolean("paid").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("diploma_payments_enrollment_period_unique").on(table.enrollmentId, table.period)]
);
