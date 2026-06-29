import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat, unlink } from "node:fs/promises";
import { dirname, extname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  caseStepDocuments,
  caseSteps,
  cases,
  clients,
  db,
  documents,
  pool,
  templateSteps,
  workflowTemplates
} from "@bh/db";
import { type BusinessType, type CaseStepStatus } from "@bh/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

type ImportDocument = {
  file: string;
  type?: string;
  step: number;
};

type ImportCase = {
  applicant: string;
  business_type: BusinessType;
  parent_applicant?: string;
  current_step: number;
  step_status: Record<string, CaseStepStatus>;
  documents?: ImportDocument[];
};

type ImportClient = {
  folder: string;
  primary_name: string;
  companies?: string[];
  payment_note?: string;
  flags?: string[];
  shared_documents?: ImportDocument[];
  cases: ImportCase[];
};

type ImportData = {
  ep_root: string;
  clients: ImportClient[];
};

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type Args = {
  dryRun: boolean;
  dataPath: string;
  purge: boolean;
};

type CreatedCase = {
  caseId: string;
  clientId: string | null;
  businessType: BusinessType;
  applicant: string;
  skipped: boolean;
};

type SavedDocument = typeof documents.$inferSelect;

type Stats = {
  clientsCreated: number;
  clientsReused: number;
  casesCreated: number;
  casesSkipped: number;
  stepsCreated: number;
  stepStatusesUpdated: number;
  documentSlotsCreated: number;
  filesCopied: number;
  filesLinked: number;
  filesMissing: number;
  casesPurged: number;
  stepsPurged: number;
  documentSlotsPurged: number;
  documentsPurged: number;
  filesUnlinked: number;
  clientsPurged: number;
  warnings: number;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultDataPath = join(__dirname, "ep-import-data", "pilot.json");
const uploadRoot = join(__dirname, "../../../..", "uploads");
const validStepStatuses = new Set<CaseStepStatus>(["pending", "in_progress", "need_materials", "done"]);

function parseArgs(argv: string[]): Args {
  let dryRun = false;
  let dataPath = defaultDataPath;
  let purge = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--purge") {
      purge = true;
      continue;
    }
    if (arg === "--data") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--data requires a path");
      }
      dataPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, dataPath: resolve(process.cwd(), dataPath), purge };
}

function assertImportData(value: unknown): asserts value is ImportData {
  if (!value || typeof value !== "object") {
    throw new Error("Import data must be an object");
  }

  const data = value as Partial<ImportData>;
  if (typeof data.ep_root !== "string" || !Array.isArray(data.clients)) {
    throw new Error("Import data must include ep_root and clients[]");
  }

  for (const client of data.clients) {
    if (!client || typeof client.folder !== "string" || !Array.isArray(client.cases)) {
      throw new Error("Each client must include folder and cases[]");
    }
    for (const caseItem of client.cases) {
      if (
        !caseItem ||
        typeof caseItem.applicant !== "string" ||
        !["ep", "dp", "ica"].includes(caseItem.business_type) ||
        typeof caseItem.current_step !== "number" ||
        !caseItem.step_status
      ) {
        throw new Error(`Invalid case data in folder ${client.folder}`);
      }
      for (const status of Object.values(caseItem.step_status)) {
        if (!validStepStatuses.has(status)) {
          throw new Error(`Invalid step status "${status}" for ${caseItem.applicant}`);
        }
      }
    }
  }
}

async function loadImportData(dataPath: string): Promise<ImportData> {
  const parsed: unknown = JSON.parse(await readFile(dataPath, "utf8"));
  assertImportData(parsed);
  return parsed;
}

function getMime(filename: string): string {
  const extension = extname(filename).toLowerCase();
  const mimeByExtension: Record<string, string> = {
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };

  return mimeByExtension[extension] ?? "application/octet-stream";
}

function noteForImportClient(client: ImportClient): string | null {
  const parts = [
    client.companies?.length ? `Companies: ${client.companies.join(", ")}` : null,
    client.payment_note ? `Payment: ${client.payment_note}` : null,
    client.flags?.length ? `Flags: ${client.flags.join("; ")}` : null,
    `EP import folder: ${client.folder}`
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n") : null;
}

function getDocumentIds(row: typeof caseStepDocuments.$inferSelect): string[] {
  return row.documentIds.length > 0 ? row.documentIds : row.documentId ? [row.documentId] : [];
}

async function findClientByName(tx: DbLike, name: string) {
  const [row] = await tx.select().from(clients).where(eq(clients.name, name)).limit(1);
  return row;
}

async function ensureClient(tx: DbLike, name: string, note: string | null, stats: Stats) {
  const existing = await findClientByName(tx, name);
  if (existing) {
    stats.clientsReused += 1;
    console.log(`  client reused: ${name} (${existing.id})`);
    return existing;
  }

  const [created] = await tx
    .insert(clients)
    .values({
      name,
      nameEn: null,
      phone: null,
      email: null,
      note
    })
    .returning();

  if (!created) {
    throw new Error(`client_create_failed: ${name}`);
  }

  stats.clientsCreated += 1;
  console.log(`  client created: ${name} (${created.id})`);
  return created;
}

async function findExistingCase(tx: DbLike, clientId: string, businessType: BusinessType) {
  const [row] = await tx
    .select()
    .from(cases)
    .where(and(eq(cases.clientId, clientId), eq(cases.businessType, businessType)))
    .limit(1);
  return row;
}

function applicantNames(data: ImportData): string[] {
  return [
    ...new Set(data.clients.flatMap((client) => client.cases.map((caseItem) => caseItem.applicant.trim())).filter(Boolean))
  ];
}

function maxReferencedStep(caseItem: ImportCase): number {
  const statusSteps = Object.keys(caseItem.step_status).map((step) => Number(step));
  const documentSteps = (caseItem.documents ?? []).map((document) => document.step);
  return Math.max(caseItem.current_step, 0, ...statusSteps, ...documentSteps);
}

async function selectTemplate(tx: DbLike, businessType: BusinessType, minStep: number, stats: Stats) {
  const [typedTemplate] = await tx
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.businessType, businessType))
    .limit(1);
  const [epTemplate] = await tx
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.businessType, "ep"))
    .limit(1);

  const candidate = businessType === "dp" ? typedTemplate ?? epTemplate : typedTemplate;
  if (!candidate) {
    throw new Error(`workflow_template_not_found: ${businessType}`);
  }

  const candidateSteps = await tx
    .select()
    .from(templateSteps)
    .where(eq(templateSteps.templateId, candidate.id))
    .orderBy(asc(templateSteps.stepOrder));
  const candidateMaxStep = Math.max(0, ...candidateSteps.map((step) => step.stepOrder));

  if (businessType === "dp" && epTemplate && candidate.businessType === "dp" && candidateMaxStep < minStep) {
    const epSteps = await tx
      .select()
      .from(templateSteps)
      .where(eq(templateSteps.templateId, epTemplate.id))
      .orderBy(asc(templateSteps.stepOrder));
    stats.warnings += 1;
    console.warn(
      `  warning: dp template "${candidate.name}" only has ${candidateMaxStep} steps; using EP template for step ${minStep}`
    );
    return { template: epTemplate, templateStepRows: epSteps };
  }

  return { template: candidate, templateStepRows: candidateSteps };
}

async function cloneSteps(tx: DbLike, caseId: string, templateStepRows: (typeof templateSteps.$inferSelect)[], stats: Stats) {
  const stepRows: (typeof caseSteps.$inferSelect)[] = [];

  for (const templateStep of templateStepRows) {
    const [step] = await tx
      .insert(caseSteps)
      .values({
        caseId,
        stepOrder: templateStep.stepOrder,
        name: templateStep.name,
        nameEn: templateStep.nameEn,
        description: templateStep.description,
        collections: templateStep.collections,
        assigneeId: null
      })
      .returning();

    if (!step) {
      throw new Error(`case_step_snapshot_failed: ${caseId}`);
    }

    stepRows.push(step);
    stats.stepsCreated += 1;
    console.log(`    step cloned: #${step.stepOrder} ${step.name}`);

    for (const item of templateStep.requiredDocuments) {
      await tx.insert(caseStepDocuments).values({
        caseStepId: step.id,
        docName: item.name,
        docNameEn: item.name_en,
        categoryId: item.category_id ?? null,
        isRequired: item.required ?? true,
        status: "missing"
      });
    }
  }

  return stepRows;
}

async function applyStepStatuses(
  tx: DbLike,
  caseId: string,
  caseItem: ImportCase,
  stepRows: (typeof caseSteps.$inferSelect)[],
  stats: Stats
) {
  const byOrder = new Map(stepRows.map((step) => [step.stepOrder, step]));

  for (const [stepOrderText, status] of Object.entries(caseItem.step_status)) {
    const stepOrder = Number(stepOrderText);
    const step = byOrder.get(stepOrder);
    if (!step) {
      stats.warnings += 1;
      console.warn(`    warning: step #${stepOrder} not found for ${caseItem.applicant}; status skipped`);
      continue;
    }

    await tx
      .update(caseSteps)
      .set({
        status,
        completedAt: status === "done" ? new Date() : null
      })
      .where(eq(caseSteps.id, step.id));
    stats.stepStatusesUpdated += 1;
    console.log(`    step status: #${stepOrder} -> ${status}`);
  }

  await tx.update(cases).set({ currentStep: caseItem.current_step, updatedAt: new Date() }).where(eq(cases.id, caseId));
  console.log(`    current step set: ${caseItem.current_step}`);
}

async function createCase(
  tx: DbLike,
  clientId: string,
  caseItem: ImportCase,
  parentCaseId: string | null,
  stats: Stats
): Promise<CreatedCase> {
  const existing = await findExistingCase(tx, clientId, caseItem.business_type);
  if (existing) {
    stats.casesSkipped += 1;
    console.log(`  case skipped: ${caseItem.applicant} ${caseItem.business_type} (${existing.id})`);
    return {
      caseId: existing.id,
      clientId: existing.clientId,
      businessType: existing.businessType,
      applicant: caseItem.applicant,
      skipped: true
    };
  }

  const { template, templateStepRows } = await selectTemplate(tx, caseItem.business_type, maxReferencedStep(caseItem), stats);
  console.log(`  case creating: ${caseItem.applicant} ${caseItem.business_type} with template ${template.name}`);

  const [caseRow] = await tx
    .insert(cases)
    .values({
      businessType: caseItem.business_type,
      parentCaseId,
      clientId,
      currentStep: 0,
      status: "in_progress"
    })
    .returning();

  if (!caseRow) {
    throw new Error(`case_create_failed: ${caseItem.applicant}`);
  }

  stats.casesCreated += 1;
  const stepRows = await cloneSteps(tx, caseRow.id, templateStepRows, stats);
  await applyStepStatuses(tx, caseRow.id, caseItem, stepRows, stats);

  return {
    caseId: caseRow.id,
    clientId: caseRow.clientId,
    businessType: caseRow.businessType,
    applicant: caseItem.applicant,
    skipped: false
  };
}

async function saveFileLikeUpload(
  tx: DbLike,
  sourcePath: string,
  originalFilename: string,
  stepId: string,
  clientId: string | null,
  stats: Stats
): Promise<SavedDocument> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const directory = join(uploadRoot, year, month);
  await mkdir(directory, { recursive: true });

  const storedFilename = `${randomUUID()}${extname(originalFilename)}`;
  const absolutePath = join(directory, storedFilename);
  const storagePath = posix.join("uploads", year, month, storedFilename);
  const fileStat = await stat(sourcePath);

  await copyFile(sourcePath, absolutePath);

  const [document] = await tx
    .insert(documents)
    .values({
      storagePath,
      filename: originalFilename,
      mime: getMime(originalFilename),
      size: fileStat.size,
      uploadedBy: null,
      subjectType: "case_step",
      subjectId: stepId,
      clientId,
      categoryId: null
    })
    .returning();

  if (!document) {
    throw new Error(`document_insert_failed: ${sourcePath}`);
  }

  stats.filesCopied += 1;
  console.log(`      copied: ${sourcePath} -> ${storagePath}`);
  return document;
}

async function findStepForDocument(tx: DbLike, caseId: string, stepOrder: number, label: string, stats: Stats) {
  const [step] = await tx
    .select()
    .from(caseSteps)
    .where(and(eq(caseSteps.caseId, caseId), eq(caseSteps.stepOrder, stepOrder)))
    .limit(1);

  if (!step) {
    stats.warnings += 1;
    console.warn(`      warning: step #${stepOrder} not found for ${label}; file skipped`);
    return null;
  }

  return step;
}

async function attachDocumentToStep(
  tx: DbLike,
  stepId: string,
  importDocument: ImportDocument,
  documentId: string,
  stats: Stats
) {
  const [createdSlot] = await tx
    .insert(caseStepDocuments)
    .values({
      caseStepId: stepId,
      docName: importDocument.file.split("/").pop() ?? importDocument.file,
      docNameEn: null,
      categoryId: null,
      isRequired: false,
      documentId,
      documentIds: [documentId],
      status: "uploaded"
    })
    .returning();

  if (!createdSlot) {
    throw new Error(`case_step_document_create_failed: ${stepId}`);
  }

  stats.documentSlotsCreated += 1;
  stats.filesLinked += 1;
  console.log(`      file slot created and linked: ${createdSlot.docName}`);
}

async function attachImportDocument(
  tx: DbLike,
  rootFolder: string,
  createdCase: CreatedCase,
  importDocument: ImportDocument,
  copiedFiles: Map<string, SavedDocument>,
  stats: Stats
) {
  const sourcePath = join(rootFolder, importDocument.file);

  try {
    await stat(sourcePath);
  } catch {
    stats.filesMissing += 1;
    stats.warnings += 1;
    console.warn(`      warning: missing file skipped: ${sourcePath}`);
    return;
  }

  const step = await findStepForDocument(tx, createdCase.caseId, importDocument.step, createdCase.applicant, stats);
  if (!step) {
    return;
  }

  const originalFilename = importDocument.file.split("/").pop() ?? importDocument.file;
  const document =
    copiedFiles.get(sourcePath) ??
    (await saveFileLikeUpload(tx, sourcePath, originalFilename, step.id, createdCase.clientId, stats));
  copiedFiles.set(sourcePath, document);

  await attachDocumentToStep(tx, step.id, importDocument, document.id, stats);
}

async function attachDocumentsForCase(
  tx: DbLike,
  rootFolder: string,
  createdCase: CreatedCase,
  documentsToAttach: ImportDocument[],
  copiedFiles: Map<string, SavedDocument>,
  stats: Stats
) {
  for (const importDocument of documentsToAttach) {
    console.log(`    file: ${importDocument.file} -> step ${importDocument.step}`);
    await attachImportDocument(tx, rootFolder, createdCase, importDocument, copiedFiles, stats);
  }
}

async function importClient(importClientData: ImportClient, epRoot: string, stats: Stats) {
  console.log(`client folder: ${importClientData.folder}`);
  const rootFolder = join(epRoot, importClientData.folder);
  const note = noteForImportClient(importClientData);
  const createdCases = new Map<string, CreatedCase>();
  const copiedFiles = new Map<string, SavedDocument>();

  await db.transaction(async (tx) => {
    const clientRowsByApplicant = new Map<string, typeof clients.$inferSelect>();

    for (const caseItem of importClientData.cases) {
      const clientRow = await ensureClient(tx, caseItem.applicant, note, stats);
      clientRowsByApplicant.set(caseItem.applicant, clientRow);
    }

    for (const caseItem of importClientData.cases) {
      const clientRow = clientRowsByApplicant.get(caseItem.applicant);
      if (!clientRow) {
        throw new Error(`client_missing_after_create: ${caseItem.applicant}`);
      }

      let parentCaseId: string | null = null;
      if (caseItem.business_type === "dp") {
        const parentApplicant = caseItem.parent_applicant ?? importClientData.primary_name;
        const parentClient = clientRowsByApplicant.get(parentApplicant) ?? (await findClientByName(tx, parentApplicant));
        if (!parentClient) {
          stats.warnings += 1;
          console.warn(`  warning: DP parent client not found for ${caseItem.applicant}: ${parentApplicant}`);
        } else {
          const parentCase = await findExistingCase(tx, parentClient.id, "ep");
          parentCaseId = parentCase?.id ?? createdCases.get(`${parentApplicant}:ep`)?.caseId ?? null;
          if (!parentCaseId) {
            stats.warnings += 1;
            console.warn(`  warning: DP parent EP case not found for ${caseItem.applicant}: ${parentApplicant}`);
          }
        }
      }

      const createdCase = await createCase(tx, clientRow.id, caseItem, parentCaseId, stats);
      createdCases.set(`${caseItem.applicant}:${caseItem.business_type}`, createdCase);

      if (!createdCase.skipped) {
        await attachDocumentsForCase(tx, rootFolder, createdCase, caseItem.documents ?? [], copiedFiles, stats);
      }
    }

    const epCasesForShared = [...createdCases.values()].filter(
      (caseRow) => caseRow.businessType === "ep" && !caseRow.skipped
    );
    for (const sharedDocument of importClientData.shared_documents ?? []) {
      for (const epCase of epCasesForShared) {
        console.log(`    shared file: ${sharedDocument.file} -> ${epCase.applicant} step ${sharedDocument.step}`);
        await attachImportDocument(tx, rootFolder, epCase, sharedDocument, copiedFiles, stats);
      }
    }
  });
}

function uploadStoragePathToAbsolute(storagePath: string): string {
  const prefix = "uploads/";
  if (storagePath === "uploads") {
    return uploadRoot;
  }
  if (storagePath.startsWith(prefix)) {
    return join(uploadRoot, storagePath.slice(prefix.length));
  }
  return join(dirname(uploadRoot), storagePath);
}

async function purgeApplicant(
  tx: DbLike,
  name: string,
  dryRun: boolean,
  stats: Stats
): Promise<string[]> {
  const clientRow = await findClientByName(tx, name);
  if (!clientRow) {
    console.log(`  purge skipped: client not found: ${name}`);
    return [];
  }

  const rootCaseRows = await tx
    .select()
    .from(cases)
    .where(and(eq(cases.clientId, clientRow.id), inArray(cases.businessType, ["ep", "dp"])))
    .orderBy(asc(cases.createdAt));

  if (rootCaseRows.length === 0) {
    console.log(`  purge skipped: no EP/DP cases for ${name} (${clientRow.id})`);
    return [];
  }

  const caseRows = [...rootCaseRows];
  const seenCaseIds = new Set(caseRows.map((caseRow) => caseRow.id));
  let frontierIds = [...seenCaseIds];

  while (frontierIds.length > 0) {
    const childCaseRows = await tx
      .select()
      .from(cases)
      .where(and(inArray(cases.parentCaseId, frontierIds), inArray(cases.businessType, ["ep", "dp"])))
      .orderBy(asc(cases.createdAt));

    const nextFrontierIds: string[] = [];
    for (const caseRow of childCaseRows) {
      if (seenCaseIds.has(caseRow.id)) {
        continue;
      }
      seenCaseIds.add(caseRow.id);
      caseRows.push(caseRow);
      nextFrontierIds.push(caseRow.id);
    }
    frontierIds = nextFrontierIds;
  }

  console.log(`  purge client: ${name} (${clientRow.id}) cases=${caseRows.length}`);
  const caseIds = caseRows.map((caseRow) => caseRow.id);
  const affectedClientIds = [...new Set(caseRows.map((caseRow) => caseRow.clientId).filter((id): id is string => Boolean(id)))];
  const stepRows = await tx.select().from(caseSteps).where(inArray(caseSteps.caseId, caseIds));
  const stepIds = stepRows.map((step) => step.id);

  const slotRows =
    stepIds.length === 0
      ? []
      : await tx.select().from(caseStepDocuments).where(inArray(caseStepDocuments.caseStepId, stepIds));
  const linkedDocumentIds = slotRows.flatMap(getDocumentIds);
  const subjectDocumentRows =
    stepIds.length === 0
      ? []
      : await tx.select().from(documents).where(inArray(documents.subjectId, stepIds));
  const documentIds = [...new Set([...linkedDocumentIds, ...subjectDocumentRows.map((document) => document.id)])];
  const documentRows =
    documentIds.length === 0
      ? []
      : await tx.select().from(documents).where(inArray(documents.id, documentIds));
  const storagePaths = [...new Set(documentRows.map((document) => document.storagePath))];

  console.log(
    `    purge plan: cases=${caseRows.length}, steps=${stepRows.length}, slots=${slotRows.length}, documents=${documentRows.length}, files=${storagePaths.length}`
  );
  for (const caseRow of caseRows) {
    console.log(`    case: ${caseRow.businessType} ${caseRow.id}`);
  }

  stats.casesPurged += caseRows.length;
  stats.stepsPurged += stepRows.length;
  stats.documentSlotsPurged += slotRows.length;
  stats.documentsPurged += documentRows.length;

  if (dryRun) {
    const purgedCaseIds = new Set(caseIds);
    for (const affectedClientId of affectedClientIds) {
      const allClientCases = await tx.select({ id: cases.id }).from(cases).where(eq(cases.clientId, affectedClientId));
      if (allClientCases.length > 0 && allClientCases.every((caseRow) => purgedCaseIds.has(caseRow.id))) {
        stats.clientsPurged += 1;
      }
    }
    return storagePaths;
  }

  if (stepIds.length > 0) {
    await tx.delete(caseStepDocuments).where(inArray(caseStepDocuments.caseStepId, stepIds));
  }
  if (documentIds.length > 0) {
    await tx.delete(documents).where(inArray(documents.id, documentIds));
  }
  if (stepIds.length > 0) {
    await tx.delete(caseSteps).where(inArray(caseSteps.id, stepIds));
  }
  await tx.delete(cases).where(inArray(cases.id, caseIds));

  for (const affectedClientId of affectedClientIds) {
    const [remainingCase] = await tx.select({ id: cases.id }).from(cases).where(eq(cases.clientId, affectedClientId)).limit(1);
    if (!remainingCase) {
      const [deletedClient] = await tx
        .delete(clients)
        .where(eq(clients.id, affectedClientId))
        .returning({ name: clients.name });
      if (deletedClient) {
        stats.clientsPurged += 1;
        console.log(`    client deleted: ${deletedClient.name}`);
      }
    } else if (affectedClientId === clientRow.id) {
      console.log(`    client kept: ${name} still has other cases`);
    }
  }

  return storagePaths;
}

async function unlinkPurgedFiles(storagePaths: string[], stats: Stats) {
  for (const storagePath of storagePaths) {
    const absolutePath = uploadStoragePathToAbsolute(storagePath);
    try {
      await unlink(absolutePath);
      stats.filesUnlinked += 1;
      console.log(`  file unlinked: ${absolutePath}`);
    } catch (error) {
      stats.warnings += 1;
      console.warn(`  warning: failed to unlink ${absolutePath}`);
      console.warn(error);
    }
  }
}

async function purgeData(data: ImportData, dryRun: boolean, stats: Stats) {
  const names = applicantNames(data);
  console.log(`Purge applicants: ${names.join(", ")}`);
  const storagePaths: string[] = [];

  await db.transaction(async (tx) => {
    for (const name of names) {
      storagePaths.push(...(await purgeApplicant(tx, name, dryRun, stats)));
    }
  });

  const uniqueStoragePaths = [...new Set(storagePaths)];
  if (dryRun) {
    console.log(`dry-run: would unlink ${uniqueStoragePaths.length} files`);
    for (const storagePath of uniqueStoragePaths) {
      console.log(`  would unlink: ${uploadStoragePathToAbsolute(storagePath)}`);
    }
    return;
  }

  await unlinkPurgedFiles(uniqueStoragePaths, stats);
}

function countDryRun(data: ImportData, stats: Stats) {
  for (const importClientData of data.clients) {
    console.log(`client folder: ${importClientData.folder}`);
    const casesCount = importClientData.cases.length;
    const caseFiles = importClientData.cases.reduce((sum, caseItem) => sum + (caseItem.documents?.length ?? 0), 0);
    const sharedFiles = (importClientData.shared_documents?.length ?? 0) * importClientData.cases.filter((c) => c.business_type === "ep").length;
    console.log(
      `  would process: clients=${casesCount}, cases=${casesCount}, caseFiles=${caseFiles}, sharedLinks=${sharedFiles}`
    );
    stats.clientsCreated += casesCount;
    stats.casesCreated += casesCount;
    stats.filesLinked += caseFiles + sharedFiles;
  }
}

function printStats(label: string, stats: Stats) {
  console.log(
    `${label}: clientsCreated=${stats.clientsCreated}, clientsReused=${stats.clientsReused}, casesCreated=${stats.casesCreated}, casesSkipped=${stats.casesSkipped}, stepsCreated=${stats.stepsCreated}, stepStatusesUpdated=${stats.stepStatusesUpdated}, documentSlotsCreated=${stats.documentSlotsCreated}, filesCopied=${stats.filesCopied}, filesLinked=${stats.filesLinked}, filesMissing=${stats.filesMissing}, casesPurged=${stats.casesPurged}, stepsPurged=${stats.stepsPurged}, documentSlotsPurged=${stats.documentSlotsPurged}, documentsPurged=${stats.documentsPurged}, filesUnlinked=${stats.filesUnlinked}, clientsPurged=${stats.clientsPurged}, warnings=${stats.warnings}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = await loadImportData(args.dataPath);
  const stats: Stats = {
    clientsCreated: 0,
    clientsReused: 0,
    casesCreated: 0,
    casesSkipped: 0,
    stepsCreated: 0,
    stepStatusesUpdated: 0,
    documentSlotsCreated: 0,
    filesCopied: 0,
    filesLinked: 0,
    filesMissing: 0,
    casesPurged: 0,
    stepsPurged: 0,
    documentSlotsPurged: 0,
    documentsPurged: 0,
    filesUnlinked: 0,
    clientsPurged: 0,
    warnings: 0
  };

  console.log(`EP import data: ${args.dataPath}`);
  console.log(`EP root: ${data.ep_root}`);

  if (args.purge) {
    console.log(args.dryRun ? "Mode: purge dry-run (no database writes, no file unlinks)" : "Mode: purge");
    await purgeData(data, args.dryRun, stats);
    printStats(args.dryRun ? "purge dry-run summary" : "purge summary", stats);
    return;
  }

  if (args.dryRun) {
    console.log("Mode: dry-run (no database writes, no file copies)");
    countDryRun(data, stats);
    printStats("dry-run summary", stats);
    return;
  }

  for (const importClientData of data.clients) {
    try {
      await importClient(importClientData, data.ep_root, stats);
    } catch (error) {
      stats.warnings += 1;
      console.error(`client failed and rolled back: ${importClientData.folder}`);
      console.error(error);
    }
  }

  printStats("summary", stats);
}

try {
  await main();
} finally {
  await pool.end();
}
