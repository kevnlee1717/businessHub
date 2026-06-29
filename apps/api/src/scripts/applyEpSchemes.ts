import { randomUUID } from "node:crypto";
import {
  businesses,
  collectionItems,
  db,
  pool,
  schemeLines,
  schemeMilestones,
  schemeVersions
} from "@bh/db";
import { and, asc, eq } from "drizzle-orm";

type Args = {
  dryRun: boolean;
};

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type SchemeVersionRow = typeof schemeVersions.$inferSelect;

type EpSchemeVersionSeed = {
  label: string;
  defaultPrice: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  note: string;
  current: boolean;
};

type MilestoneSeed = {
  seq: number;
  label: string;
  collectionItemCode: "deposit" | "final";
  basis: "percent";
  value: string;
  bindStepOrder: number;
  dueOffsetDays: number | null;
};

const epSchemeVersions: EpSchemeVersionSeed[] = [
  {
    label: "早期档",
    defaultPrice: 15000,
    effectiveFrom: null,
    effectiveTo: "2025-07-31",
    note: "EP pricing archive: early template period through 2025-07-31; default base price SGD 15000.",
    current: false
  },
  {
    label: "V3档",
    defaultPrice: 10000,
    effectiveFrom: "2025-08-01",
    effectiveTo: "2026-02-28",
    note: "EP pricing archive: V3 period from 2025-08-01 through 2026-02-28; default base price SGD 10000.",
    current: false
  },
  {
    label: "V4档(现行)",
    defaultPrice: 10000,
    effectiveFrom: "2026-03-01",
    effectiveTo: null,
    note: "EP pricing archive: V4 current period from 2026-03-01; default base price SGD 10000.",
    current: true
  }
];

const milestoneSeeds: MilestoneSeed[] = [
  {
    seq: 1,
    label: "订金",
    collectionItemCode: "deposit",
    basis: "percent",
    value: "50.00",
    bindStepOrder: 1,
    dueOffsetDays: null
  },
  {
    seq: 2,
    label: "尾款",
    collectionItemCode: "final",
    basis: "percent",
    value: "50.00",
    bindStepOrder: 6,
    dueOffsetDays: 3
  }
];

function parseArgs(argv: string[]): Args {
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun };
}

function toNumeric(value: number, digits = 3): string {
  return value.toFixed(digits);
}

async function findRequiredCollectionItems(tx: DbLike) {
  const rows = await tx
    .select()
    .from(collectionItems)
    .where(eq(collectionItems.active, true))
    .orderBy(asc(collectionItems.sortOrder), asc(collectionItems.code));
  const byCode = new Map(rows.map((item) => [item.code, item]));
  const deposit = byCode.get("deposit");
  const final = byCode.get("final");

  if (!deposit) {
    throw new Error("collection_item_missing: deposit");
  }
  if (!final) {
    throw new Error("collection_item_missing: final");
  }

  return { deposit, final };
}

async function upsertVersion(
  tx: DbLike,
  businessId: string,
  seed: EpSchemeVersionSeed,
  dryRun: boolean
): Promise<SchemeVersionRow | { id: string; label: string }> {
  const [existing] = await tx
    .select()
    .from(schemeVersions)
    .where(and(eq(schemeVersions.businessId, businessId), eq(schemeVersions.label, seed.label)))
    .limit(1);

  const values = {
    businessId,
    label: seed.label,
    status: "active" as const,
    effectiveFrom: seed.effectiveFrom,
    effectiveTo: seed.effectiveTo,
    assumedInputs: { price: seed.defaultPrice },
    profitRate: "1.000",
    note: seed.note
  };

  if (existing) {
    console.log(`version update: ${seed.label} (${existing.id})`);
    if (!dryRun) {
      const [updated] = await tx.update(schemeVersions).set(values).where(eq(schemeVersions.id, existing.id)).returning();
      return updated ?? existing;
    }
    return existing;
  }

  const dryRunId = randomUUID();
  console.log(`version insert: ${seed.label} (${dryRun ? dryRunId : "new id"})`);
  if (dryRun) {
    return { id: dryRunId, label: seed.label };
  }

  const [created] = await tx.insert(schemeVersions).values(values).returning();
  if (!created) {
    throw new Error(`scheme_version_create_failed: ${seed.label}`);
  }
  return created;
}

async function upsertRevenueLine(
  tx: DbLike,
  versionId: string,
  defaultPrice: number,
  dryRun: boolean
) {
  const [existing] = await tx
    .select()
    .from(schemeLines)
    .where(
      and(
        eq(schemeLines.versionId, versionId),
        eq(schemeLines.kind, "revenue"),
        eq(schemeLines.recurrence, "one_time"),
        eq(schemeLines.inputKey, "price")
      )
    )
    .limit(1);

  const values = {
    versionId,
    sortOrder: 0,
    kind: "revenue" as const,
    basis: "fixed" as const,
    recurrence: "one_time" as const,
    partyId: null,
    rate: toNumeric(defaultPrice),
    unitLabel: null,
    inputKey: "price",
    milestoneSplit: null,
    label: "总价",
    note: "EP base service price; case-level price can override via billing.inputs.price."
  };

  if (existing) {
    console.log(`  revenue line update: ${existing.id} price=${defaultPrice}`);
    if (!dryRun) {
      await tx.update(schemeLines).set(values).where(eq(schemeLines.id, existing.id));
    }
    return;
  }

  console.log(`  revenue line insert: price=${defaultPrice}`);
  if (!dryRun) {
    await tx.insert(schemeLines).values(values);
  }
}

async function upsertMilestones(
  tx: DbLike,
  versionId: string,
  collectionItemIds: Record<MilestoneSeed["collectionItemCode"], string>,
  dryRun: boolean
) {
  for (const seed of milestoneSeeds) {
    const [existing] = await tx
      .select()
      .from(schemeMilestones)
      .where(and(eq(schemeMilestones.versionId, versionId), eq(schemeMilestones.seq, seed.seq)))
      .limit(1);

    const values = {
      versionId,
      seq: seed.seq,
      label: seed.label,
      collectionItemId: collectionItemIds[seed.collectionItemCode],
      basis: seed.basis,
      value: seed.value,
      bindStepOrder: seed.bindStepOrder,
      dueOffsetDays: seed.dueOffsetDays,
      note: seed.seq === 2 ? "MOM approval + 3 days." : "Due at contract signing."
    };

    if (existing) {
      console.log(
        `  milestone update: #${seed.seq} ${seed.label} ${seed.value}% step=${seed.bindStepOrder} dueOffset=${seed.dueOffsetDays ?? "null"}`
      );
      if (!dryRun) {
        await tx.update(schemeMilestones).set(values).where(eq(schemeMilestones.id, existing.id));
      }
      continue;
    }

    console.log(
      `  milestone insert: #${seed.seq} ${seed.label} ${seed.value}% step=${seed.bindStepOrder} dueOffset=${seed.dueOffsetDays ?? "null"}`
    );
    if (!dryRun) {
      await tx.insert(schemeMilestones).values(values);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(args.dryRun ? "Mode: dry-run (no database writes)" : "Mode: apply");

  await db.transaction(async (tx) => {
    const [epBusiness] = await tx.select().from(businesses).where(eq(businesses.code, "ep")).limit(1);
    if (!epBusiness) {
      throw new Error("business_missing: ep");
    }

    const collectionItemRows = await findRequiredCollectionItems(tx);
    const collectionItemIds = {
      deposit: collectionItemRows.deposit.id,
      final: collectionItemRows.final.id
    };

    let defaultVersionId: string | null = null;
    let versionsUpserted = 0;
    let milestonesUpserted = 0;

    for (const seed of epSchemeVersions) {
      const version = await upsertVersion(tx, epBusiness.id, seed, args.dryRun);
      versionsUpserted += 1;

      await upsertRevenueLine(tx, version.id, seed.defaultPrice, args.dryRun);
      await upsertMilestones(tx, version.id, collectionItemIds, args.dryRun);
      milestonesUpserted += milestoneSeeds.length;

      if (seed.current) {
        defaultVersionId = version.id;
      }
    }

    if (!defaultVersionId) {
      throw new Error("ep_current_version_missing");
    }

    console.log(`business default version -> ${defaultVersionId}`);
    if (!args.dryRun) {
      await tx.update(businesses).set({ defaultVersionId }).where(eq(businesses.id, epBusiness.id));
    }

    console.log(
      `summary: versionsUpserted=${versionsUpserted}, revenueLinesUpserted=${versionsUpserted}, milestonesUpserted=${milestonesUpserted}, defaultVersionId=${defaultVersionId}`
    );
  });
}

try {
  await main();
} finally {
  await pool.end();
}
