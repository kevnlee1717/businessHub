import { integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { servicePackages } from "./packages";

export const packageMilestones = pgTable("package_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageId: uuid("package_id").notNull().references(() => servicePackages.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  label: text("label").notNull(),
  labelEn: text("label_en").notNull(),
  amountSgd: numeric("amount_sgd", { precision: 12, scale: 2 }).notNull(),
  bindStepOrder: integer("bind_step_order"),
  refundableNote: text("refundable_note")
});
