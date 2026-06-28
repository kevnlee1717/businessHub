import { businesses, collectionItems, db, schemeLines, schemeMilestones, schemeVersions } from "@bh/db";
import {
  DEAL_PRESETS,
  dealInputsSchema,
  milestoneCreateSchema,
  milestoneUpdateSchema,
  schemeLineSchema,
  schemeVersionCreateSchema,
  schemeVersionUpdateSchema,
  type DealInputs,
  type SchemeLineInput
} from "@bh/shared";
import { desc, eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import {
  calculateVersionEconomics,
  recalculateVersionProfitRate,
  type ResolvableSchemeLineInput,
  resolvePartyIds,
  serializeDealEconomics,
  serializeSchemeLine
} from "./financeUtils";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

const businessIdParamsSchema = z.object({
  businessId: z.string().uuid()
});

function serializeSchemeVersion(row: typeof schemeVersions.$inferSelect) {
  return {
    id: row.id,
    business_id: row.businessId,
    label: row.label,
    status: row.status,
    effective_from: row.effectiveFrom,
    effective_to: row.effectiveTo,
    assumed_inputs: row.assumedInputs,
    profit_rate: row.profitRate,
    note: row.note,
    created_at: row.createdAt
  };
}

function serializeMilestone(row: typeof schemeMilestones.$inferSelect) {
  return {
    id: row.id,
    version_id: row.versionId,
    seq: row.seq,
    label: row.label,
    collection_item_id: row.collectionItemId,
    basis: row.basis,
    value: row.value,
    bind_step_order: row.bindStepOrder,
    due_offset_days: row.dueOffsetDays,
    note: row.note,
    created_at: row.createdAt
  };
}

async function resolveMilestoneLabel(
  label: string | undefined,
  collectionItemId: string | null | undefined
): Promise<string | null> {
  if (label) {
    return label;
  }
  if (!collectionItemId) {
    return null;
  }

  const [item] = await db
    .select({ name: collectionItems.name })
    .from(collectionItems)
    .where(eq(collectionItems.id, collectionItemId))
    .limit(1);

  return item?.name ?? null;
}

function presetByKey(key: string | undefined) {
  return key ? DEAL_PRESETS.find((preset) => preset.key === key) : undefined;
}

function schemaLineToEngineLine(line: z.infer<typeof schemeLineSchema>): ResolvableSchemeLineInput {
  return {
    kind: line.kind,
    basis: line.basis,
    recurrence: line.recurrence,
    partyId: line.party_id,
    partyCode: line.party_code,
    rate: line.rate === null || line.rate === undefined ? null : Number(line.rate),
    unitLabel: line.unit_label,
    inputKey: line.input_key,
    milestoneSplit: line.milestone_split,
    label: line.label,
    note: line.note,
    sortOrder: line.sort_order
  };
}

async function updateVersionProfitRate(versionId: string) {
  const [version] = await db.select().from(schemeVersions).where(eq(schemeVersions.id, versionId)).limit(1);

  if (!version) {
    return null;
  }

  const profitRate = await recalculateVersionProfitRate(version);
  const [updated] = await db
    .update(schemeVersions)
    .set({ profitRate: toNumeric(profitRate) ?? "0" })
    .where(eq(schemeVersions.id, versionId))
    .returning();

  return updated;
}

export async function registerSchemeVersionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/businesses/:businessId/scheme-versions",
    { preHandler: requirePerm("finance.view") },
    async (request) => {
      const { businessId } = parseWithSchema(businessIdParamsSchema, request.params);
      const rows = await db
        .select()
        .from(schemeVersions)
        .where(eq(schemeVersions.businessId, businessId))
        .orderBy(desc(schemeVersions.createdAt));

      return { scheme_versions: rows.map(serializeSchemeVersion) };
    }
  );

  app.post(
    "/businesses/:businessId/scheme-versions",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { businessId } = parseWithSchema(businessIdParamsSchema, request.params);
      const body = parseWithSchema(schemeVersionCreateSchema, request.body);
      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);

      if (!business) {
        return sendNotFound(reply);
      }

      const preset = presetByKey(body.preset);
      const usePreset = preset && preset.key !== "custom";
      const inputLines = usePreset
        ? preset.lines
        : (body.lines ?? []).map((line) => schemaLineToEngineLine(line));

      if (!usePreset && inputLines.length === 0) {
        return reply.code(400).send({ error: "scheme_lines_required" });
      }

      const assumedInputs = body.assumed_inputs ?? (usePreset ? preset.assumedInputs : {});

      const result = await db.transaction(async (tx) => {
        const [version] = await tx
          .insert(schemeVersions)
          .values({
            businessId,
            label: body.label,
            status: body.status,
            effectiveFrom: body.effective_from,
            effectiveTo: body.effective_to,
            assumedInputs,
            note: body.note
          })
          .returning();

        if (!version) {
          throw new Error("scheme_version_create_failed");
        }

        const resolvedLines = await resolvePartyIds(inputLines, tx);

        if (resolvedLines.length > 0) {
          await tx.insert(schemeLines).values(
            resolvedLines.map((line, index) => ({
              versionId: version.id,
              sortOrder: line.sortOrder ?? index,
              kind: line.kind,
              basis: line.basis,
              recurrence: line.recurrence,
              partyId: line.partyId,
              rate: line.rate === null || line.rate === undefined ? null : toNumeric(line.rate),
              unitLabel: line.unitLabel,
              inputKey: line.inputKey,
              milestoneSplit: line.milestoneSplit,
              label: line.label ?? "",
              note: line.note
            }))
          );
        }

        const profitRate = await recalculateVersionProfitRate(version, tx);
        const [updatedVersion] = await tx
          .update(schemeVersions)
          .set({ profitRate: toNumeric(profitRate) ?? "0" })
          .where(eq(schemeVersions.id, version.id))
          .returning();

        return updatedVersion ?? version;
      });

      return reply.code(201).send({ scheme_version: serializeSchemeVersion(result) });
    }
  );

  app.get("/scheme-versions/:id", { preHandler: requirePerm("finance.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [version] = await db.select().from(schemeVersions).where(eq(schemeVersions.id, id)).limit(1);

    if (!version) {
      return sendNotFound(reply);
    }

    const lines = await db
      .select()
      .from(schemeLines)
      .where(eq(schemeLines.versionId, id))
      .orderBy(schemeLines.sortOrder, schemeLines.createdAt);

    return {
      scheme_version: {
        ...serializeSchemeVersion(version),
        lines: lines.map(serializeSchemeLine)
      }
    };
  });

  app.get(
    "/scheme-versions/:id/milestones",
    { preHandler: requirePerm("finance.view") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const [version] = await db.select().from(schemeVersions).where(eq(schemeVersions.id, id)).limit(1);

      if (!version) {
        return sendNotFound(reply);
      }

      const rows = await db
        .select()
        .from(schemeMilestones)
        .where(eq(schemeMilestones.versionId, id))
        .orderBy(schemeMilestones.seq, schemeMilestones.createdAt);

      return { milestones: rows.map(serializeMilestone) };
    }
  );

  app.post(
    "/scheme-versions/:id/milestones",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const body = parseWithSchema(milestoneCreateSchema, request.body);
      const [version] = await db.select().from(schemeVersions).where(eq(schemeVersions.id, id)).limit(1);

      if (!version) {
        return sendNotFound(reply);
      }

      const label = await resolveMilestoneLabel(body.label, body.collection_item_id);
      if (!label) {
        return reply.code(400).send({ error: "collection_item_not_found" });
      }

      const [milestone] = await db
        .insert(schemeMilestones)
        .values({
          versionId: id,
          seq: body.seq,
          label,
          collectionItemId: body.collection_item_id,
          basis: body.basis,
          value: toNumeric(body.value) ?? "0",
          bindStepOrder: body.bind_step_order,
          dueOffsetDays: body.due_offset_days,
          note: body.note
        })
        .returning();

      if (!milestone) {
        throw new Error("scheme_milestone_create_failed");
      }

      return reply.code(201).send({ milestone: serializeMilestone(milestone) });
    }
  );

  app.patch(
    "/scheme-milestones/:id",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const body = parseWithSchema(milestoneUpdateSchema, request.body);
      const label = await resolveMilestoneLabel(body.label, body.collection_item_id);
      const [milestone] = await db
        .update(schemeMilestones)
        .set({
          seq: body.seq,
          label: label ?? undefined,
          collectionItemId: body.collection_item_id,
          basis: body.basis,
          value: body.value === undefined ? undefined : toNumeric(body.value) ?? "0",
          bindStepOrder: body.bind_step_order,
          dueOffsetDays: body.due_offset_days,
          note: body.note
        })
        .where(eq(schemeMilestones.id, id))
        .returning();

      if (!milestone) {
        return sendNotFound(reply);
      }

      return { milestone: serializeMilestone(milestone) };
    }
  );

  app.delete(
    "/scheme-milestones/:id",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const [milestone] = await db.delete(schemeMilestones).where(eq(schemeMilestones.id, id)).returning();

      if (!milestone) {
        return sendNotFound(reply);
      }

      return { ok: true };
    }
  );

  app.patch("/scheme-versions/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(schemeVersionUpdateSchema, request.body);

    const [version] = await db
      .update(schemeVersions)
      .set({
        label: body.label,
        status: body.status,
        effectiveFrom: body.effective_from,
        effectiveTo: body.effective_to,
        assumedInputs: body.assumed_inputs,
        note: body.note
      })
      .where(eq(schemeVersions.id, id))
      .returning();

    if (!version) {
      return sendNotFound(reply);
    }

    const updated = body.assumed_inputs !== undefined ? await updateVersionProfitRate(id) : version;

    return { scheme_version: serializeSchemeVersion(updated ?? version) };
  });

  app.post(
    "/scheme-versions/:id/lines",
    { preHandler: requirePerm("finance.edit") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const body = parseWithSchema(schemeLineSchema, request.body);
      const [version] = await db.select().from(schemeVersions).where(eq(schemeVersions.id, id)).limit(1);

      if (!version) {
        return sendNotFound(reply);
      }

      const [resolved] = await resolvePartyIds([schemaLineToEngineLine(body)]);
      if (!resolved) {
        throw new Error("scheme_line_resolve_failed");
      }

      const [line] = await db
        .insert(schemeLines)
        .values({
          versionId: id,
          sortOrder: resolved.sortOrder,
          kind: resolved.kind,
          basis: resolved.basis,
          recurrence: resolved.recurrence,
          partyId: resolved.partyId,
          rate: resolved.rate === null || resolved.rate === undefined ? null : toNumeric(resolved.rate),
          unitLabel: resolved.unitLabel,
          inputKey: resolved.inputKey,
          milestoneSplit: resolved.milestoneSplit,
          label: resolved.label ?? "",
          note: resolved.note
        })
        .returning();

      if (!line) {
        throw new Error("scheme_line_create_failed");
      }

      await updateVersionProfitRate(id);

      return reply.code(201).send({ scheme_line: serializeSchemeLine(line) });
    }
  );

  app.patch("/scheme-lines/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(schemeLineSchema.partial(), request.body);
    const [current] = await db.select().from(schemeLines).where(eq(schemeLines.id, id)).limit(1);

    if (!current) {
      return sendNotFound(reply);
    }

    const [resolved] = await resolvePartyIds([
      {
        kind: body.kind ?? current.kind,
        basis: body.basis ?? current.basis,
        recurrence: body.recurrence ?? current.recurrence,
        partyId: body.party_id === undefined ? current.partyId : body.party_id,
        partyCode: body.party_code,
        rate:
          body.rate === undefined
            ? current.rate === null
              ? null
              : Number(current.rate)
            : body.rate === null
              ? null
              : Number(body.rate),
        unitLabel: body.unit_label === undefined ? current.unitLabel : body.unit_label,
        inputKey: body.input_key === undefined ? current.inputKey : body.input_key,
        milestoneSplit: body.milestone_split === undefined ? current.milestoneSplit ?? null : body.milestone_split,
        label: body.label ?? current.label,
        note: body.note === undefined ? current.note : body.note,
        sortOrder: body.sort_order ?? current.sortOrder
      }
    ]);
    if (!resolved) {
      throw new Error("scheme_line_resolve_failed");
    }

    const [line] = await db
      .update(schemeLines)
      .set({
        sortOrder: body.sort_order,
        kind: body.kind,
        basis: body.basis,
        recurrence: body.recurrence,
        partyId: body.party_code !== undefined || body.party_id !== undefined ? resolved.partyId : undefined,
        rate: body.rate === undefined ? undefined : body.rate === null ? null : toNumeric(body.rate),
        unitLabel: body.unit_label,
        inputKey: body.input_key,
        milestoneSplit: body.milestone_split,
        label: body.label,
        note: body.note
      })
      .where(eq(schemeLines.id, id))
      .returning();

    if (!line) {
      return sendNotFound(reply);
    }

    await updateVersionProfitRate(current.versionId);

    return { scheme_line: serializeSchemeLine(line) };
  });

  app.delete("/scheme-lines/:id", { preHandler: requirePerm("finance.edit") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [line] = await db.delete(schemeLines).where(eq(schemeLines.id, id)).returning();

    if (!line) {
      return sendNotFound(reply);
    }

    await updateVersionProfitRate(line.versionId);

    return { ok: true };
  });

  app.post(
    "/scheme-versions/:id/preview",
    { preHandler: requirePerm("finance.view") },
    async (request, reply) => {
      const { id } = parseWithSchema(idParamsSchema, request.params);
      const inputs = parseWithSchema(dealInputsSchema, request.body) as DealInputs;
      const [version] = await db.select().from(schemeVersions).where(eq(schemeVersions.id, id)).limit(1);

      if (!version) {
        return sendNotFound(reply);
      }

      const economics = await calculateVersionEconomics(id, inputs);

      return { economics: serializeDealEconomics(economics) };
    }
  );
}
