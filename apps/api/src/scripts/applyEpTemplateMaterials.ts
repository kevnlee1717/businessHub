import { db, documentCategories, pool, templateSteps, workflowTemplates } from "@bh/db";
import { and, asc, eq, sql } from "drizzle-orm";

type Args = {
  dryRun: boolean;
};

type RequiredDocument = (typeof templateSteps.$inferSelect)["requiredDocuments"][number];
type CategoryKey =
  | "serviceContract"
  | "idCard"
  | "educationCertificate"
  | "workExperience"
  | "kycVideo"
  | "companyRegistrationForm"
  | "epQuotaScreenshot"
  | "tenancyAgreement"
  | "cpfProof"
  | "ipa"
  | "appointmentScreenshot"
  | "epCard"
  | "passport"
  | "bizfile"
  | "receipt"
  | "other"
  | "invoice"
  | "paymentProof"
  | "epApplicationForm"
  | "employmentLetter"
  | "photo"
  | "constitution"
  | "certificateOfIncorporation"
  | "summaryLetter"
  | "notificationLetter"
  | "appointmentLetter"
  | "epCardBothSides";

type CategorySeed = {
  key: CategoryKey;
  id: string;
  idPrefix?: string;
  name: string;
  nameEn: string;
  aliases?: string[];
};

type MaterialSeed = {
  name: string;
  name_en: string;
  categoryKey: CategoryKey;
  required: boolean;
};

type StepSeed = {
  stepOrder: number;
  name: string;
  nameEn: string;
  description?: string;
  requiredDocuments: MaterialSeed[];
};

const categorySeeds: CategorySeed[] = [
  {
    key: "serviceContract",
    id: "8538a916-0000-4000-8000-000000000001",
    idPrefix: "8538a916",
    name: "签约合同",
    nameEn: "Service Contract",
    aliases: ["合同"]
  },
  { key: "idCard", id: "50ce37fa-0000-4000-8000-000000000002", idPrefix: "50ce37fa", name: "身份证", nameEn: "ID Card" },
  {
    key: "educationCertificate",
    id: "b169cad5-0000-4000-8000-000000000003",
    idPrefix: "b169cad5",
    name: "学历证书",
    nameEn: "Education Certificate",
    aliases: ["学历证明"]
  },
  {
    key: "workExperience",
    id: "227f6772-0000-4000-8000-000000000004",
    idPrefix: "227f6772",
    name: "工作经历",
    nameEn: "Work Experience"
  },
  { key: "kycVideo", id: "901d8d79-0000-4000-8000-000000000005", idPrefix: "901d8d79", name: "客户认证视频", nameEn: "KYC Video" },
  {
    key: "companyRegistrationForm",
    id: "2b66ec9d-0000-4000-8000-000000000006",
    idPrefix: "2b66ec9d",
    name: "注册公司表格",
    nameEn: "Company Registration Form"
  },
  {
    key: "epQuotaScreenshot",
    id: "1438f8cf-0000-4000-8000-000000000007",
    idPrefix: "1438f8cf",
    name: "EP通道截图",
    nameEn: "EP Quota Screenshot"
  },
  {
    key: "tenancyAgreement",
    id: "49ad58b2-0000-4000-8000-000000000008",
    idPrefix: "49ad58b2",
    name: "租房合同",
    nameEn: "Tenancy Agreement"
  },
  { key: "cpfProof", id: "a9bda01e-0000-4000-8000-000000000009", idPrefix: "a9bda01e", name: "CPF证明", nameEn: "CPF Proof" },
  { key: "ipa", id: "7dfbe224-0000-4000-8000-000000000010", idPrefix: "7dfbe224", name: "IPA", nameEn: "IPA" },
  {
    key: "appointmentScreenshot",
    id: "4ae3080b-0000-4000-8000-000000000011",
    idPrefix: "4ae3080b",
    name: "预约截图",
    nameEn: "Appointment Screenshot"
  },
  { key: "epCard", id: "e86d2014-0000-4000-8000-000000000012", idPrefix: "e86d2014", name: "EP卡", nameEn: "EP Card" },
  { key: "passport", id: "6f8b19b7-2a1b-47b5-a0cb-ac0790a7a1be", name: "护照", nameEn: "Passport" },
  { key: "bizfile", id: "f8f6c7dd-180f-4378-a56d-e60c9e065aab", name: "bizfile", nameEn: "Bizfile", aliases: ["公司Bizfile"] },
  { key: "receipt", id: "5feda2a6-a46a-4de9-9dfa-4d19142e9e95", name: "收据", nameEn: "Receipt" },
  { key: "other", id: "0b4b7d2b-6f62-4724-b965-3d72c8152ce2", name: "其它", nameEn: "Other", aliases: ["其他补充材料"] },
  { key: "invoice", id: "d1fe1eaf-8909-424c-bca1-dc8216d7ad5b", name: "发票", nameEn: "Invoice" },
  {
    key: "paymentProof",
    id: "1df57a51-925c-4e84-b011-1e3c96bfb4ff",
    name: "付款凭证/转账截图",
    nameEn: "Payment Proof"
  },
  { key: "epApplicationForm", id: "d1f41aad-3a60-4bbe-bda5-6595800153a4", name: "EP申请表", nameEn: "EP Application Form" },
  { key: "employmentLetter", id: "93f6a49c-92d8-4f51-8eee-a017bd8e2c6b", name: "在职证明", nameEn: "Employment Letter" },
  { key: "photo", id: "efedffd3-586c-4189-b39a-aaecc38204a2", name: "证件照", nameEn: "Photo" },
  { key: "constitution", id: "8b6802f4-3fcc-4163-9ac6-e359a0737ce4", name: "公司章程", nameEn: "Constitution" },
  {
    key: "certificateOfIncorporation",
    id: "8f6eb27-b002-4524-b9a5-0fc08d8f8ffc",
    name: "注册证书COI",
    nameEn: "Certificate of Incorporation"
  },
  { key: "summaryLetter", id: "814ee382-bd77-4bf8-bddb-a01765697c34", name: "申请摘要", nameEn: "Summary Letter" },
  { key: "notificationLetter", id: "28f66ddc-8349-47bd-89a6-2810a36838d9", name: "批准通知", nameEn: "Notification Letter" },
  { key: "appointmentLetter", id: "fe3c6a0b-3ccb-4dd0-a3de-ec53b2828648", name: "办卡预约函", nameEn: "Appointment Letter" },
  { key: "epCardBothSides", id: "b3b631bc-a25e-4ef3-a52e-d759d763f0f5", name: "EP卡正反面", nameEn: "EP Card (Both Sides)" }
];

const other: MaterialSeed = {
  name: "其他补充材料",
  name_en: "Other Supporting Documents",
  categoryKey: "other",
  required: false
};

const epStepSeeds: StepSeed[] = [
  {
    stepOrder: 1,
    name: "签约",
    nameEn: "Sign Contract",
    requiredDocuments: [
      { name: "签约合同", name_en: "Service Contract", categoryKey: "serviceContract", required: true },
      { name: "发票", name_en: "Invoice", categoryKey: "invoice", required: false },
      { name: "付款凭证/转账截图", name_en: "Payment Proof", categoryKey: "paymentProof", required: false },
      other
    ]
  },
  {
    stepOrder: 2,
    name: "搜集资料",
    nameEn: "Collect Documents",
    requiredDocuments: [
      { name: "身份证", name_en: "ID Card", categoryKey: "idCard", required: true },
      { name: "学历证书", name_en: "Education Certificate", categoryKey: "educationCertificate", required: true },
      { name: "工作经历", name_en: "Work Experience", categoryKey: "workExperience", required: true },
      { name: "护照", name_en: "Passport", categoryKey: "passport", required: false },
      { name: "EP申请表", name_en: "EP Application Form", categoryKey: "epApplicationForm", required: false },
      { name: "在职证明", name_en: "Employment Letter", categoryKey: "employmentLetter", required: false },
      { name: "证件照", name_en: "Photo", categoryKey: "photo", required: false },
      other
    ]
  },
  {
    stepOrder: 3,
    name: "注册公司",
    nameEn: "Register Company",
    description: "含预约视频 KYC(预约时间 + 保存 KYC 视频,后续版本支持)",
    requiredDocuments: [
      { name: "客户认证视频", name_en: "KYC Video", categoryKey: "kycVideo", required: false },
      { name: "注册公司表格", name_en: "Company Registration Form", categoryKey: "companyRegistrationForm", required: false },
      { name: "公司Bizfile", name_en: "ACRA Bizfile", categoryKey: "bizfile", required: false },
      { name: "公司章程", name_en: "Constitution", categoryKey: "constitution", required: false },
      {
        name: "注册证书COI",
        name_en: "Certificate of Incorporation",
        categoryKey: "certificateOfIncorporation",
        required: false
      },
      other
    ]
  },
  {
    stepOrder: 4,
    name: "等 EP 通道",
    nameEn: "Wait for EP Quota",
    requiredDocuments: [
      { name: "EP通道截图", name_en: "EP Quota Screenshot", categoryKey: "epQuotaScreenshot", required: false },
      other
    ]
  },
  {
    stepOrder: 5,
    name: "提交申请",
    nameEn: "Submit Application",
    requiredDocuments: [
      { name: "EP提交截图", name_en: "EP Submission Screenshot", categoryKey: "epQuotaScreenshot", required: false },
      { name: "申请摘要", name_en: "Summary Letter", categoryKey: "summaryLetter", required: false },
      other
    ]
  },
  {
    stepOrder: 6,
    name: "获批",
    nameEn: "Approval",
    description: "可能要求补材料(补材料中),附材料清单",
    requiredDocuments: [
      { name: "租房合同", name_en: "Tenancy Agreement", categoryKey: "tenancyAgreement", required: false },
      { name: "CPF证明", name_en: "CPF Proof", categoryKey: "cpfProof", required: false },
      { name: "本地合同", name_en: "Local Employment Contract", categoryKey: "serviceContract", required: false },
      { name: "IPA", name_en: "IPA", categoryKey: "ipa", required: false },
      { name: "Employer IPA Letter", name_en: "Employer IPA Letter", categoryKey: "ipa", required: false },
      { name: "Foreigner IPA Letter", name_en: "Foreigner IPA Letter", categoryKey: "ipa", required: false },
      { name: "Sponsor IPA Letter", name_en: "Sponsor IPA Letter", categoryKey: "ipa", required: false },
      { name: "批准通知", name_en: "Notification Letter", categoryKey: "notificationLetter", required: false },
      other
    ]
  },
  {
    stepOrder: 7,
    name: "预约指纹",
    nameEn: "Book Fingerprint",
    requiredDocuments: [
      { name: "预约截图", name_en: "Appointment Screenshot", categoryKey: "appointmentScreenshot", required: false },
      { name: "办卡预约函", name_en: "Appointment Letter", categoryKey: "appointmentLetter", required: false },
      other
    ]
  },
  {
    stepOrder: 8,
    name: "完成",
    nameEn: "Completed",
    requiredDocuments: [
      { name: "EP卡", name_en: "EP Card", categoryKey: "epCard", required: false },
      { name: "尾款付款凭证", name_en: "Final Payment Proof", categoryKey: "paymentProof", required: false },
      { name: "EP卡正反面", name_en: "EP Card (Both Sides)", categoryKey: "epCardBothSides", required: false },
      other
    ]
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

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasMaterial(existing: RequiredDocument[], material: Pick<RequiredDocument, "name" | "name_en">): boolean {
  const nameKey = normalizeKey(material.name);
  const nameEnKey = normalizeKey(material.name_en);

  return existing.some((item) => normalizeKey(item.name) === nameKey || normalizeKey(item.name_en) === nameEnKey);
}

async function findCategoryByPrefix(idPrefix: string) {
  const [row] = await db
    .select()
    .from(documentCategories)
    .where(sql`${documentCategories.id}::text LIKE ${`${idPrefix}%`}`)
    .limit(1);
  return row;
}

async function findCategoryByNames(names: string[]) {
  for (const name of names) {
    const [row] = await db.select().from(documentCategories).where(eq(documentCategories.name, name)).limit(1);
    if (row) {
      return row;
    }
  }
  return null;
}

async function resolveCategories(dryRun: boolean) {
  const categoryIdByKey = new Map<CategoryKey, string>();
  const inserted: CategorySeed[] = [];
  const reused: { seed: CategorySeed; id: string; matchedBy: string }[] = [];

  for (const seed of categorySeeds) {
    const byPrefix = seed.idPrefix ? await findCategoryByPrefix(seed.idPrefix) : null;
    const byName = byPrefix ? null : await findCategoryByNames([seed.name, ...(seed.aliases ?? [])]);
    const existing = byPrefix ?? byName;

    if (existing) {
      categoryIdByKey.set(seed.key, existing.id);
      reused.push({ seed, id: existing.id, matchedBy: byPrefix ? `prefix ${seed.idPrefix}` : `name ${existing.name}` });
      continue;
    }

    categoryIdByKey.set(seed.key, seed.id);
    inserted.push(seed);
    if (!dryRun) {
      await db.insert(documentCategories).values({
        id: seed.id,
        name: seed.name,
        nameEn: seed.nameEn,
        isSystem: true
      });
    }
  }

  return { categoryIdByKey, inserted, reused };
}

function toRequiredDocument(material: MaterialSeed, categoryIdByKey: Map<CategoryKey, string>): RequiredDocument {
  const categoryId = categoryIdByKey.get(material.categoryKey);
  if (!categoryId) {
    throw new Error(`category_not_resolved: ${material.categoryKey}`);
  }

  return {
    name: material.name,
    name_en: material.name_en,
    category_id: categoryId,
    required: material.required
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(args.dryRun ? "Mode: dry-run (no database writes)" : "Mode: apply");

  const { categoryIdByKey, inserted, reused } = await resolveCategories(args.dryRun);

  for (const item of reused) {
    console.log(`category reused: ${item.seed.name} -> ${item.id} (${item.matchedBy})`);
  }
  for (const item of inserted) {
    console.log(args.dryRun ? `category would insert: ${item.name} (${item.id})` : `category inserted: ${item.name} (${item.id})`);
  }

  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(and(eq(workflowTemplates.businessType, "ep"), eq(workflowTemplates.name, "EP 申请")))
    .limit(1);

  if (!template) {
    throw new Error("ep_workflow_template_not_found");
  }

  const existingSteps = await db
    .select()
    .from(templateSteps)
    .where(eq(templateSteps.templateId, template.id))
    .orderBy(asc(templateSteps.stepOrder));
  const stepByOrder = new Map(existingSteps.map((step) => [step.stepOrder, step]));

  let stepsInserted = 0;
  let stepsUpdated = 0;
  let documentsAdded = 0;

  for (const stepSeed of epStepSeeds) {
    const requiredDocuments = stepSeed.requiredDocuments.map((material) => toRequiredDocument(material, categoryIdByKey));
    const existingStep = stepByOrder.get(stepSeed.stepOrder);

    if (!existingStep) {
      stepsInserted += 1;
      documentsAdded += requiredDocuments.length;
      console.log(`step #${stepSeed.stepOrder} would insert with ${requiredDocuments.length} materials: ${stepSeed.name}`);

      if (!args.dryRun) {
        await db.insert(templateSteps).values({
          templateId: template.id,
          stepOrder: stepSeed.stepOrder,
          name: stepSeed.name,
          nameEn: stepSeed.nameEn,
          description: stepSeed.description,
          requiredDocuments,
          defaultAssigneeRole: "clerk"
        });
      }
      continue;
    }

    const additions = requiredDocuments.filter((material) => !hasMaterial(existingStep.requiredDocuments, material));
    if (additions.length === 0) {
      console.log(`step #${stepSeed.stepOrder} unchanged: ${existingStep.name}`);
      continue;
    }

    stepsUpdated += 1;
    documentsAdded += additions.length;
    console.log(`step #${stepSeed.stepOrder} append ${additions.length}: ${additions.map((item) => item.name).join(", ")}`);

    if (!args.dryRun) {
      await db
        .update(templateSteps)
        .set({
          requiredDocuments: [...existingStep.requiredDocuments, ...additions]
        })
        .where(eq(templateSteps.id, existingStep.id));
    }
  }

  console.log(
    `summary: categoriesReused=${reused.length}, categoriesInserted=${inserted.length}, stepsInserted=${stepsInserted}, stepsUpdated=${stepsUpdated}, documentsAdded=${documentsAdded}`
  );
}

try {
  await main();
} finally {
  await pool.end();
}
