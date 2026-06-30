import { readFile } from "node:fs/promises";
import {
  db,
  packageItems,
  packageMilestones,
  pool,
  serviceItems,
  servicePackages
} from "@bh/db";
import { eq } from "drizzle-orm";

type Args = {
  dryRun: boolean;
};

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type ServiceCategory = "core_ep" | "banking_tax" | "family" | "gov_fee";

type ServiceItemSeed = {
  code: string;
  name: string;
  nameEn: string;
  category: ServiceCategory;
  defaultPriceSgd: string;
  isCore: boolean;
  billable: boolean;
  sortOrder: number;
};

type PackageSeed = {
  code: string;
  name: string;
  nameEn: string;
  basePriceSgd: string;
  tagline: string;
  isRecommended: boolean;
  sortOrder: number;
};

type MilestoneSeed = {
  seq: number;
  label: string;
  labelEn: string;
  amountSgd: string;
  bindStepOrder: number;
  refundableNote: string | null;
};

const migrationUrl = new URL("../../../../packages/db/migrations/0053_ep_packages_services.sql", import.meta.url);

const serviceItemSeeds = [
  {
    code: "core_ep",
    name: "公司注册 + 董事挂名 + EP 申请（核心：注册+基础合规+本地挂名董事1年+结构设计+EP材料+MOM递交）",
    nameEn: "Company incorporation + nominee director + EP application",
    category: "core_ep",
    defaultPriceSgd: "8000.00",
    isCore: true,
    billable: true,
    sortOrder: 1
  },
  {
    code: "compass",
    name: "前期评估 + COMPASS 打分预判（含风险评估报告）",
    nameEn: "Pre-assessment + COMPASS score forecast",
    category: "core_ep",
    defaultPriceSgd: "1000.00",
    isCore: false,
    billable: true,
    sortOrder: 2
  },
  {
    code: "mom_full",
    name: "MOM 全程跟进 + 不限次数补件",
    nameEn: "Full MOM follow-up + unlimited supplements",
    category: "core_ep",
    defaultPriceSgd: "1800.00",
    isCore: false,
    billable: true,
    sortOrder: 3
  },
  {
    code: "amendment",
    name: "补件处理（单次）",
    nameEn: "Supplement handling (single time)",
    category: "core_ep",
    defaultPriceSgd: "600.00",
    isCore: false,
    billable: true,
    sortOrder: 4
  },
  {
    code: "post_advisory",
    name: "EP 下签后 30 天运营辅导",
    nameEn: "30-day operations advisory after EP approval",
    category: "core_ep",
    defaultPriceSgd: "1500.00",
    isCore: false,
    billable: true,
    sortOrder: 5
  },
  {
    code: "renewal_reminder",
    name: "续签提醒服务（到期前 6 个月）",
    nameEn: "Renewal reminder service (6 months before expiry)",
    category: "core_ep",
    defaultPriceSgd: "400.00",
    isCore: false,
    billable: true,
    sortOrder: 6
  },
  {
    code: "first_renewal",
    name: "第一次续签托管（全包，含材料与递交）",
    nameEn: "First renewal managed service",
    category: "core_ep",
    defaultPriceSgd: "3500.00",
    isCore: false,
    billable: true,
    sortOrder: 7
  },
  {
    code: "bank_account",
    name: "公司公户开户协助（包下户，保证开成）",
    nameEn: "Corporate bank account opening assistance",
    category: "banking_tax",
    defaultPriceSgd: "3000.00",
    isCore: false,
    billable: true,
    sortOrder: 8
  },
  {
    code: "tax_filing",
    name: "首次个人所得税申报代办（第一年）",
    nameEn: "First personal income tax filing",
    category: "banking_tax",
    defaultPriceSgd: "1000.00",
    isCore: false,
    billable: true,
    sortOrder: 9
  },
  {
    code: "dp_pass",
    name: "家属 DP 准证申请（每位）",
    nameEn: "Dependant's Pass application (per person)",
    category: "family",
    defaultPriceSgd: "1800.00",
    isCore: false,
    billable: true,
    sortOrder: 10
  },
  {
    code: "school_app",
    name: "孩子学校申请代办（每个孩子）",
    nameEn: "School application service (per child)",
    category: "family",
    defaultPriceSgd: "2000.00",
    isCore: false,
    billable: true,
    sortOrder: 11
  },
  {
    code: "home_finding",
    name: "新加坡租房找房服务",
    nameEn: "Singapore home finding service",
    category: "family",
    defaultPriceSgd: "2500.00",
    isCore: false,
    billable: true,
    sortOrder: 12
  },
  {
    code: "helper",
    name: "家庭女佣招聘（菲律宾女佣）",
    nameEn: "Domestic helper hiring (Filipino helper)",
    category: "family",
    defaultPriceSgd: "2000.00",
    isCore: false,
    billable: true,
    sortOrder: 13
  },
  {
    code: "pr_pathway",
    name: "PR 路径规划（EP 获批后启动）",
    nameEn: "PR pathway planning (starts after EP approval)",
    category: "family",
    defaultPriceSgd: "2000.00",
    isCore: false,
    billable: true,
    sortOrder: 14
  },
  {
    code: "advisory_3y",
    name: "3 年专属顾问服务（政策实时同步）",
    nameEn: "3-year dedicated advisory service",
    category: "family",
    defaultPriceSgd: "2500.00",
    isCore: false,
    billable: true,
    sortOrder: 15
  },
  {
    code: "gov_fee",
    name: "政府收费（公司注册+EP申请+IPA签发，客户支付）",
    nameEn: "Government fees (company incorporation + EP application + IPA issuance)",
    category: "gov_fee",
    defaultPriceSgd: "750.00",
    isCore: false,
    billable: false,
    sortOrder: 16
  }
] as const satisfies readonly ServiceItemSeed[];

type ServiceItemCode = (typeof serviceItemSeeds)[number]["code"];

const packageSeeds = [
  {
    code: "basic",
    name: "基础版（启动版）",
    nameEn: "Basic (Starter)",
    basePriceSgd: "7000.00",
    tagline: "帮你把流程跑通，适合条件明确、预算敏感的客户",
    isRecommended: false,
    sortOrder: 1
  },
  {
    code: "standard",
    name: "标准版（全流程版）",
    nameEn: "Standard (Full Process)",
    basePriceSgd: "12000.00",
    tagline: "从评估到获批全流程把关，适合绝大多数企业主",
    isRecommended: true,
    sortOrder: 2
  },
  {
    code: "flagship",
    name: "旗舰版（全家规划版）",
    nameEn: "Flagship (Family Planning)",
    basePriceSgd: "22000.00",
    tagline: "把 EP 当成家庭身份规划第一步，适合全家来新、长期规划",
    isRecommended: false,
    sortOrder: 3
  }
] as const satisfies readonly PackageSeed[];

type PackageCode = (typeof packageSeeds)[number]["code"];

const packageItemSeeds: Record<PackageCode, ServiceItemCode[]> = {
  basic: ["core_ep", "gov_fee"],
  standard: ["compass", "core_ep", "bank_account", "mom_full", "post_advisory", "renewal_reminder", "gov_fee"],
  flagship: [
    "compass",
    "core_ep",
    "bank_account",
    "mom_full",
    "post_advisory",
    "renewal_reminder",
    "gov_fee",
    "dp_pass",
    "school_app",
    "home_finding",
    "helper",
    "pr_pathway",
    "first_renewal",
    "advisory_3y",
    "tax_filing"
  ]
};

const packageMilestoneSeeds: Record<PackageCode, MilestoneSeed[]> = {
  basic: [
    {
      seq: 1,
      label: "签约定金",
      labelEn: "Contract deposit",
      amountSgd: "3500.00",
      bindStepOrder: 1,
      refundableNote: "如申请未获批，退还 SGD 1,500"
    },
    {
      seq: 2,
      label: "尾款",
      labelEn: "Final payment",
      amountSgd: "3500.00",
      bindStepOrder: 6,
      refundableNote: null
    }
  ],
  standard: [
    {
      seq: 1,
      label: "签约定金",
      labelEn: "Contract deposit",
      amountSgd: "5000.00",
      bindStepOrder: 1,
      refundableNote: "如申请未获批，全额退还"
    },
    {
      seq: 2,
      label: "尾款",
      labelEn: "Final payment",
      amountSgd: "7000.00",
      bindStepOrder: 6,
      refundableNote: null
    }
  ],
  flagship: [
    {
      seq: 1,
      label: "签约定金",
      labelEn: "Contract deposit",
      amountSgd: "5000.00",
      bindStepOrder: 1,
      refundableNote: "如 EP 未获批，全额退还"
    },
    {
      seq: 2,
      label: "EP 获批（收到 IPA）",
      labelEn: "EP approved (IPA received)",
      amountSgd: "10000.00",
      bindStepOrder: 6,
      refundableNote: null
    },
    {
      seq: 3,
      label: "DP 获批交尾款",
      labelEn: "Final payment after DP approval",
      amountSgd: "7000.00",
      bindStepOrder: 8,
      refundableNote: "DP 获批后结清，落地服务随后依次交付"
    }
  ]
};

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

async function loadMigrationStatements() {
  const sql = await readFile(migrationUrl, "utf8");
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyDdl(dryRun: boolean) {
  const statements = await loadMigrationStatements();

  if (dryRun) {
    console.log(`ddl dry-run: ${statements.length} statements would be applied from 0053_ep_packages_services.sql`);
    return;
  }

  for (const [index, statement] of statements.entries()) {
    await pool.query(statement);
    console.log(`ddl ok: ${index + 1}/${statements.length}`);
  }
}

async function upsertServiceItems(tx: DbLike) {
  const rows = [];

  for (const seed of serviceItemSeeds) {
    const [row] = await tx
      .insert(serviceItems)
      .values(seed)
      .onConflictDoUpdate({
        target: serviceItems.code,
        set: {
          name: seed.name,
          nameEn: seed.nameEn,
          category: seed.category,
          defaultPriceSgd: seed.defaultPriceSgd,
          isCore: seed.isCore,
          billable: seed.billable,
          active: true,
          sortOrder: seed.sortOrder
        }
      })
      .returning();

    if (!row) {
      throw new Error(`service_item_upsert_failed: ${seed.code}`);
    }
    rows.push(row);
  }

  console.log(`service_items upserted: ${rows.length}`);
  return new Map(rows.map((row) => [row.code, row]));
}

async function upsertPackages(tx: DbLike) {
  const rows = [];

  for (const seed of packageSeeds) {
    const [row] = await tx
      .insert(servicePackages)
      .values(seed)
      .onConflictDoUpdate({
        target: servicePackages.code,
        set: {
          name: seed.name,
          nameEn: seed.nameEn,
          basePriceSgd: seed.basePriceSgd,
          tagline: seed.tagline,
          isRecommended: seed.isRecommended,
          active: true,
          sortOrder: seed.sortOrder
        }
      })
      .returning();

    if (!row) {
      throw new Error(`package_upsert_failed: ${seed.code}`);
    }
    rows.push(row);
  }

  console.log(`packages upserted: ${rows.length}`);
  return new Map(rows.map((row) => [row.code, row]));
}

function getRequired<K, V>(map: Map<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (!value) {
    throw new Error(`${label}_missing: ${String(key)}`);
  }
  return value;
}

async function replacePackageItems(
  tx: DbLike,
  packagesByCode: Awaited<ReturnType<typeof upsertPackages>>,
  serviceItemsByCode: Awaited<ReturnType<typeof upsertServiceItems>>
) {
  let inserted = 0;

  for (const seed of packageSeeds) {
    const pkg = getRequired(packagesByCode, seed.code, "package");
    await tx.delete(packageItems).where(eq(packageItems.packageId, pkg.id));

    const values = packageItemSeeds[seed.code].map((serviceItemCode) => ({
      packageId: pkg.id,
      serviceItemId: getRequired(serviceItemsByCode, serviceItemCode, "service_item").id
    }));

    if (values.length > 0) {
      await tx.insert(packageItems).values(values);
      inserted += values.length;
    }

    console.log(`package_items replaced: ${seed.code} count=${values.length}`);
  }

  return inserted;
}

async function replacePackageMilestones(
  tx: DbLike,
  packagesByCode: Awaited<ReturnType<typeof upsertPackages>>
) {
  let inserted = 0;

  for (const seed of packageSeeds) {
    const pkg = getRequired(packagesByCode, seed.code, "package");
    await tx.delete(packageMilestones).where(eq(packageMilestones.packageId, pkg.id));

    const values = packageMilestoneSeeds[seed.code].map((milestone) => ({
      packageId: pkg.id,
      seq: milestone.seq,
      label: milestone.label,
      labelEn: milestone.labelEn,
      amountSgd: milestone.amountSgd,
      bindStepOrder: milestone.bindStepOrder,
      refundableNote: milestone.refundableNote
    }));

    if (values.length > 0) {
      await tx.insert(packageMilestones).values(values);
      inserted += values.length;
    }

    console.log(`package_milestones replaced: ${seed.code} count=${values.length}`);
  }

  return inserted;
}

async function seedEpPackages(dryRun: boolean) {
  if (dryRun) {
    const packageItemCount = Object.values(packageItemSeeds).reduce((count, items) => count + items.length, 0);
    const milestoneCount = Object.values(packageMilestoneSeeds).reduce((count, items) => count + items.length, 0);
    console.log(
      `seed dry-run: serviceItems=${serviceItemSeeds.length}, packages=${packageSeeds.length}, packageItems=${packageItemCount}, packageMilestones=${milestoneCount}`
    );
    return;
  }

  await db.transaction(async (tx) => {
    const serviceItemsByCode = await upsertServiceItems(tx);
    const packagesByCode = await upsertPackages(tx);
    const packageItemCount = await replacePackageItems(tx, packagesByCode, serviceItemsByCode);
    const milestoneCount = await replacePackageMilestones(tx, packagesByCode);

    console.log(
      `summary: serviceItems=${serviceItemsByCode.size}, packages=${packagesByCode.size}, packageItems=${packageItemCount}, packageMilestones=${milestoneCount}`
    );
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(args.dryRun ? "Mode: dry-run (no database writes)" : "Mode: apply");

  await applyDdl(args.dryRun);
  await seedEpPackages(args.dryRun);
}

try {
  await main();
} finally {
  await pool.end();
}
