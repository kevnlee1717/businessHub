import { randomUUID } from "node:crypto";
import { db, documentCategories, pool, templateSteps, workflowTemplates } from "@bh/db";
import { and, asc, eq } from "drizzle-orm";

type Args = {
  dryRun: boolean;
};

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
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
  { key: "serviceContract", name: "签约合同", nameEn: "Service Contract", aliases: ["合同"] },
  { key: "idCard", name: "身份证", nameEn: "ID Card" },
  { key: "educationCertificate", name: "学历证书", nameEn: "Education Certificate", aliases: ["学历证明"] },
  { key: "workExperience", name: "工作经历", nameEn: "Work Experience" },
  { key: "kycVideo", name: "客户认证视频", nameEn: "KYC Video" },
  { key: "companyRegistrationForm", name: "注册公司表格", nameEn: "Company Registration Form" },
  { key: "epQuotaScreenshot", name: "EP通道截图", nameEn: "EP Quota Screenshot" },
  { key: "tenancyAgreement", name: "租房合同", nameEn: "Tenancy Agreement" },
  { key: "cpfProof", name: "CPF证明", nameEn: "CPF Proof" },
  { key: "ipa", name: "IPA", nameEn: "IPA" },
  { key: "appointmentScreenshot", name: "预约截图", nameEn: "Appointment Screenshot" },
  { key: "epCard", name: "EP卡", nameEn: "EP Card", aliases: ["EP 卡"] },
  { key: "passport", name: "护照", nameEn: "Passport" },
  { key: "bizfile", name: "bizfile", nameEn: "Bizfile", aliases: ["公司Bizfile"] },
  { key: "receipt", name: "收据", nameEn: "Receipt" },
  { key: "other", name: "其它", nameEn: "Other", aliases: ["其他", "其他补充材料"] },
  { key: "invoice", name: "发票", nameEn: "Invoice" },
  { key: "paymentProof", name: "付款凭证/转账截图", nameEn: "Payment Proof", aliases: ["付款凭证", "转账截图"] },
  { key: "epApplicationForm", name: "EP申请表", nameEn: "EP Application Form" },
  { key: "employmentLetter", name: "在职证明", nameEn: "Employment Letter" },
  { key: "photo", name: "证件照", nameEn: "Photo" },
  { key: "constitution", name: "公司章程", nameEn: "Constitution" },
  { key: "certificateOfIncorporation", name: "注册证书COI", nameEn: "Certificate of Incorporation" },
  { key: "summaryLetter", name: "申请摘要", nameEn: "Summary Letter" },
  { key: "notificationLetter", name: "批准通知", nameEn: "Notification Letter" },
  { key: "appointmentLetter", name: "办卡预约函", nameEn: "Appointment Letter" },
  { key: "epCardBothSides", name: "EP卡正反面", nameEn: "EP Card (Both Sides)" }
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
  return (value ?? "").toLowerCase().replace(/\s+/g, "");
}

function hasMaterial(existing: RequiredDocument[], material: Pick<RequiredDocument, "name" | "name_en">): boolean {
  const nameKey = normalizeKey(material.name);
  const nameEnKey = normalizeKey(material.name_en);

  return existing.some((item) => normalizeKey(item.name) === nameKey || normalizeKey(item.name_en) === nameEnKey);
}

async function findCategoryByNames(tx: DbLike, names: string[]) {
  for (const name of names) {
    const [row] = await tx.select().from(documentCategories).where(eq(documentCategories.name, name)).limit(1);
    if (row) {
      return row;
    }
  }
  return null;
}

async function resolveCategories(tx: DbLike, dryRun: boolean) {
  const categoryIdByKey = new Map<CategoryKey, string>();
  const inserted: { seed: CategorySeed; id: string }[] = [];
  const reused: { seed: CategorySeed; id: string; matchedBy: string }[] = [];

  for (const seed of categorySeeds) {
    const existing = await findCategoryByNames(tx, [seed.name, ...(seed.aliases ?? [])]);

    if (existing) {
      categoryIdByKey.set(seed.key, existing.id);
      reused.push({ seed, id: existing.id, matchedBy: `name ${existing.name}` });
      continue;
    }

    const id = randomUUID();
    categoryIdByKey.set(seed.key, id);
    inserted.push({ seed, id });
    if (!dryRun) {
      await tx.insert(documentCategories).values({
        id,
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

  await db.transaction(async (tx) => {
    const { categoryIdByKey, inserted, reused } = await resolveCategories(tx, args.dryRun);

    for (const item of reused) {
      console.log(`category reused: ${item.seed.name} -> ${item.id} (${item.matchedBy})`);
    }
    for (const item of inserted) {
      console.log(
        args.dryRun
          ? `category would insert: ${item.seed.name} (${item.id})`
          : `category inserted: ${item.seed.name} (${item.id})`
      );
    }

    const [template] = await tx
      .select()
      .from(workflowTemplates)
      .where(and(eq(workflowTemplates.businessType, "ep"), eq(workflowTemplates.name, "EP 申请")))
      .limit(1);

    if (!template) {
      throw new Error("ep_workflow_template_not_found");
    }

    const existingSteps = await tx
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
          await tx.insert(templateSteps).values({
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
        await tx
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
  });
}

try {
  await main();
} finally {
  await pool.end();
}
