import { db, templateSteps, workflowTemplates } from "@bh/db";
import {
  templateStepCreateSchema,
  templateStepUpdateSchema,
  workflowTemplateCreateSchema,
  workflowTemplateUpdateSchema
} from "@bh/shared";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { requirePerm } from "../auth/jwt";
import { idParamsSchema, parseWithSchema, sendNotFound } from "./hrUtils";

function serializeTemplate(template: typeof workflowTemplates.$inferSelect) {
  return {
    id: template.id,
    business_type: template.businessType,
    name: template.name,
    created_at: template.createdAt
  };
}

function serializeTemplateStep(step: typeof templateSteps.$inferSelect) {
  return {
    id: step.id,
    template_id: step.templateId,
    step_order: step.stepOrder,
    name: step.name,
    name_en: step.nameEn,
    description: step.description,
    required_documents: step.requiredDocuments,
    default_assignee_role: step.defaultAssigneeRole,
    created_at: step.createdAt
  };
}

type RequiredDocument = (typeof templateSteps.$inferSelect)["requiredDocuments"][number];

function normalizeRequiredDocuments(
  items:
    | {
        name: string;
        name_en?: string | undefined;
        required?: boolean | undefined;
      }[]
    | undefined
): RequiredDocument[] | undefined {
  if (items === undefined) {
    return undefined;
  }

  return items.map((item) => ({
    name: item.name,
    ...(item.name_en === undefined ? {} : { name_en: item.name_en }),
    required: item.required ?? true
  }));
}

const workflowTemplateQuerySchema = workflowTemplateCreateSchema.pick({ business_type: true }).partial();

export async function registerWorkflowTemplateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/workflow-templates", { preHandler: requirePerm("case.view") }, async (request) => {
    const query = parseWithSchema(workflowTemplateQuerySchema, request.query);
    const rows = query.business_type
      ? await db
          .select()
          .from(workflowTemplates)
          .where(eq(workflowTemplates.businessType, query.business_type))
          .orderBy(workflowTemplates.businessType, workflowTemplates.name)
      : await db.select().from(workflowTemplates).orderBy(workflowTemplates.businessType, workflowTemplates.name);

    return { templates: rows.map(serializeTemplate) };
  });

  app.get("/workflow-templates/:id", { preHandler: requirePerm("case.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [template] = await db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id)).limit(1);

    if (!template) {
      return sendNotFound(reply);
    }

    const steps = await db
      .select()
      .from(templateSteps)
      .where(eq(templateSteps.templateId, id))
      .orderBy(templateSteps.stepOrder);

    return { template: serializeTemplate(template), steps: steps.map(serializeTemplateStep) };
  });

  app.post("/workflow-templates", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const body = parseWithSchema(workflowTemplateCreateSchema, request.body);
    const [template] = await db
      .insert(workflowTemplates)
      .values({
        businessType: body.business_type,
        name: body.name
      })
      .returning();

    if (!template) {
      throw new Error("workflow_template_create_failed");
    }

    return reply.code(201).send({ template: serializeTemplate(template) });
  });

  app.patch("/workflow-templates/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(workflowTemplateUpdateSchema, request.body);
    const [template] = await db
      .update(workflowTemplates)
      .set({
        businessType: body.business_type,
        name: body.name
      })
      .where(eq(workflowTemplates.id, id))
      .returning();

    if (!template) {
      return sendNotFound(reply);
    }

    return { template: serializeTemplate(template) };
  });

  app.post("/workflow-templates/:id/steps", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(templateStepCreateSchema, request.body);
    const [template] = await db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id)).limit(1);

    if (!template) {
      return sendNotFound(reply);
    }

    const stepOrder = body.step_order ?? (await nextStepOrder(id));
    const [step] = await db
      .insert(templateSteps)
      .values({
        templateId: id,
        stepOrder,
        name: body.name,
        nameEn: body.name_en,
        description: body.description,
        requiredDocuments: normalizeRequiredDocuments(body.required_documents) ?? [],
        defaultAssigneeRole: body.default_assignee_role
      })
      .returning();

    if (!step) {
      throw new Error("template_step_create_failed");
    }

    return reply.code(201).send({ step: serializeTemplateStep(step) });
  });

  app.patch("/template-steps/:id", { preHandler: requirePerm("case.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(templateStepUpdateSchema, request.body);
    const [step] = await db
      .update(templateSteps)
      .set({
        stepOrder: body.step_order,
        name: body.name,
        nameEn: body.name_en,
        description: body.description,
        requiredDocuments: normalizeRequiredDocuments(body.required_documents),
        defaultAssigneeRole: body.default_assignee_role
      })
      .where(eq(templateSteps.id, id))
      .returning();

    if (!step) {
      return sendNotFound(reply);
    }

    return { step: serializeTemplateStep(step) };
  });

  app.delete("/template-steps/:id", { preHandler: requirePerm("case.manage") }, async (request) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    await db.delete(templateSteps).where(eq(templateSteps.id, id));
    return { ok: true };
  });
}

async function nextStepOrder(templateId: string): Promise<number> {
  const rows = await db
    .select({ stepOrder: templateSteps.stepOrder })
    .from(templateSteps)
    .where(eq(templateSteps.templateId, templateId));

  return rows.reduce((max, row) => Math.max(max, row.stepOrder), 0) + 1;
}
