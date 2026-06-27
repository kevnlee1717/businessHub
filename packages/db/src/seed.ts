import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { DEAL_PRESETS, computeDealEconomics, type SchemeLineInput } from "@bh/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pool } from "./index";
import {
  bankAccounts,
  bankStatementLines,
  billing,
  businesses,
  companyExpenses,
  companies,
  dealParties,
  documentCategories,
  diplomaEnrollments,
  diplomaPayments,
  employees,
  expenseCategories,
  industries,
  ledgerEntries,
  payrollSettings,
  recurringCosts,
  schemeLines,
  schemeMilestones,
  schemeVersions,
  students,
  templateSteps,
  workflowTemplates,
  workShifts
} from "./schema/index";

config({ path: "../../.env" });

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "admin@bh.local";
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "changeme";
const ownerName = process.env.SEED_OWNER_NAME ?? "Owner";

const passwordHash = await bcrypt.hash(ownerPassword, 10);

const [owner] = await db
  .insert(employees)
  .values({
    email: ownerEmail,
    name: ownerName,
    passwordHash,
    role: "owner"
  })
  .onConflictDoUpdate({
    target: employees.email,
    set: {
      name: ownerName,
      passwordHash,
      role: "owner",
      status: "active",
      updatedAt: new Date()
    }
  })
  .returning({ id: employees.id, email: employees.email });

const categorySeeds = [
  { name: "护照", nameEn: "Passport" },
  { name: "学历证明", nameEn: "Education Certificate" },
  { name: "合同", nameEn: "Contract" },
  { name: "租房合同", nameEn: "Tenancy Agreement" },
  { name: "bizfile", nameEn: "Bizfile" },
  { name: "收据", nameEn: "Receipt" },
  { name: "其它", nameEn: "Other" }
] as const;

let insertedCategories = 0;

for (const category of categorySeeds) {
  const existing = await db.query.documentCategories.findFirst({
    where: eq(documentCategories.name, category.name)
  });

  if (!existing) {
    await db.insert(documentCategories).values({
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
        requiredDocuments: [{ name: "签约合同", name_en: "Service Contract", required: true }]
      },
      {
        name: "搜集资料",
        nameEn: "Collect Documents",
        requiredDocuments: [
          { name: "身份证", name_en: "ID Card", required: true },
          { name: "学历证书", name_en: "Education Certificate", required: true },
          { name: "工作经历", name_en: "Work Experience", required: true }
        ]
      },
      {
        name: "注册公司",
        nameEn: "Register Company",
        description: "含预约视频 KYC(预约时间 + 保存 KYC 视频,后续版本支持)",
        requiredDocuments: [{ name: "公司注册文件", name_en: "Company Registration", required: false }]
      },
      {
        name: "等 EP 通道",
        nameEn: "Wait for EP Quota",
        requiredDocuments: []
      },
      {
        name: "提交申请",
        nameEn: "Submit Application",
        requiredDocuments: []
      },
      {
        name: "获批",
        nameEn: "Approval",
        description: "可能要求补材料(补材料中),附材料清单",
        requiredDocuments: [{ name: "补充材料(如租房合同)", name_en: "Supplementary (e.g. Tenancy)", required: false }]
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
  },
  {
    businessType: "ica",
    name: "ICA 申诉",
    steps: [
      {
        name: "签约",
        nameEn: "Sign Contract",
        requiredDocuments: [{ name: "签约合同", name_en: "Service Contract", required: true }]
      },
      {
        name: "搜集资料",
        nameEn: "Collect Documents",
        requiredDocuments: [
          { name: "身份证", name_en: "ID Card", required: true },
          { name: "拒签信", name_en: "Rejection Letter", required: false }
        ]
      },
      {
        name: "写申诉信",
        nameEn: "Write Appeal Letter",
        requiredDocuments: [{ name: "申诉信", name_en: "Appeal Letter", required: true }]
      },
      {
        name: "填表格",
        nameEn: "Fill Forms",
        requiredDocuments: [{ name: "申请表格", name_en: "Application Form", required: true }]
      },
      {
        name: "选担保人",
        nameEn: "Select Guarantor",
        description: "从担保人库选(后续版本)",
        requiredDocuments: []
      },
      {
        name: "担保人扫脸",
        nameEn: "Guarantor Face Scan",
        requiredDocuments: []
      },
      {
        name: "提交",
        nameEn: "Submit",
        description: "结果一般3个月后,失败需重走担保人扫脸再提交(后续版本记录每次提交/拒绝时间)",
        requiredDocuments: []
      }
    ]
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
  { code: "referrer", name: "介绍人", nameEn: "Referrer" }
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

const [fallbackCompany] = await db.select().from(companies).limit(1);

let upsertedBusinesses = 0;
let insertedSchemeVersions = 0;
let skippedSchemeVersions = 0;
let insertedSchemeLines = 0;
let updatedBillingRows = 0;
let schemeMilestonesUpserted = 0;
const financeSeedWarnings: string[] = [];

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
          courseId: null,
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
    { code: "rent", name: "房租", nameEn: "Rent" },
    { code: "utility", name: "水电", nameEn: "Utilities" },
    { code: "broadband", name: "宽带", nameEn: "Broadband" },
    { code: "salary", name: "工资", nameEn: "Salary" },
    { code: "cpf", name: "CPF", nameEn: "CPF" },
    { code: "levy", name: "劳工税", nameEn: "Levy" },
    { code: "marketing", name: "市场推广", nameEn: "Marketing" },
    { code: "office", name: "办公杂费", nameEn: "Office" },
    { code: "other", name: "其它", nameEn: "Other" }
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
          active: true,
          isSystem: true
        })
        .onConflictDoUpdate({
          target: expenseCategories.code,
          set: {
            name: category.name,
            nameEn: category.nameEn,
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

await pool.end();

console.log(
  `Seed completed: owner=${owner?.email ?? ownerEmail}, documentCategoriesInserted=${insertedCategories}, industriesInserted=${insertedIndustries}, payrollSettingsInserted=${insertedPayrollSettings}, workShiftsInserted=${insertedWorkShifts}, templatesInserted=${insertedWorkflowTemplates}, dealPartiesUpserted=${upsertedDealParties}, businessesUpserted=${upsertedBusinesses}, schemeVersionsInserted=${insertedSchemeVersions}, schemeVersionsSkipped=${skippedSchemeVersions}, schemeLinesInserted=${insertedSchemeLines}, schemeMilestonesUpserted=${schemeMilestonesUpserted}, billingRowsBackfilled=${updatedBillingRows}, DEMO academySkipped=${academyDemoStats.demoSkipped}, demoStudents=${academyDemoStats.demoStudents}, demoEnrollments=${academyDemoStats.demoEnrollments}, demoPayments=${academyDemoStats.demoPayments}, demoPaid=${academyDemoStats.demoPaid}, demoExpenses=${academyDemoStats.demoExpenses}, expenseCategoriesUpserted=${financeLedgerDemoStats.expenseCategoriesUpserted}, bankAccountsUpserted=${financeLedgerDemoStats.bankAccountsUpserted}, recurringCostsUpserted=${financeLedgerDemoStats.recurringCostsUpserted}, bankOpeningSet=${financeLedgerDemoStats.bankOpeningSet}, ledgerBridged=${financeLedgerDemoStats.ledgerBridged}, statementLinesDemo=${financeLedgerDemoStats.statementLinesDemo}, warnings=${financeSeedWarnings.join(" | ") || "none"}`
);
