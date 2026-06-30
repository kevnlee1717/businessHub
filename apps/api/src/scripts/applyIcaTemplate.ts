import { config } from "dotenv";
config({ path: "../../.env" });

import { db, icaTemplateSteps, pool, templateSteps, workflowTemplates } from "@bh/db";
import { and, asc, eq } from "drizzle-orm";

async function main() {
  console.log("applyIcaTemplate: start");

  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(and(eq(workflowTemplates.businessType, "ica"), eq(workflowTemplates.name, "ICA 申诉")))
    .limit(1);

  if (!template) {
    throw new Error("ica_workflow_template_not_found: businessType=ica name='ICA 申诉'");
  }

  console.log(`found template: id=${template.id}`);

  const existingSteps = await db
    .select()
    .from(templateSteps)
    .where(eq(templateSteps.templateId, template.id))
    .orderBy(asc(templateSteps.stepOrder));

  const stepByOrder = new Map(existingSteps.map((step) => [step.stepOrder, step]));

  let updated = 0;
  let skipped = 0;

  for (const stepSeed of icaTemplateSteps) {
    const existingStep = stepByOrder.get(stepSeed.stepOrder);
    if (!existingStep) {
      console.warn(`step #${stepSeed.stepOrder} not found in DB, skipping`);
      skipped += 1;
      continue;
    }

    await db
      .update(templateSteps)
      .set({ requiredDocuments: stepSeed.requiredDocuments })
      .where(eq(templateSteps.id, existingStep.id));

    console.log(
      `step #${stepSeed.stepOrder} "${stepSeed.name}" updated: ${stepSeed.requiredDocuments.length} slots`
    );
    updated += 1;
  }

  console.log(`summary: updated=${updated}, skipped=${skipped}`);
}

main().finally(() => pool.end());
