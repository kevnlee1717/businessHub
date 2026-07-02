import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { DEAL_PRESETS, ROLE_PERMISSIONS, allPermissions, computeDealEconomics, type SchemeLineInput } from "@bh/shared";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db, pool } from "./index";
import {
  bankAccounts,
  bankStatementLines,
  billing,
  businesses,
  collectionItems,
  companyExpenses,
  companies,
  courseDesignItems,
  courseDesignTasks,
  dealParties,
  documentCategories,
  diplomaEnrollments,
  diplomaPayments,
  employeeCompanyAccess,
  employeeCompensation,
  employees,
  expenseCategories,
  industries,
  ledgerEntries,
  payrollSettings,
  positions,
  recurringCosts,
  salesBusinessAssignments,
  schemeLines,
  schemeMilestones,
  schemeVersions,
  students,
  templateSteps,
  workflowTemplates,
  workShifts
} from "./schema/index";
import { icaTemplateSteps } from "./seeds/icaTemplateSteps.js";

config({ path: "../../.env" });

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "admin@bh.local";
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "changeme";
const ownerName = process.env.SEED_OWNER_NAME ?? "Owner";

const passwordHash = await bcrypt.hash(ownerPassword, 10);

const [existingSuperAdminPosition] = await db.select().from(positions).where(eq(positions.name, "超管")).limit(1);
const [superAdminPosition] = existingSuperAdminPosition
  ? await db
      .update(positions)
      .set({
        permissions: allPermissions,
        dataScope: "all",
        isSystem: true,
        sortOrder: 0
      })
      .where(eq(positions.id, existingSuperAdminPosition.id))
      .returning({ id: positions.id })
  : await db
      .insert(positions)
      .values({
        name: "超管",
        nameEn: "Super Admin",
        permissions: allPermissions,
        dataScope: "all",
        isSystem: true,
        sortOrder: 0
      })
      .returning({ id: positions.id });

if (!superAdminPosition) {
  throw new Error("super_admin_position_seed_failed");
}

const positionPermissionSeeds = [
  { name: "文员", permissions: ROLE_PERMISSIONS.clerk, dataScope: "self", sortOrder: 10 },
  { name: "会计", permissions: ROLE_PERMISSIONS.accountant, dataScope: "company", sortOrder: 20 },
  { name: "主管", permissions: ROLE_PERMISSIONS.admin, dataScope: "all", sortOrder: 30 },
  { name: "摄影", permissions: ROLE_PERMISSIONS.photographer, dataScope: "self", sortOrder: 40 }
] as const;

for (const seed of positionPermissionSeeds) {
  const [position] = await db.select().from(positions).where(eq(positions.name, seed.name)).limit(1);

  if (position) {
    await db
      .update(positions)
      .set({
        permissions: seed.permissions,
        dataScope: seed.dataScope,
        sortOrder: seed.sortOrder
      })
      .where(eq(positions.id, position.id));
  }
}

const [owner] = await db
  .insert(employees)
  .values({
    email: ownerEmail,
    name: ownerName,
    passwordHash,
    role: "owner",
    positionId: superAdminPosition.id,
    dataScope: "all",
    mustChangePassword: false
  })
  .onConflictDoUpdate({
    target: employees.email,
    set: {
      name: ownerName,
      passwordHash,
      role: "owner",
      positionId: superAdminPosition.id,
      status: "active",
      dataScope: "all",
      mustChangePassword: false,
      updatedAt: new Date()
    }
  })
  .returning({ id: employees.id, email: employees.email });

const epCategoryIds = {
  serviceContract: "8538a916-0000-4000-8000-000000000001",
  idCard: "50ce37fa-0000-4000-8000-000000000002",
  educationCertificate: "b169cad5-0000-4000-8000-000000000003",
  workExperience: "227f6772-0000-4000-8000-000000000004",
  kycVideo: "901d8d79-0000-4000-8000-000000000005",
  companyRegistrationForm: "2b66ec9d-0000-4000-8000-000000000006",
  epQuotaScreenshot: "1438f8cf-0000-4000-8000-000000000007",
  tenancyAgreement: "49ad58b2-0000-4000-8000-000000000008",
  cpfProof: "a9bda01e-0000-4000-8000-000000000009",
  ipa: "7dfbe224-0000-4000-8000-000000000010",
  appointmentScreenshot: "4ae3080b-0000-4000-8000-000000000011",
  epCard: "e86d2014-0000-4000-8000-000000000012",
  passport: "6f8b19b7-2a1b-47b5-a0cb-ac0790a7a1be",
  bizfile: "f8f6c7dd-180f-4378-a56d-e60c9e065aab",
  receipt: "5feda2a6-a46a-4de9-9dfa-4d19142e9e95",
  other: "0b4b7d2b-6f62-4724-b965-3d72c8152ce2",
  invoice: "d1fe1eaf-8909-424c-bca1-dc8216d7ad5b",
  paymentProof: "1df57a51-925c-4e84-b011-1e3c96bfb4ff",
  epApplicationForm: "d1f41aad-3a60-4bbe-bda5-6595800153a4",
  employmentLetter: "93f6a49c-92d8-4f51-8eee-a017bd8e2c6b",
  photo: "efedffd3-586c-4189-b39a-aaecc38204a2",
  constitution: "8b6802f4-3fcc-4163-9ac6-e359a0737ce4",
  certificateOfIncorporation: "8f6eb27-b002-4524-b9a5-0fc08d8f8ffc",
  summaryLetter: "814ee382-bd77-4bf8-bddb-a01765697c34",
  notificationLetter: "28f66ddc-8349-47bd-89a6-2810a36838d9",
  appointmentLetter: "fe3c6a0b-3ccb-4dd0-a3de-ec53b2828648",
  epCardBothSides: "b3b631bc-a25e-4ef3-a52e-d759d763f0f5"
} as const;

const categorySeeds = [
  { id: epCategoryIds.serviceContract, name: "签约合同", nameEn: "Service Contract" },
  { id: epCategoryIds.idCard, name: "身份证", nameEn: "ID Card" },
  { id: epCategoryIds.educationCertificate, name: "学历证书", nameEn: "Education Certificate" },
  { id: epCategoryIds.workExperience, name: "工作经历", nameEn: "Work Experience" },
  { id: epCategoryIds.kycVideo, name: "客户认证视频", nameEn: "KYC Video" },
  { id: epCategoryIds.companyRegistrationForm, name: "注册公司表格", nameEn: "Company Registration Form" },
  { id: epCategoryIds.epQuotaScreenshot, name: "EP通道截图", nameEn: "EP Quota Screenshot" },
  { id: epCategoryIds.tenancyAgreement, name: "租房合同", nameEn: "Tenancy Agreement" },
  { id: epCategoryIds.cpfProof, name: "CPF证明", nameEn: "CPF Proof" },
  { id: epCategoryIds.ipa, name: "IPA", nameEn: "IPA" },
  { id: epCategoryIds.appointmentScreenshot, name: "预约截图", nameEn: "Appointment Screenshot" },
  { id: epCategoryIds.epCard, name: "EP卡", nameEn: "EP Card" },
  { id: epCategoryIds.passport, name: "护照", nameEn: "Passport" },
  { name: "学历证明", nameEn: "Education Certificate" },
  { name: "合同", nameEn: "Contract" },
  { id: epCategoryIds.bizfile, name: "bizfile", nameEn: "Bizfile" },
  { id: epCategoryIds.receipt, name: "收据", nameEn: "Receipt" },
  { id: epCategoryIds.other, name: "其它", nameEn: "Other" },
  { id: epCategoryIds.invoice, name: "发票", nameEn: "Invoice" },
  { id: epCategoryIds.paymentProof, name: "付款凭证/转账截图", nameEn: "Payment Proof" },
  { id: epCategoryIds.epApplicationForm, name: "EP申请表", nameEn: "EP Application Form" },
  { id: epCategoryIds.employmentLetter, name: "在职证明", nameEn: "Employment Letter" },
  { id: epCategoryIds.photo, name: "证件照", nameEn: "Photo" },
  { id: epCategoryIds.constitution, name: "公司章程", nameEn: "Constitution" },
  { id: epCategoryIds.certificateOfIncorporation, name: "注册证书COI", nameEn: "Certificate of Incorporation" },
  { id: epCategoryIds.summaryLetter, name: "申请摘要", nameEn: "Summary Letter" },
  { id: epCategoryIds.notificationLetter, name: "批准通知", nameEn: "Notification Letter" },
  { id: epCategoryIds.appointmentLetter, name: "办卡预约函", nameEn: "Appointment Letter" },
  { id: epCategoryIds.epCardBothSides, name: "EP卡正反面", nameEn: "EP Card (Both Sides)" }
] as const;

let insertedCategories = 0;

for (const category of categorySeeds) {
  const existing = await db.query.documentCategories.findFirst({
    where: eq(documentCategories.name, category.name)
  });

  if (!existing) {
    await db.insert(documentCategories).values({
      id: "id" in category ? category.id : undefined,
      name: category.name,
      nameEn: category.nameEn,
      isSystem: true
    });
    insertedCategories += 1;
  }
}

const industrySeeds = [
  { name: "移民", nameEn: "Immigration" },
  { name: "留学", nameEn: "Study Abroad" },
  { name: "学院", nameEn: "College" }
] as const;

let insertedIndustries = 0;

for (const industry of industrySeeds) {
  const existing = await db.query.industries.findFirst({
    where: eq(industries.name, industry.name)
  });

  if (!existing) {
    await db.insert(industries).values({
      name: industry.name,
      nameEn: industry.nameEn
    });
    insertedIndustries += 1;
  }
}

const existingPayrollSettings = await db.query.payrollSettings.findFirst();
let insertedPayrollSettings = 0;

if (!existingPayrollSettings) {
  await db.insert(payrollSettings).values({
    cpfRates: {},
    levyAmount: "0",
    chinaFundRate: "0",
    attendanceAllowedLate: 0,
    kpiCap100: true
  });
  insertedPayrollSettings = 1;
}

const existingDefaultShift = await db.query.workShifts.findFirst({
  where: eq(workShifts.isDefault, true)
});
let insertedWorkShifts = 0;

if (!existingDefaultShift) {
  await db.insert(workShifts).values({
    name: "标准班 09:00-17:00",
    startMin: 540,
    endMin: 1020,
    allowedLateCount: 0,
    isDefault: true
  });
  insertedWorkShifts = 1;
}

type WorkflowTemplateSeed = {
  businessType: "ep" | "ica" | "dp";
  name: string;
  steps: {
    name: string;
    nameEn: string;
    description?: string;
    requiredDocuments: {
      name: string;
      name_en?: string;
      category_id?: string | null;
      required: boolean;
    }[];
  }[];
};

const workflowTemplateSeeds: WorkflowTemplateSeed[] = [
  {
    businessType: "ep",
    name: "EP 申请",
    steps: [
      {
        name: "签约",
        nameEn: "Sign Contract",
        requiredDocuments: [
          { name: "签约合同", name_en: "Service Contract", category_id: epCategoryIds.serviceContract, required: true },
          { name: "发票", name_en: "Invoice", category_id: epCategoryIds.invoice, required: false },
          { name: "付款凭证/转账截图", name_en: "Payment Proof", category_id: epCategoryIds.paymentProof, required: false },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      },
      {
        name: "搜集资料",
        nameEn: "Collect Documents",
        requiredDocuments: [
          { name: "身份证", name_en: "ID Card", category_id: epCategoryIds.idCard, required: true },
          { name: "学历证书", name_en: "Education Certificate", category_id: epCategoryIds.educationCertificate, required: true },
          { name: "工作经历", name_en: "Work Experience", category_id: epCategoryIds.workExperience, required: true },
          { name: "护照", name_en: "Passport", category_id: epCategoryIds.passport, required: false },
          { name: "EP申请表", name_en: "EP Application Form", category_id: epCategoryIds.epApplicationForm, required: false },
          { name: "在职证明", name_en: "Employment Letter", category_id: epCategoryIds.employmentLetter, required: false },
          { name: "证件照", name_en: "Photo", category_id: epCategoryIds.photo, required: false },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      },
      {
        name: "注册公司",
        nameEn: "Register Company",
        description: "含预约视频 KYC(预约时间 + 保存 KYC 视频,后续版本支持)",
        requiredDocuments: [
          { name: "客户认证视频", name_en: "KYC Video", category_id: epCategoryIds.kycVideo, required: false },
          { name: "注册公司表格", name_en: "Company Registration Form", category_id: epCategoryIds.companyRegistrationForm, required: false },
          { name: "公司Bizfile", name_en: "ACRA Bizfile", category_id: epCategoryIds.bizfile, required: false },
          { name: "公司章程", name_en: "Constitution", category_id: epCategoryIds.constitution, required: false },
          {
            name: "注册证书COI",
            name_en: "Certificate of Incorporation",
            category_id: epCategoryIds.certificateOfIncorporation,
            required: false
          },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      },
      {
        name: "等 EP 通道",
        nameEn: "Wait for EP Quota",
        requiredDocuments: [
          { name: "EP通道截图", name_en: "EP Quota Screenshot", category_id: epCategoryIds.epQuotaScreenshot, required: false },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      },
      {
        name: "提交申请",
        nameEn: "Submit Application",
        requiredDocuments: [
          { name: "EP提交截图", name_en: "EP Submission Screenshot", category_id: epCategoryIds.epQuotaScreenshot, required: false },
          { name: "申请摘要", name_en: "Summary Letter", category_id: epCategoryIds.summaryLetter, required: false },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      },
      {
        name: "获批",
        nameEn: "Approval",
        description: "可能要求补材料(补材料中),附材料清单",
        requiredDocuments: [
          { name: "租房合同", name_en: "Tenancy Agreement", category_id: epCategoryIds.tenancyAgreement, required: false },
          { name: "CPF证明", name_en: "CPF Proof", category_id: epCategoryIds.cpfProof, required: false },
          { name: "本地合同", name_en: "Local Employment Contract", category_id: epCategoryIds.serviceContract, required: false },
          { name: "IPA", name_en: "IPA", category_id: epCategoryIds.ipa, required: false },
          { name: "Employer IPA Letter", name_en: "Employer IPA Letter", category_id: epCategoryIds.ipa, required: false },
          { name: "Foreigner IPA Letter", name_en: "Foreigner IPA Letter", category_id: epCategoryIds.ipa, required: false },
          { name: "Sponsor IPA Letter", name_en: "Sponsor IPA Letter", category_id: epCategoryIds.ipa, required: false },
          { name: "批准通知", name_en: "Notification Letter", category_id: epCategoryIds.notificationLetter, required: false },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      },
      {
        name: "预约指纹",
        nameEn: "Book Fingerprint",
        requiredDocuments: [
          { name: "预约截图", name_en: "Appointment Screenshot", category_id: epCategoryIds.appointmentScreenshot, required: false },
          { name: "办卡预约函", name_en: "Appointment Letter", category_id: epCategoryIds.appointmentLetter, required: false },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      },
      {
        name: "完成",
        nameEn: "Completed",
        requiredDocuments: [
          { name: "EP卡", name_en: "EP Card", category_id: epCategoryIds.epCard, required: false },
          { name: "尾款付款凭证", name_en: "Final Payment Proof", category_id: epCategoryIds.paymentProof, required: false },
          { name: "EP卡正反面", name_en: "EP Card (Both Sides)", category_id: epCategoryIds.epCardBothSides, required: false },
          { name: "其他补充材料", name_en: "Other Supporting Documents", category_id: epCategoryIds.other, required: false }
        ]
      }
    ]
  },
  {
    businessType: "ica",
    name: "ICA 申诉",
    steps: icaTemplateSteps
  },
  {
    businessType: "dp",
    name: "DP 申请",
    steps: [
      {
        name: "搜集资料",
        nameEn: "Collect Documents",
        requiredDocuments: [
          { name: "身份证", name_en: "ID Card", required: true },
          { name: "关系证明", name_en: "Relationship Proof", required: true }
        ]
      },
      {
        name: "提交申请",
        nameEn: "Submit Application",
        requiredDocuments: []
      },
      {
        name: "获批",
        nameEn: "Approval",
        requiredDocuments: []
      },
      {
        name: "预约指纹",
        nameEn: "Book Fingerprint",
        requiredDocuments: []
      },
      {
        name: "完成",
        nameEn: "Completed",
        requiredDocuments: []
      }
    ]
  }
];

let insertedWorkflowTemplates = 0;

for (const templateSeed of workflowTemplateSeeds) {
  const existing = await db.query.workflowTemplates.findFirst({
    where: and(
      eq(workflowTemplates.businessType, templateSeed.businessType),
      eq(workflowTemplates.name, templateSeed.name)
    )
  });

  if (!existing) {
    const [template] = await db
      .insert(workflowTemplates)
      .values({
        businessType: templateSeed.businessType,
        name: templateSeed.name
      })
      .returning({ id: workflowTemplates.id });

    if (template) {
      await db.insert(templateSteps).values(
        templateSeed.steps.map((step, index) => ({
          templateId: template.id,
          stepOrder: index + 1,
          name: step.name,
          nameEn: step.nameEn,
          description: step.description,
          requiredDocuments: step.requiredDocuments,
          defaultAssigneeRole: "clerk" as const
        }))
      );
      insertedWorkflowTemplates += 1;
    }
  }
}

const toNumeric = (value: number | null | undefined, digits = 3) =>
  value === null || value === undefined || !Number.isFinite(value) ? null : value.toFixed(digits);

const toMoney = (value: number) => value.toFixed(2);

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const currentPeriod = () => {
  const date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const addMonthsToPeriod = (period: string, months: number) => {
  const [yearText, monthText] = period.split("-");
  const yearValue = Number(yearText);
  const monthValue = Number(monthText);
  const totalMonths = yearValue * 12 + (monthValue - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const oneTimePreset = DEAL_PRESETS.find((preset) => preset.key === "one_time");

if (!oneTimePreset) {
  throw new Error("one_time_deal_preset_missing");
}

const dealPartySeeds = [
  { code: "us", name: "我们", nameEn: "We" },
  { code: "sales", name: "业务员", nameEn: "Sales" },
  { code: "hr_source", name: "HR 来源", nameEn: "HR Source" },
  { code: "partner", name: "加盟商", nameEn: "Partner" },
  { code: "referrer", name: "介绍人", nameEn: "Referrer" },
  { code: "landing", name: "落地方", nameEn: "Landing Party" },
  { code: "guarantor", name: "担保人", nameEn: "Guarantor" }
] as const;

let upsertedDealParties = 0;

for (const party of dealPartySeeds) {
  await db
    .insert(dealParties)
    .values({
      code: party.code,
      name: party.name,
      nameEn: party.nameEn,
      active: true,
      isSystem: true
    })
    .onConflictDoUpdate({
      target: dealParties.code,
      set: {
        name: party.name,
        nameEn: party.nameEn,
        active: true,
        isSystem: true
      }
    });
  upsertedDealParties += 1;
}

const partyRows = await db.select().from(dealParties);
const partyIdByCode = new Map(partyRows.map((party) => [party.code, party.id]));

const collectionItemSeeds = [
  { code: "deposit", name: "定金", nameEn: "Deposit", defaultRecurrence: "one_time", sortOrder: 1 },
  { code: "down_payment", name: "首付", nameEn: "Down Payment", defaultRecurrence: "one_time", sortOrder: 2 },
  { code: "progress", name: "中期款", nameEn: "Progress Payment", defaultRecurrence: "one_time", sortOrder: 3 },
  { code: "final", name: "尾款", nameEn: "Final Payment", defaultRecurrence: "one_time", sortOrder: 4 },
  { code: "monthly_fee", name: "月费", nameEn: "Monthly Fee", defaultRecurrence: "monthly", sortOrder: 5 },
  { code: "service_fee", name: "服务费", nameEn: "Service Fee", defaultRecurrence: "one_time", sortOrder: 6 },
  { code: "commission_share", name: "抽成", nameEn: "Commission Share", defaultRecurrence: "monthly", sortOrder: 7 }
] as const;

let collectionItemsUpserted = 0;

for (const item of collectionItemSeeds) {
  await db
    .insert(collectionItems)
    .values({
      code: item.code,
      name: item.name,
      nameEn: item.nameEn,
      defaultRecurrence: item.defaultRecurrence,
      active: true,
      isSystem: true,
      sortOrder: item.sortOrder
    })
    .onConflictDoUpdate({
      target: collectionItems.code,
      set: {
        name: item.name,
        nameEn: item.nameEn,
        defaultRecurrence: item.defaultRecurrence,
        active: true,
        isSystem: true,
        sortOrder: item.sortOrder
      }
    });
  collectionItemsUpserted += 1;
}

const collectionItemRows = await db.select().from(collectionItems);
const collectionItemIdByCode = new Map(collectionItemRows.map((item) => [item.code, item.id]));

const [fallbackCompany] = await db.select().from(companies).limit(1);

let upsertedBusinesses = 0;
let insertedSchemeVersions = 0;
let skippedSchemeVersions = 0;
let insertedSchemeLines = 0;
let updatedBillingRows = 0;
let oneTimePriceLinesPatched = 0;
let schemeMilestonesUpserted = 0;
let epMilestonesLinked = 0;
let epStepCollectionsSet = 0;
let insertedCourseDesignTasks = 0;
let insertedCourseDesignItems = 0;
const financeSeedWarnings: string[] = [];

const [courseDesignTaskCountRow] = await db.select({ count: count() }).from(courseDesignTasks);

if (Number(courseDesignTaskCountRow?.count ?? 0) === 0) {
  await db.insert(courseDesignTasks).values([
    {
      title: "确认产品定位 & 主打 App 模式",
      owner: "小雨",
      status: "review",
      deliverable: "定位说明（见 tab 顶部）",
      sortOrder: 0
    },
    {
      title: "分级体系定稿（CEFR 对齐 6 级）",
      owner: "小雨",
      status: "doing",
      deliverable: "分级表 + 定级测评方案",
      sortOrder: 1
    },
    {
      title: "课程命名 & 定价方案",
      owner: "小雨",
      status: "doing",
      deliverable: "命名/价格表 + 定价理由",
      sortOrder: 2
    },
    {
      title: "每日任务(Daily Set)内容设计",
      owner: "小雨",
      status: "todo",
      deliverable: "各级别每日任务模板",
      sortOrder: 3
    },
    {
      title: "参考 App 拆解 & 借鉴点整理",
      owner: "小雨",
      status: "done",
      deliverable: "已整理进 §4 参考 App 表",
      sortOrder: 4
    },
    {
      title: "App 界面清单 → 中保真原型",
      owner: "小雨",
      status: "done",
      deliverable: "13 屏 .svg 已内置，见 §4",
      sortOrder: 5
    },
    {
      title: "界面清单 → 高保真设计稿",
      owner: "小雨",
      status: "doing",
      deliverable: "各界面 PNG 覆盖上传本 tab",
      sortOrder: 6
    },
    {
      title: "定级测评题库 & 自适应逻辑",
      owner: "小雨",
      status: "todo",
      deliverable: "测评产品文档",
      sortOrder: 7
    }
  ]);
  insertedCourseDesignTasks = 8;
}

const [courseDesignItemCountRow] = await db.select({ count: count() }).from(courseDesignItems);

if (Number(courseDesignItemCountRow?.count ?? 0) === 0) {
  const courseDesignItemSeeds = [
    ...[
      { code: "L1", name: "入门 Starter", cefr: "pre-A1 / A1", who: "零基础", focus: "字母·发音·生存口语" },
      { code: "L2", name: "基础 Elementary", cefr: "A1 – A2", who: "识单词但不敢开口", focus: "日常对话·基础语法" },
      { code: "L3", name: "进阶 Pre-Intermediate", cefr: "A2 – B1", who: "能说短句", focus: "完整表达·时态体系" },
      { code: "L4", name: "中级 Intermediate", cefr: "B1", who: "日常够用想提升", focus: "流利交流·职场场景" },
      { code: "L5", name: "中高级 Upper", cefr: "B1 – B2", who: "应试/职场刚需", focus: "雅思 5.5–6.5·职场沟通" },
      { code: "L6", name: "高级 Advanced", cefr: "B2 – C1", who: "高阶精英", focus: "学术·商务·雅思 7+" }
    ].map((fields, sortOrder) => ({ section: "level", status: "draft", sortOrder, fields })),
    ...[
      {
        code: "L1",
        market: "开口说 · 零基础启航",
        monthly: "68",
        quarter: "180",
        yearly: "588",
        reason: "引流价，低门槛拉新；比纯工具 App 贵一点但含真人点评"
      },
      { code: "L2", market: "日常英语 · 生活通", monthly: "88", quarter: "238", yearly: "788", reason: "主力走量档，覆盖最大人群" },
      { code: "L3", market: "进阶表达 · 语法突破", monthly: "108", quarter: "288", yearly: "988", reason: "去中文化拐点，付费意愿开始上升" },
      { code: "L4", market: "流利中级 · 职场沟通", monthly: "128", quarter: "348", yearly: "1188", reason: "加职场场景，客单上移" },
      { code: "L5", market: "雅思冲刺 · 5.5–6.5", monthly: "168", quarter: "458", yearly: "1588", reason: "应试溢价，对标线下雅思班几千刀" },
      { code: "L6", market: "高阶精英 · 学术商务", monthly: "198", quarter: "528", yearly: "1888", reason: "高净值小众，利润档" }
    ].map((fields, sortOrder) => ({ section: "pricing", status: "draft", sortOrder, fields })),
    ...[
      { name: "1v1 外教口语 25 min", price: "S$35 / 节 · 10 节 S$320", note: "App 订阅之上的增值，拉高客单" },
      { name: "周末线下口语角（8 人小班）", price: "S$40 / 次 · 月卡 S$128", note: "唯一教室的最佳用法：社群黏性" },
      { name: "私教定制陪跑（月）", price: "S$388", note: "高级别/应试冲刺人群" }
    ].map((fields, sortOrder) => ({ section: "addon", status: "draft", sortOrder, fields })),
    ...[
      { icon: "🔥", step: "词汇闪卡 Warm-up", desc: "5 词，SRS 间隔重复，滑卡认识/不认识", ref: "百词斩 / Duolingo" },
      { icon: "🎙", step: "口语跟读 + AI 打分", desc: "音素级发音评分，红黄绿高亮 + 雷达图", ref: "ELSA Speak" },
      { icon: "💬", step: "AI 情景对话", desc: "1 个场景 3–5 轮，roleplay，实时纠错", ref: "Speak" },
      { icon: "📖", step: "语法微课 + 即时练", desc: "1 个点讲解卡 + 3 题，答错即时纠错弹层", ref: "Duolingo" },
      { icon: "👂", step: "听力片段 + 理解题", desc: "短音频 + 2–3 题，级别越高越长", ref: "Busuu" },
      { icon: "✅", step: "打卡结算", desc: "连续天数 streak、经验值 XP、周榜结算弹窗", ref: "Duolingo" }
    ].map((fields, sortOrder) => ({ section: "daily", status: "draft", sortOrder, fields })),
    ...[
      { tier: "L1 – L2", detail: "跟读/闪卡为主，语法轻量，中文辅助多，每日 15 min" },
      { tier: "L3 – L4", detail: "对话/语法为主，逐步去中文化，加写作微任务，每日 20 min" },
      { tier: "L5 – L6", detail: "应试题型（雅思 part）、长文听力、观点表达，去脚手架，每日 25 min+" }
    ].map((fields, sortOrder) => ({ section: "tier", status: "draft", sortOrder, fields })),
    ...[
      { name: "Duolingo", borrow: "学习路径 path、streak/XP 游戏化、答错即时纠错弹层" },
      { name: "ELSA Speak", borrow: "音素级发音打分、红黄绿高亮、发音雷达图" },
      { name: "Speak", borrow: "AI 自由对话、roleplay 场景卡、对话式 tutor" },
      { name: "Cambly", borrow: "真人外教预约、视频课界面、评价体系" },
      { name: "Busuu", borrow: "学习计划、社区互改、复习提醒" }
    ].map((fields, sortOrder) => ({ section: "ref_app", status: "draft", sortOrder, fields })),
    ...[
      { slug: "onboarding", no: "1", name: "定级测评流程", purpose: "欢迎 → 15min 自适应测评 → 定级结果 → 推荐课程", ref: "Busuu / Duolingo onboarding" },
      { slug: "home", no: "2", name: "首页 · 今日任务", purpose: "Daily Set 卡片流 + 顶栏 streak + 学习路径入口", ref: "Duolingo 首页" },
      { slug: "path", no: "3", name: "学习路径 Path", purpose: "级别地图，节点解锁，进度可视", ref: "Duolingo path" },
      { slug: "speaking", no: "4", name: "口语练习页", purpose: "跟读 + 波形 + AI 打分雷达 + 重录", ref: "ELSA" },
      { slug: "ai-chat", no: "5", name: "AI 情景对话页", purpose: "对话气泡 + roleplay 卡 + 纠错高亮", ref: "Speak" },
      { slug: "grammar", no: "6", name: "语法微课页", purpose: "讲解卡 + 即时练题 + 纠错弹层", ref: "Duolingo" },
      { slug: "listening", no: "7", name: "听力页", purpose: "音频播放 + 逐句 + 理解题", ref: "Busuu" },
      { slug: "review", no: "8", name: "复习 / 错题本", purpose: "SRS 待复习队列 + 错题重练", ref: "百词斩" },
      { slug: "checkin", no: "9", name: "打卡结算页", purpose: "XP、连击、成就弹窗、周榜", ref: "Duolingo" },
      { slug: "leaderboard", no: "10", name: "排行榜 / 学习小组", purpose: "周榜 + 联盟晋级 + 小组 PK", ref: "Duolingo 联盟" },
      { slug: "profile", no: "11", name: "我的", purpose: "等级、进度、订阅、约外教入口", ref: "通用" },
      { slug: "paywall", no: "12", name: "订阅付费页", purpose: "级别套餐、月/季/年、权益对比", ref: "Duolingo Plus / Cambly" },
      { slug: "booking", no: "13", name: "线下 / 外教预约", purpose: "口语角、1v1 排期与预约", ref: "Cambly" }
    ].map((fields, sortOrder) => ({ section: "screen", status: "draft", sortOrder, fields, imageKey: null }))
  ] satisfies (typeof courseDesignItems.$inferInsert)[];

  await db.insert(courseDesignItems).values(courseDesignItemSeeds);
  insertedCourseDesignItems = courseDesignItemSeeds.length;
}

if (!fallbackCompany) {
  financeSeedWarnings.push("未找到任何 companies, 跳过 businesses/scheme/billing 财务 seed");
} else {
  const findCompanyId = async (name: string) => {
    const [company] = await db.select().from(companies).where(eq(companies.name, name)).limit(1);

    if (company) {
      return company.id;
    }

    financeSeedWarnings.push(`未找到公司 ${name}, 使用 ${fallbackCompany.name} 兜底`);
    return fallbackCompany.id;
  };

  const juyiCompanyId = await findCompanyId("JUYI 咨询");
  const kaideCompanyId = await findCompanyId("恺德学校");

  const businessSeeds = [
    {
      code: "ep",
      name: "EP 申请",
      nameEn: "EP Application",
      companyId: juyiCompanyId,
      category: "移民",
      sortOrder: 10
    },
    {
      code: "ica",
      name: "ICA 申诉",
      nameEn: "ICA Appeal",
      companyId: juyiCompanyId,
      category: "移民",
      sortOrder: 20
    },
    {
      code: "diploma",
      name: "成人大专",
      nameEn: "Adult Diploma",
      companyId: kaideCompanyId,
      category: "教育",
      sortOrder: 30
    },
    {
      code: "english",
      name: "成人英语",
      nameEn: "Adult English",
      companyId: kaideCompanyId,
      category: "教育",
      sortOrder: 40
    },
    {
      code: "wsq",
      name: "WSQ 课程",
      nameEn: "WSQ Course",
      companyId: kaideCompanyId,
      category: "教育",
      sortOrder: 50
    }
  ] as const;

  for (const businessSeed of businessSeeds) {
    const [business] = await db
      .insert(businesses)
      .values({
        code: businessSeed.code,
        name: businessSeed.name,
        nameEn: businessSeed.nameEn,
        companyId: businessSeed.companyId,
        category: businessSeed.category,
        status: "active",
        sortOrder: businessSeed.sortOrder
      })
      .onConflictDoUpdate({
        target: businesses.code,
        set: {
          name: businessSeed.name,
          nameEn: businessSeed.nameEn,
          companyId: businessSeed.companyId,
          category: businessSeed.category,
          status: "active",
          sortOrder: businessSeed.sortOrder
        }
      })
      .returning();

    if (!business) {
      continue;
    }

    upsertedBusinesses += 1;

    const existingVersions = await db
      .select()
      .from(schemeVersions)
      .where(eq(schemeVersions.businessId, business.id))
      .orderBy(schemeVersions.createdAt)
      .limit(1);

    if (existingVersions[0]) {
      skippedSchemeVersions += 1;

      if (!business.defaultVersionId) {
        await db
          .update(businesses)
          .set({ defaultVersionId: existingVersions[0].id })
          .where(eq(businesses.id, business.id));
      }

      continue;
    }

    const engineLines: SchemeLineInput[] = oneTimePreset.lines.map((line) => {
      const partyId = line.partyCode ? partyIdByCode.get(line.partyCode) : undefined;

      if (line.partyCode && !partyId) {
        throw new Error(`deal_party_missing:${line.partyCode}`);
      }

      const engineLine: SchemeLineInput = { ...line };

      if (partyId) {
        engineLine.partyId = partyId;
      }

      return engineLine;
    });
    const economics = computeDealEconomics(engineLines, oneTimePreset.assumedInputs);

    const [version] = await db
      .insert(schemeVersions)
      .values({
        businessId: business.id,
        label: "v1",
        status: "active",
        effectiveFrom: today(),
        assumedInputs: oneTimePreset.assumedInputs,
        profitRate: toNumeric(economics.totals.profitRate) ?? "0"
      })
      .returning();

    if (!version) {
      throw new Error(`scheme_version_create_failed:${business.code}`);
    }

    insertedSchemeVersions += 1;

    await db.insert(schemeLines).values(
      oneTimePreset.lines.map((line, index) => ({
        versionId: version.id,
        sortOrder: index,
        kind: line.kind,
        basis: line.basis,
        recurrence: line.recurrence,
        partyId: line.partyCode ? partyIdByCode.get(line.partyCode) ?? null : line.partyId ?? null,
        rate: toNumeric(line.rate),
        unitLabel: line.unitLabel,
        inputKey: line.inputKey,
        label: line.label ?? ""
      }))
    );
    insertedSchemeLines += oneTimePreset.lines.length;

    await db
      .update(businesses)
      .set({ defaultVersionId: version.id })
      .where(eq(businesses.id, business.id));
  }

  // 已弃用「每单录入总价」:一次性收入靠 scheme_line.rate 的固定价,不再回填 input_key='price'

  const [epBusiness] = await db
    .select({
      id: businesses.id,
      defaultVersionId: businesses.defaultVersionId
    })
    .from(businesses)
    .where(eq(businesses.code, "ep"))
    .limit(1);

  if (!epBusiness) {
    financeSeedWarnings.push("未找到业务 ep, 跳过 EP 默认里程碑 seed");
  } else {
    let epDefaultVersionId = epBusiness.defaultVersionId;

    if (!epDefaultVersionId) {
      const [firstEpVersion] = await db
        .select({ id: schemeVersions.id })
        .from(schemeVersions)
        .where(eq(schemeVersions.businessId, epBusiness.id))
        .orderBy(schemeVersions.createdAt)
        .limit(1);

      epDefaultVersionId = firstEpVersion?.id ?? null;
    }

    if (!epDefaultVersionId) {
      financeSeedWarnings.push("EP 未找到默认方案版本, 跳过 EP 默认里程碑 seed");
    } else {
      const milestoneSeeds = [
        { seq: 1, label: "首付", basis: "percent" as const, value: "30.00", bindStepOrder: 1 },
        { seq: 2, label: "尾款", basis: "percent" as const, value: "70.00", bindStepOrder: 8 }
      ];

      for (const milestoneSeed of milestoneSeeds) {
        const [existingMilestone] = await db
          .select({ id: schemeMilestones.id })
          .from(schemeMilestones)
          .where(
            and(
              eq(schemeMilestones.versionId, epDefaultVersionId),
              eq(schemeMilestones.seq, milestoneSeed.seq)
            )
          )
          .limit(1);

        const row = {
          versionId: epDefaultVersionId,
          seq: milestoneSeed.seq,
          label: milestoneSeed.label,
          basis: milestoneSeed.basis,
          value: milestoneSeed.value,
          bindStepOrder: milestoneSeed.bindStepOrder,
          dueOffsetDays: null,
          note: "[DEMO] EP 默认收款里程碑"
        };

        if (existingMilestone) {
          await db.update(schemeMilestones).set(row).where(eq(schemeMilestones.id, existingMilestone.id));
        } else {
          await db.insert(schemeMilestones).values(row);
        }

        schemeMilestonesUpserted += 1;
      }

      const downPaymentCollectionItemId = collectionItemIdByCode.get("down_payment");
      const finalCollectionItemId = collectionItemIdByCode.get("final");

      if (!downPaymentCollectionItemId || !finalCollectionItemId) {
        financeSeedWarnings.push("未找到首付/尾款 collection_items, 跳过 EP 名目回填");
      } else {
        const linkedDownPayment = await db
          .update(schemeMilestones)
          .set({ collectionItemId: downPaymentCollectionItemId })
          .where(
            and(
              eq(schemeMilestones.versionId, epDefaultVersionId),
              isNull(schemeMilestones.collectionItemId),
              sql`${schemeMilestones.label} like ${"%首付%"}`
            )
          )
          .returning({ id: schemeMilestones.id });

        const linkedFinal = await db
          .update(schemeMilestones)
          .set({ collectionItemId: finalCollectionItemId })
          .where(
            and(
              eq(schemeMilestones.versionId, epDefaultVersionId),
              isNull(schemeMilestones.collectionItemId),
              sql`${schemeMilestones.label} like ${"%尾款%"}`
            )
          )
          .returning({ id: schemeMilestones.id });

        epMilestonesLinked += linkedDownPayment.length + linkedFinal.length;
      }
    }
  }

  const downPaymentCollectionItemId = collectionItemIdByCode.get("down_payment");
  const finalCollectionItemId = collectionItemIdByCode.get("final");

  if (!downPaymentCollectionItemId || !finalCollectionItemId) {
    financeSeedWarnings.push("未找到首付/尾款 collection_items, 跳过 EP 模板步骤收款回填");
  } else {
    const epTemplates = await db
      .select({ id: workflowTemplates.id })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.businessType, "ep"));

    if (epTemplates.length === 0) {
      financeSeedWarnings.push("未找到 EP 工作流模板, 跳过 EP 模板步骤收款回填");
    }

    for (const template of epTemplates) {
      const [maxStepRow] = await db
        .select({ maxStepOrder: sql<number | null>`max(${templateSteps.stepOrder})::int` })
        .from(templateSteps)
        .where(eq(templateSteps.templateId, template.id));

      const maxStepOrder = maxStepRow?.maxStepOrder ?? null;

      if (!maxStepOrder) {
        financeSeedWarnings.push(`EP 工作流模板 ${template.id} 未找到步骤, 跳过收款回填`);
        continue;
      }

      const firstStepUpdated = await db
        .update(templateSteps)
        .set({ collections: [{ collection_item_id: downPaymentCollectionItemId, required: true }] })
        .where(
          and(
            eq(templateSteps.templateId, template.id),
            eq(templateSteps.stepOrder, 1),
            sql`${templateSteps.collections} = '[]'::jsonb`
          )
        )
        .returning({ id: templateSteps.id });

      const finalStepUpdated = await db
        .update(templateSteps)
        .set({ collections: [{ collection_item_id: finalCollectionItemId, required: true }] })
        .where(
          and(
            eq(templateSteps.templateId, template.id),
            eq(templateSteps.stepOrder, maxStepOrder),
            sql`${templateSteps.collections} = '[]'::jsonb`
          )
        )
        .returning({ id: templateSteps.id });

      epStepCollectionsSet += firstStepUpdated.length + finalStepUpdated.length;
    }
  }

  const [billingCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(billing);
  const billingCount = billingCountRow?.count ?? 0;

  if (billingCount === 0) {
    financeSeedWarnings.push("billing 当前 0 行, 跳过 billing business_id/scheme_version_id 回填");
  } else {
    const seededBusinesses = await db.select().from(businesses);
    const businessByCode = new Map(seededBusinesses.map((business) => [business.code, business]));

    for (const code of ["ep", "ica", "diploma", "english", "wsq"] as const) {
      const business = businessByCode.get(code);

      if (!business) {
        financeSeedWarnings.push(`未找到业务 ${code}, 跳过对应 billing 回填`);
        continue;
      }

      const updated = await db
        .update(billing)
        .set({
          businessId: business.id,
          schemeVersionId: business.defaultVersionId
        })
        .where(and(eq(billing.refType, code), isNull(billing.businessId)))
        .returning({ id: billing.id });

      updatedBillingRows += updated.length;
    }
  }
}

async function seedAcademyDemo() {
  const existingDemoStudent = await db.query.students.findFirst({
    where: sql`${students.name} like '[DEMO]%'`
  });

  if (existingDemoStudent) {
    return {
      demoSkipped: true,
      demoStudents: 0,
      demoEnrollments: 0,
      demoPayments: 0,
      demoPaid: 0,
      demoExpenses: 0
    };
  }

  const period = currentPeriod();
  const demoNames = ["[DEMO] 张三", "[DEMO] 李四", "[DEMO] 王五", "[DEMO] 赵六"];
  const startOffsets = [-3, -2, -1, 0];
  let demoPaid = 0;

  const result = await db.transaction(async (tx) => {
    const createdStudents = await tx
      .insert(students)
      .values(
        demoNames.map((name, index) => ({
          name,
          phone: `+65 8000 100${index}`,
          note: "[DEMO] 学院月度收款演示数据"
        }))
      )
      .returning({ id: students.id });

    const createdEnrollments: { id: string }[] = [];
    const paymentRows: (typeof diplomaPayments.$inferInsert)[] = [];

    for (const [index, student] of createdStudents.entries()) {
      const startPeriod = addMonthsToPeriod(period, startOffsets[index] ?? 0);
      const [enrollment] = await tx
        .insert(diplomaEnrollments)
        .values({
          studentId: student.id,
          program: "城市轨道交通运营管理",
          moduleId: null,
          enrollDate: `${startPeriod}-01`,
          billingId: null,
          installmentsCount: 6,
          startPeriod,
          depositAmount: toMoney(1000),
          graduated: false
        })
        .returning({ id: diplomaEnrollments.id });

      if (!enrollment) {
        throw new Error("academy_demo_enrollment_create_failed");
      }

      createdEnrollments.push(enrollment);

      for (let monthIndex = 0; monthIndex < 6; monthIndex += 1) {
        const paymentPeriod = addMonthsToPeriod(startPeriod, monthIndex);
        const isDue = paymentPeriod <= period;
        const paid = isDue && (index + monthIndex) % 2 === 0;

        if (paid) {
          demoPaid += 1;
        }

        paymentRows.push({
          enrollmentId: enrollment.id,
          period: paymentPeriod,
          amount: toMoney(2500),
          paid,
          paidAt: paid ? new Date(`${paymentPeriod}-15T04:00:00.000Z`) : null,
          note: "[DEMO] 学院月度收款"
        });
      }
    }

    await tx.insert(diplomaPayments).values(paymentRows);

    let demoExpenses = 0;
    let [existingKaideCompany] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.name, "恺德学校"))
      .limit(1);

    if (!existingKaideCompany) {
      [existingKaideCompany] = await tx
        .insert(companies)
        .values({ name: "恺德学校", status: "active", note: "[DEMO] 学院收款演示公司" })
        .returning({ id: companies.id });
    }

    if (existingKaideCompany) {
      const [existingExpense] = await tx
        .select({ id: companyExpenses.id })
        .from(companyExpenses)
        .where(
          and(
            eq(companyExpenses.companyId, existingKaideCompany.id),
            eq(companyExpenses.period, period),
            eq(companyExpenses.note, "[DEMO] 月租")
          )
        )
        .limit(1);

      if (!existingExpense) {
        await tx.insert(companyExpenses).values({
          companyId: existingKaideCompany.id,
          type: "rent",
          amount: toMoney(4000),
          currency: "SGD",
          period,
          note: "[DEMO] 月租"
        });
        demoExpenses = 1;
      }
    }

    return {
      demoSkipped: false,
      demoStudents: createdStudents.length,
      demoEnrollments: createdEnrollments.length,
      demoPayments: paymentRows.length,
      demoPaid,
      demoExpenses
    };
  });

  return result;
}

const academyDemoStats = await seedAcademyDemo();

async function seedFinanceLedgerDemo() {
  const expenseCategorySeeds = [
    { code: "rent", name: "房租", nameEn: "Rent", reportSection: "operating_expense" },
    { code: "utility", name: "水电", nameEn: "Utilities", reportSection: "operating_expense" },
    { code: "broadband", name: "宽带", nameEn: "Broadband", reportSection: "operating_expense" },
    { code: "salary", name: "工资", nameEn: "Salary", reportSection: "operating_expense" },
    { code: "cpf", name: "CPF", nameEn: "CPF", reportSection: "operating_expense" },
    { code: "levy", name: "劳工税", nameEn: "Levy", reportSection: "operating_expense" },
    { code: "marketing", name: "市场推广", nameEn: "Marketing", reportSection: "operating_expense" },
    { code: "office", name: "办公杂费", nameEn: "Office", reportSection: "operating_expense" },
    { code: "commission_payout", name: "分成支出", nameEn: "Commission Payout", reportSection: "operating_expense" },
    { code: "other", name: "其它", nameEn: "Other", reportSection: "other" }
  ] as const;

  let expenseCategoriesUpserted = 0;
  let bankAccountsUpserted = 0;
  let recurringCostsUpserted = 0;
  let bankOpeningSet = 0;
  let ledgerBridged = 0;
  let statementLinesDemo = 0;

  const result = await db.transaction(async (tx) => {
    for (const category of expenseCategorySeeds) {
      await tx
        .insert(expenseCategories)
        .values({
          code: category.code,
          name: category.name,
          nameEn: category.nameEn,
          reportSection: category.reportSection,
          active: true,
          isSystem: true
        })
        .onConflictDoUpdate({
          target: expenseCategories.code,
          set: {
            name: category.name,
            nameEn: category.nameEn,
            reportSection: category.reportSection,
            active: true,
            isSystem: true
          }
        });
      expenseCategoriesUpserted += 1;
    }

    const ensureCompany = async (name: string, note: string) => {
      const [existingCompany] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.name, name))
        .limit(1);

      if (existingCompany) {
        return existingCompany;
      }

      const [createdCompany] = await tx
        .insert(companies)
        .values({ name, status: "active", note })
        .returning({ id: companies.id });

      if (!createdCompany) {
        throw new Error(`company_create_failed:${name}`);
      }

      return createdCompany;
    };

    const ensureBankAccount = async (companyId: string) => {
      const accountName = "主账户";
      const [existingAccount] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.name, accountName)))
        .limit(1);

      if (existingAccount) {
        await tx
          .update(bankAccounts)
          .set({
            currency: "SGD",
            isPrimary: true,
            active: true
          })
          .where(eq(bankAccounts.id, existingAccount.id));
        bankAccountsUpserted += 1;
        return existingAccount;
      }

      const [createdAccount] = await tx
        .insert(bankAccounts)
        .values({
          companyId,
          name: accountName,
          currency: "SGD",
          isPrimary: true,
          active: true
        })
        .returning({ id: bankAccounts.id });

      if (!createdAccount) {
        throw new Error(`bank_account_create_failed:${companyId}`);
      }

      bankAccountsUpserted += 1;
      return createdAccount;
    };

    const period = currentPeriod();
    const openingDate = `${period}-01`;
    const juyiCompany = await ensureCompany("JUYI 咨询", "Seed company for finance demo");
    const kaideCompany = await ensureCompany("恺德学校", "[DEMO] 学院收款演示公司");
    const juyiAccount = await ensureBankAccount(juyiCompany.id);
    const kaideAccount = await ensureBankAccount(kaideCompany.id);

    const [rentCategory] = await tx
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(eq(expenseCategories.code, "rent"))
      .limit(1);

    const [broadbandCategory] = await tx
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(eq(expenseCategories.code, "broadband"))
      .limit(1);

    const maybeSetOpening = async (accountId: string, openingBalance: string) => {
      const [account] = await tx
        .select({ id: bankAccounts.id, openingBalance: bankAccounts.openingBalance })
        .from(bankAccounts)
        .where(eq(bankAccounts.id, accountId))
        .limit(1);

      if (!account || Number(account.openingBalance) !== 0) {
        return;
      }

      await tx
        .update(bankAccounts)
        .set({ openingBalance, openingDate })
        .where(eq(bankAccounts.id, account.id));
      bankOpeningSet += 1;
    };

    await maybeSetOpening(kaideAccount.id, toMoney(20000));
    await maybeSetOpening(juyiAccount.id, toMoney(30000));

    const upsertRecurringCost = async (values: {
      companyId: string;
      expenseCategoryId?: string | null;
      label: string;
      amount: string;
      dueDay: number;
    }) => {
      const [existingCost] = await tx
        .select({ id: recurringCosts.id })
        .from(recurringCosts)
        .where(and(eq(recurringCosts.companyId, values.companyId), eq(recurringCosts.label, values.label)))
        .limit(1);

      const row = {
        companyId: values.companyId,
        expenseCategoryId: values.expenseCategoryId,
        label: values.label,
        amount: values.amount,
        currency: "SGD" as const,
        dueDay: values.dueDay,
        active: true,
        note: "[DEMO]"
      };

      if (existingCost) {
        await tx.update(recurringCosts).set(row).where(eq(recurringCosts.id, existingCost.id));
      } else {
        await tx.insert(recurringCosts).values(row);
      }

      recurringCostsUpserted += 1;
    };

    if (rentCategory) {
      await upsertRecurringCost({
        companyId: kaideCompany.id,
        expenseCategoryId: rentCategory.id,
        label: "[DEMO] 办公室房租",
        amount: toMoney(4000),
        dueDay: 5
      });
    }

    if (broadbandCategory) {
      await upsertRecurringCost({
        companyId: kaideCompany.id,
        expenseCategoryId: broadbandCategory.id,
        label: "[DEMO] 公司宽带",
        amount: toMoney(120),
        dueDay: 10
      });
    }

    const [demoExpense] = await tx
      .select({
        id: companyExpenses.id,
        amount: companyExpenses.amount,
        currency: companyExpenses.currency,
        paidAt: companyExpenses.paidAt,
        createdAt: companyExpenses.createdAt,
        documentId: companyExpenses.documentId
      })
      .from(companyExpenses)
      .where(and(eq(companyExpenses.companyId, kaideCompany.id), eq(companyExpenses.note, "[DEMO] 月租")))
      .limit(1);

    if (demoExpense && rentCategory) {
      const proofDocumentIds = demoExpense.documentId ? [demoExpense.documentId] : [];
      const occurredAt = demoExpense.paidAt ?? demoExpense.createdAt;
      const [existingLedger] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.sourceType, "company_expense"),
            eq(ledgerEntries.sourceId, demoExpense.id)
          )
        )
        .limit(1);

      if (existingLedger) {
        await tx
          .update(ledgerEntries)
          .set({
            companyId: kaideCompany.id,
            bankAccountId: kaideAccount.id,
            direction: "out",
            amount: demoExpense.amount,
            currency: demoExpense.currency,
            sgdEquivalent: demoExpense.amount,
            occurredAt,
            expenseCategoryId: rentCategory.id,
            proofDocumentIds,
            note: "[DEMO]"
          })
          .where(eq(ledgerEntries.id, existingLedger.id));
        ledgerBridged = 1;
      } else {
        await tx.insert(ledgerEntries).values({
          companyId: kaideCompany.id,
          bankAccountId: kaideAccount.id,
          direction: "out",
          amount: demoExpense.amount,
          currency: demoExpense.currency,
          sgdEquivalent: demoExpense.amount,
          occurredAt,
          expenseCategoryId: rentCategory.id,
          proofDocumentIds,
          sourceType: "company_expense",
          sourceId: demoExpense.id,
          note: "[DEMO]"
        });
        ledgerBridged = 1;
      }

      const statementSeeds = [
        {
          amount: demoExpense.amount,
          description: "[DEMO] 月租",
          occurredAt
        },
        {
          amount: toMoney(88),
          description: "[DEMO] 银行手续费",
          occurredAt
        }
      ] as const;

      for (const statementSeed of statementSeeds) {
        const [existingStatementLine] = await tx
          .select({ id: bankStatementLines.id })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.bankAccountId, kaideAccount.id),
              eq(bankStatementLines.importBatch, "[DEMO]"),
              eq(bankStatementLines.amount, statementSeed.amount),
              eq(bankStatementLines.description, statementSeed.description)
            )
          )
          .limit(1);

        if (existingStatementLine) {
          continue;
        }

        await tx.insert(bankStatementLines).values({
          bankAccountId: kaideAccount.id,
          occurredAt: statementSeed.occurredAt,
          direction: "out",
          amount: statementSeed.amount,
          currency: "SGD",
          description: statementSeed.description,
          importBatch: "[DEMO]",
          note: "[DEMO]"
        });
        statementLinesDemo += 1;
      }
    }

    return {
      expenseCategoriesUpserted,
      bankAccountsUpserted,
      recurringCostsUpserted,
      bankOpeningSet,
      ledgerBridged,
      statementLinesDemo
    };
  });

  return result;
}

const financeLedgerDemoStats = await seedFinanceLedgerDemo();

async function seedDemoSales() {
  let demoSalesUpserted = 0;
  let salesAssignmentsUpserted = 0;

  const result = await db.transaction(async (tx) => {
    const [existingJuyiCompany] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.name, "JUYI 咨询"))
      .limit(1);

    const [juyiCompany] = existingJuyiCompany
      ? [existingJuyiCompany]
      : await tx
          .insert(companies)
          .values({ name: "JUYI 咨询", status: "active", note: "Seed company for finance demo" })
          .returning({ id: companies.id });

    if (!juyiCompany) {
      throw new Error("demo_sales_company_create_failed");
    }

    const businessSeeds = [
      {
        code: "ep",
        name: "EP 申请",
        nameEn: "EP Application",
        category: "移民",
        sortOrder: 10
      },
      {
        code: "ica",
        name: "ICA 申诉",
        nameEn: "ICA Appeal",
        category: "移民",
        sortOrder: 20
      }
    ] as const;

    const assignmentBusinesses: { id: string }[] = [];

    for (const businessSeed of businessSeeds) {
      const [business] = await tx
        .insert(businesses)
        .values({
          ...businessSeed,
          companyId: juyiCompany.id,
          status: "active"
        })
        .onConflictDoUpdate({
          target: businesses.code,
          set: {
            name: businessSeed.name,
            nameEn: businessSeed.nameEn,
            companyId: juyiCompany.id,
            category: businessSeed.category,
            status: "active",
            sortOrder: businessSeed.sortOrder
          }
        })
        .returning({ id: businesses.id });

      if (business) {
        assignmentBusinesses.push(business);
      }
    }

    const demoSalesEmail = "demo.sales@bh.local";
    const [demoSales] = await tx
      .insert(employees)
      .values({
        email: demoSalesEmail,
        name: "[DEMO] 销售小陈",
        passwordHash,
        role: "sales",
        companyId: juyiCompany.id,
        employmentType: "full_time",
        status: "active",
        dataScope: "self",
        salaryCurrency: "SGD",
        mustChangePassword: true
      })
      .onConflictDoUpdate({
        target: employees.email,
        set: {
          name: "[DEMO] 销售小陈",
          passwordHash,
          role: "sales",
          companyId: juyiCompany.id,
          employmentType: "full_time",
          status: "active",
          dataScope: "self",
          salaryCurrency: "SGD",
          mustChangePassword: true,
          updatedAt: new Date()
        }
      })
      .returning({ id: employees.id });

    if (!demoSales) {
      throw new Error("demo_sales_upsert_failed");
    }

    demoSalesUpserted = 1;

    await tx
      .insert(employeeCompensation)
      .values({
        employeeId: demoSales.id,
        baseSalary: toMoney(2000),
        salaryCurrency: "SGD"
      })
      .onConflictDoUpdate({
        target: employeeCompensation.employeeId,
        set: {
          baseSalary: toMoney(2000),
          salaryCurrency: "SGD",
          updatedAt: new Date()
        }
      });

    for (const business of assignmentBusinesses) {
      await tx
        .insert(salesBusinessAssignments)
        .values({
          salesId: demoSales.id,
          businessId: business.id,
          commissionType: null,
          commissionValue: null,
          active: true,
          note: "[DEMO] 提成留空=用方案"
        })
        .onConflictDoUpdate({
          target: [salesBusinessAssignments.salesId, salesBusinessAssignments.businessId],
          set: {
            commissionType: null,
            commissionValue: null,
            active: true,
            note: "[DEMO] 提成留空=用方案"
          }
        });
      salesAssignmentsUpserted += 1;
    }

    return {
      demoSalesUpserted,
      salesAssignmentsUpserted
    };
  });

  return result;
}

const demoSalesStats = await seedDemoSales();

const backfillPermissionSeedData = async () => {
  // owner + admin 默认组织级(all):管理员要管公司本身,且多无单一 companyId,
  // 若设成 company 而无公司访问会被公司闸锁死。公司级隔离的灵活性留给 accountant/principal/sales 等,
  // 授权界面仍可把任一 admin 单独收窄为 company + 指定公司。
  await db
    .update(employees)
    .set({ dataScope: "all" })
    .where(sql`${employees.role} in ('owner', 'admin')`);

  await db
    .update(employees)
    .set({ dataScope: "company" })
    .where(sql`${employees.role} in ('accountant', 'principal')`);

  await db
    .update(employees)
    .set({ dataScope: "self" })
    .where(sql`${employees.role} in ('sales', 'clerk', 'teacher', 'photographer')`);

  const companyEmployees = await db
    .select({
      employeeId: employees.id,
      companyId: employees.companyId
    })
    .from(employees)
    .where(sql`${employees.companyId} is not null`);

  for (const employee of companyEmployees) {
    if (!employee.companyId) {
      continue;
    }

    await db
      .insert(employeeCompanyAccess)
      .values({
        employeeId: employee.employeeId,
        companyId: employee.companyId
      })
      .onConflictDoNothing({
        target: [employeeCompanyAccess.employeeId, employeeCompanyAccess.companyId]
      });
  }

  return {
    employeeCompanyAccessBackfilled: companyEmployees.filter((employee) => employee.companyId).length
  };
};

const permissionSeedStats = await backfillPermissionSeedData();

await pool.end();

console.log(
  `Seed completed: owner=${owner?.email ?? ownerEmail}, documentCategoriesInserted=${insertedCategories}, industriesInserted=${insertedIndustries}, payrollSettingsInserted=${insertedPayrollSettings}, workShiftsInserted=${insertedWorkShifts}, templatesInserted=${insertedWorkflowTemplates}, dealPartiesUpserted=${upsertedDealParties}, collectionItemsUpserted=${collectionItemsUpserted}, courseDesignTasksInserted=${insertedCourseDesignTasks}, courseDesignItemsInserted=${insertedCourseDesignItems}, businessesUpserted=${upsertedBusinesses}, schemeVersionsInserted=${insertedSchemeVersions}, schemeVersionsSkipped=${skippedSchemeVersions}, schemeLinesInserted=${insertedSchemeLines}, oneTimePriceLinesPatched=${oneTimePriceLinesPatched}, schemeMilestonesUpserted=${schemeMilestonesUpserted}, epMilestonesLinked=${epMilestonesLinked}, epStepCollectionsSet=${epStepCollectionsSet}, billingRowsBackfilled=${updatedBillingRows}, DEMO academySkipped=${academyDemoStats.demoSkipped}, demoStudents=${academyDemoStats.demoStudents}, demoEnrollments=${academyDemoStats.demoEnrollments}, demoPayments=${academyDemoStats.demoPayments}, demoPaid=${academyDemoStats.demoPaid}, demoExpenses=${academyDemoStats.demoExpenses}, expenseCategoriesUpserted=${financeLedgerDemoStats.expenseCategoriesUpserted}, expenseCategoryReportSections=default operating_expense; other=other, bankAccountsUpserted=${financeLedgerDemoStats.bankAccountsUpserted}, recurringCostsUpserted=${financeLedgerDemoStats.recurringCostsUpserted}, bankOpeningSet=${financeLedgerDemoStats.bankOpeningSet}, ledgerBridged=${financeLedgerDemoStats.ledgerBridged}, statementLinesDemo=${financeLedgerDemoStats.statementLinesDemo}, demoSalesUpserted=${demoSalesStats.demoSalesUpserted}, salesAssignmentsUpserted=${demoSalesStats.salesAssignmentsUpserted}, employeeCompanyAccessBackfilled=${permissionSeedStats.employeeCompanyAccessBackfilled}, warnings=${financeSeedWarnings.join(" | ") || "none"}`
);
