# ICA 申诉资料批量录入 + 再申请提醒 + 担保人统计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `~/ae` 下约 90+ ICA 申诉客户的资料(2120 文件)批量录入 dev 系统 `/business/ica`，并新增「再申请倒计时」和「担保人统计」两个视图。

**Architecture:** 一客户一案件 + 多条 `case_submission`(每轮申诉一条)。确定性脚本 `importIcaClients.ts`(仿 `importEpClients.ts`)机械导入所有文件，文件名正则归槽、兜底不丢。只读子 agent 分批抽取 pass 读 ICA 拒信 PDF(拒绝日期)+ 担保人材料(担保人身份)，回小 JSON，再由 `backfillIcaExtraction.ts` 去重写库。两个前端功能的纯逻辑放 `packages/shared` 用 vitest TDD，再接 API + Mantine 前端。**零数据库迁移**(复用既有 `case_submissions`/`guarantors`/`cases.guarantor_id`)。

**Tech Stack:** React 18 + Mantine 7(apps/web)、Fastify + Drizzle(apps/api)、PostgreSQL `businesshub_dev`、tsx 跑脚本、vitest(packages/shared)。

**铁律:** 全程只动 `~/project/businessHub-dev`，写 dev 库 `businesshub_dev`，在 `dev-bh.youjia.sg` 验证。确认 OK 后才按 `docs/runbooks/deploy-pitfalls.md` 发 prod。脚本从 `apps/api` 目录跑(dotenv 读 `../../.env`)。

**关键既有代码(照抄/复用):**
- 导入范本: `apps/api/src/scripts/importEpClients.ts`(DB 单例、`saveFileLikeUpload`:431-474、`cloneSteps`:307-345、`attachDocumentToStep`:492-520、`attachImportDocument`:522-553、`getMime`:182-196、`parseArgs`:113-141、`main` 收尾:1156-1160)
- 模板范本: `apps/api/src/scripts/applyEpTemplateMaterials.ts`(更新既有模板 requiredDocuments 的范式)
- DB 单例: `packages/db/src/index.ts`(`import { db, pool } from "@bh/db"`)
- 上传落盘规则: `apps/api/src/lib/files.ts`(`uploads/YYYY/MM/uuid.ext`)
- ICA 模板 seed(已存在,7 步): `packages/db/src/seed.ts:370-415`
- cases 列表 API: `apps/api/src/routes/cases.ts` GET /cases :228-260、`serializeCase`:37-53、submissions 查询范式:331-335
- 担保人 API: `apps/api/src/routes/guarantors.ts`(`sponsoredCount`:66-73、GET /guarantors:78-88)
- CasesPage: `apps/web/src/pages/business/CasesPage.tsx`(表头:224-233、行:252-280、筛选 state:98-99、useQuery:104-112、cases 派生:135)
- GuarantorsPage: `apps/web/src/pages/business/GuarantorsPage.tsx`(表头:257-266、行:286-314)
- 前端 api client: `apps/web/src/api/cases.ts`(`Case` 类型:64-78、`Guarantor`:80-91、`listCases`:294-320、`listGuarantors`:185)

---

## Phase 1 — ICA 文件槽模板补齐

### Task 1: 扩充 ICA 模板的标准文件槽

**Files:**
- Modify: `packages/db/src/seed.ts:370-415`(ICA 模板 seed 的 `requiredDocuments`)
- Create: `apps/api/src/scripts/applyIcaTemplate.ts`(把更新推到已存在的 dev 模板)

ICA 模板已存在于 dev 库，seed 幂等(已存在不重插)，所以改 seed 后需要一个脚本把新槽 UPSERT 进既有 `template_steps`。

- [ ] **Step 1: 改 seed.ts 的 ICA 模板 requiredDocuments**

在 `seed.ts:370-415` 的 ICA 模板(`businessType:"ica", name:"ICA 申诉"`)里，把 7 步的 `requiredDocuments` 改成下表(文件槽分布到对应步骤；`required` 见 spec B 表)。每项形如 `{ name, name_en, required }`(ICA 模板不带 `category_id`，保持现状)：

```ts
// 步骤2 搜集资料:
requiredDocuments: [
  { name: "护照", name_en: "Passport", required: true },
  { name: "身份证/NRIC", name_en: "ID Card", required: true },
  { name: "户口本", name_en: "Household Register", required: false },
  { name: "在职证明", name_en: "Incumbency Certificate", required: false },
  { name: "新加坡酒店证明", name_en: "Hotel Proof", required: false },
  { name: "ICA 拒信", name_en: "ICA Rejection Letter", required: false },
  { name: "其他/证据材料", name_en: "Supporting Evidence", required: false }
]
// 步骤3 写申诉信:
requiredDocuments: [{ name: "申诉信", name_en: "Appeal Letter", required: true }]
// 步骤4 填表格:
requiredDocuments: [{ name: "Form 14", name_en: "Form 14", required: true }]
// 步骤5 选担保人:
requiredDocuments: [{ name: "担保人材料", name_en: "Guarantor Documents", required: true }]
// 步骤1/6/7 保持原样(签约合同 / 无文件 / 无文件)
```

- [ ] **Step 2: 写 applyIcaTemplate.ts**

仿 `applyEpTemplateMaterials.ts` 结构。读 ICA 模板 → 对每个 `template_steps` 行，把上面对应步骤的 `requiredDocuments` 数组 `update` 进去(按 `stepOrder` 匹配)。从 seed 里 import 同一份数组避免重复定义——把 ICA 的 `requiredDocuments` 抽成 seed.ts 导出的常量 `icaTemplateSteps`，脚本和 seed 都引用它(DRY)。

```ts
import { db, pool, workflowTemplates, templateSteps } from "@bh/db";
import { eq, and } from "drizzle-orm";
import { icaTemplateSteps } from "@bh/db/seed"; // 或相对路径导出

async function main() {
  const [tpl] = await db.select().from(workflowTemplates)
    .where(and(eq(workflowTemplates.businessType, "ica"), eq(workflowTemplates.name, "ICA 申诉")));
  if (!tpl) throw new Error("ICA 模板不存在，先跑 seed");
  for (const step of icaTemplateSteps) {
    await db.update(templateSteps)
      .set({ requiredDocuments: step.requiredDocuments })
      .where(and(eq(templateSteps.templateId, tpl.id), eq(templateSteps.stepOrder, step.stepOrder)));
  }
  console.log("ICA 模板文件槽已更新");
}
main().finally(() => pool.end());
```

- [ ] **Step 3: 跑脚本，验证 dev 库模板已更新**

Run:
```bash
cd /home/john/project/businessHub-dev/apps/api
pnpm tsx src/scripts/applyIcaTemplate.ts
```
Expected: 打印 "ICA 模板文件槽已更新"，无报错。

- [ ] **Step 4: 验证**

Run(确认 template_steps 里 ICA 步骤 2 现在有 7 个槽):
```bash
cd /home/john/project/businessHub-dev/apps/api
pnpm tsx -e "import {db,pool,workflowTemplates,templateSteps} from '@bh/db'; import {eq,and} from 'drizzle-orm'; const [t]=await db.select().from(workflowTemplates).where(and(eq(workflowTemplates.businessType,'ica'),eq(workflowTemplates.name,'ICA 申诉'))); const s=await db.select().from(templateSteps).where(eq(templateSteps.templateId,t.id)); console.log(s.map(x=>[x.stepOrder,(x.requiredDocuments||[]).length])); await pool.end();"
```
Expected: 打印各步槽数，步骤 2 显示 7。

- [ ] **Step 5: Commit**

```bash
cd /home/john/project/businessHub-dev
git add packages/db/src/seed.ts apps/api/src/scripts/applyIcaTemplate.ts
git commit -m "feat(ica): 扩充 ICA 工作流模板标准文件槽 + applyIcaTemplate 脚本"
```

---

## Phase 2 — 再申请倒计时(纯逻辑 → API → 前端)

### Task 2: 再申请状态纯函数 + 单测

**Files:**
- Create: `packages/shared/src/reapply.ts`
- Test: `packages/shared/src/reapply.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/reapply.test.ts
import { describe, it, expect } from "vitest";
import { computeReapplyStatus, REAPPLY_WAIT_MONTHS } from "./reapply";

const now = new Date("2026-06-29T00:00:00Z");

describe("computeReapplyStatus", () => {
  it("无提交记录 → pending", () => {
    expect(computeReapplyStatus([], now)).toEqual({ state: "pending", eligibleAt: null, daysRemaining: null });
  });
  it("最新 approved → approved", () => {
    const r = computeReapplyStatus([
      { result: "rejected", rejectedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
      { result: "approved", rejectedAt: null, createdAt: "2026-05-01T00:00:00Z" }
    ], now);
    expect(r.state).toBe("approved");
  });
  it("最新 pending → pending", () => {
    expect(computeReapplyStatus([{ result: "pending", rejectedAt: null, createdAt: "2026-06-01T00:00:00Z" }], now).state).toBe("pending");
  });
  it("最新 rejected 但无拒绝日期 → rejected_no_date", () => {
    expect(computeReapplyStatus([{ result: "rejected", rejectedAt: null, createdAt: "2026-06-01T00:00:00Z" }], now).state).toBe("rejected_no_date");
  });
  it("rejected 拒绝日期+3月在未来 → waiting，daysRemaining>0", () => {
    const r = computeReapplyStatus([{ result: "rejected", rejectedAt: "2026-06-01T00:00:00Z", createdAt: "2026-06-01T00:00:00Z" }], now);
    expect(r.state).toBe("waiting");
    expect(r.eligibleAt).toBe(new Date("2026-09-01T00:00:00Z").toISOString());
    expect(r.daysRemaining).toBeGreaterThan(0);
  });
  it("rejected 拒绝日期+3月已过 → eligible，daysRemaining<=0", () => {
    const r = computeReapplyStatus([{ result: "rejected", rejectedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }], now);
    expect(r.state).toBe("eligible");
    expect(r.daysRemaining).toBeLessThanOrEqual(0);
  });
  it("多条取最新一条(按 createdAt 倒序)", () => {
    const r = computeReapplyStatus([
      { result: "rejected", rejectedAt: "2025-10-01T00:00:00Z", createdAt: "2025-10-01T00:00:00Z" },
      { result: "rejected", rejectedAt: "2026-06-01T00:00:00Z", createdAt: "2026-06-01T00:00:00Z" }
    ], now);
    expect(r.eligibleAt).toBe(new Date("2026-09-01T00:00:00Z").toISOString());
  });
  it("常量为 3", () => { expect(REAPPLY_WAIT_MONTHS).toBe(3); });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/john/project/businessHub-dev/packages/shared && pnpm vitest run src/reapply.test.ts`
Expected: FAIL，"Cannot find module './reapply'"

- [ ] **Step 3: 写实现**

```ts
// packages/shared/src/reapply.ts
export const REAPPLY_WAIT_MONTHS = 3;

export type ReapplyState = "approved" | "pending" | "eligible" | "waiting" | "rejected_no_date";

export interface ReapplySubmissionInput {
  result: "pending" | "approved" | "rejected";
  rejectedAt: string | null;
  createdAt: string;
}

export interface ReapplyStatus {
  state: ReapplyState;
  eligibleAt: string | null;
  daysRemaining: number | null;
}

export function computeReapplyStatus(submissions: ReapplySubmissionInput[], now: Date): ReapplyStatus {
  if (submissions.length === 0) return { state: "pending", eligibleAt: null, daysRemaining: null };
  const latest = [...submissions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latest.result === "approved") return { state: "approved", eligibleAt: null, daysRemaining: null };
  if (latest.result === "pending") return { state: "pending", eligibleAt: null, daysRemaining: null };
  if (!latest.rejectedAt) return { state: "rejected_no_date", eligibleAt: null, daysRemaining: null };
  const eligible = new Date(latest.rejectedAt);
  eligible.setMonth(eligible.getMonth() + REAPPLY_WAIT_MONTHS);
  const daysRemaining = Math.ceil((eligible.getTime() - now.getTime()) / 86_400_000);
  return { state: daysRemaining > 0 ? "waiting" : "eligible", eligibleAt: eligible.toISOString(), daysRemaining };
}
```

- [ ] **Step 4: 跑测试确认通过 + 导出**

把 `export * from "./reapply";` 加到 `packages/shared/src/index.ts`(按该文件现有导出风格)。
Run: `cd /home/john/project/businessHub-dev/packages/shared && pnpm vitest run src/reapply.test.ts`
Expected: PASS(8 个用例)

- [ ] **Step 5: Commit**

```bash
cd /home/john/project/businessHub-dev
git add packages/shared/src/reapply.ts packages/shared/src/reapply.test.ts packages/shared/src/index.ts
git commit -m "feat(ica): 再申请状态计算 computeReapplyStatus + 单测"
```

### Task 3: GET /cases 带上最新拒绝日期

**Files:**
- Modify: `apps/api/src/routes/cases.ts:228-260`(GET /cases handler)、`serializeCase`:37-53
- Modify: `apps/web/src/api/cases.ts:64-78`(`Case` 类型加字段)

- [ ] **Step 1: 在 GET /cases 批量补 submissions**

在 handler 取到 `rows` 后(:~250)，批量查这些 case 的 submissions 并按 case 算"最新一条 rejected 的 rejectedAt"。`caseSubmissions` 已在文件顶部 import(:4)，`inArray` 从 drizzle import：

```ts
// GET /cases handler，rows 拿到后:
const caseIds = rows.map((r) => r.id);
const subs = caseIds.length
  ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, caseIds))
  : [];
const byCase = new Map<string, typeof subs>();
for (const s of subs) {
  const arr = byCase.get(s.caseId) ?? [];
  arr.push(s);
  byCase.set(s.caseId, arr);
}
return {
  cases: rows.map((r) => {
    const list = (byCase.get(r.id) ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = list[0] ?? null;
    return {
      ...serializeCase(r),
      latest_result: latest?.result ?? null,
      latest_rejected_at: latest && latest.result === "rejected" ? (latest.rejectedAt?.toISOString() ?? null) : null,
      latest_submission_at: latest?.createdAt.toISOString() ?? null
    };
  })
};
```

确认顶部 import 含 `inArray`(若无则加到现有 `drizzle-orm` import 行)。

- [ ] **Step 2: 扩前端 Case 类型**

`apps/web/src/api/cases.ts:64-78` 的 `Case` interface 末尾加：
```ts
  latest_result?: "pending" | "approved" | "rejected" | null;
  latest_rejected_at?: string | null;
  latest_submission_at?: string | null;
```

- [ ] **Step 3: 验证 API**

Run(确保 dev API 在跑；用任一已存在 ICA case 验证返回新字段):
```bash
curl -s "http://localhost:PORT/cases?business_type=ica" | head -c 600
```
Expected: JSON 里每个 case 含 `latest_result` / `latest_rejected_at` 字段(导入前可能为 null，正常)。
> 注：端口/鉴权按本仓库 dev 起服方式；若需登录态用现有 dev 调试方式。此步可在 Phase 4 导入后数据更直观时再回看。

- [ ] **Step 4: Commit**

```bash
cd /home/john/project/businessHub-dev
git add apps/api/src/routes/cases.ts apps/web/src/api/cases.ts
git commit -m "feat(ica): GET /cases 返回最新提交结果与拒绝日期"
```

### Task 4: CasesPage 倒计时徽章 + 待再申请筛选

**Files:**
- Modify: `apps/web/src/pages/business/CasesPage.tsx`(表头 224-233、行 252-280、筛选 199-220、cases 派生 135、colSpan 237/245)

- [ ] **Step 1: 加再申请徽章渲染辅助**

在 `statusColor`(:70-81)附近加一个组件/函数，用 `computeReapplyStatus`(从 `@bh/shared` import)。仅 ICA 显示(`businessType === "ica"`)：

```tsx
import { computeReapplyStatus } from "@bh/shared";

function ReapplyBadge({ caseItem }: { caseItem: Case }) {
  const status = computeReapplyStatus(
    caseItem.latest_result
      ? [{ result: caseItem.latest_result, rejectedAt: caseItem.latest_rejected_at ?? null, createdAt: caseItem.latest_submission_at ?? caseItem.created_at }]
      : [],
    new Date()
  );
  if (status.state === "approved") return <Badge color="green" variant="light">已通过</Badge>;
  if (status.state === "pending") return <Badge color="blue" variant="light">等待结果</Badge>;
  if (status.state === "rejected_no_date") return <Badge color="gray" variant="light">拒绝日期待补</Badge>;
  if (status.state === "eligible") return <Badge color="green" variant="light">✅ 可再申请</Badge>;
  const d = status.daysRemaining ?? 0;
  return <Badge color={d <= 14 ? "red" : d <= 30 ? "yellow" : "gray"} variant="light">还差 {d} 天可再申请</Badge>;
}
```

- [ ] **Step 2: 表格加列(仅 ICA)**

表头(:224-233)在 status 列后插：`{businessType === "ica" && <Table.Th>再申请</Table.Th>}`。
行(:260-264 status `<Table.Td>` 后)插：`{businessType === "ica" && <Table.Td><ReapplyBadge caseItem={caseItem} /></Table.Td>}`。
colSpan：:237 和 :245 的 `colSpan={6}` 改为 `colSpan={businessType === "ica" ? 7 : 6}`。

- [ ] **Step 3: 加「待再申请」筛选**

筛选区(:199-220)加一个开关(Mantine `Checkbox` 或 `SegmentedControl`)`onlyReapply`，state 仿 :98-99。在 cases 派生(:135)后做前端过滤：
```tsx
const cases = (casesQuery.data?.cases ?? []).filter((c) => {
  if (!onlyReapply) return true;
  const s = computeReapplyStatus(c.latest_result ? [{ result: c.latest_result, rejectedAt: c.latest_rejected_at ?? null, createdAt: c.latest_submission_at ?? c.created_at }] : [], new Date());
  return s.state === "eligible" || s.state === "waiting";
});
```
可选：把 `onlyReapply` 为真时按 `daysRemaining` 升序排(到期的排前)。

- [ ] **Step 4: 手动验证**

Run: 起 dev web，打开 `/business/ica` cases tab。
Expected: ICA 列表多出「再申请」列；勾「待再申请」只剩 rejected 且有日期的；徽章按剩余天数变色。(导入前列表可能为空——可在 Phase 4 后回看，此处先确认编译通过、无运行时报错。)
Run 编译检查: `cd /home/john/project/businessHub-dev/apps/web && pnpm tsc --noEmit`(或本仓库前端类型检查命令)
Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
cd /home/john/project/businessHub-dev
git add apps/web/src/pages/business/CasesPage.tsx
git commit -m "feat(ica): 案件列表再申请倒计时徽章 + 待再申请筛选"
```

---

## Phase 3 — 担保人统计

### Task 5: 担保人统计纯函数 + 单测，接 API

**Files:**
- Create: `packages/shared/src/guarantorStats.ts`
- Test: `packages/shared/src/guarantorStats.test.ts`
- Modify: `apps/api/src/routes/guarantors.ts`(import caseSubmissions；GET /guarantors 带统计 或 新增 GET /guarantors/stats)
- Modify: `apps/web/src/api/cases.ts:80-91`(`Guarantor` 类型加字段)

成功率口径(已确认)：以**客户(case)最终结果**为单位 —— 一个 case 取其最新一条 submission 的 result；approved 计成功，rejected 计失败，pending 不计入分母。

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/guarantorStats.test.ts
import { describe, it, expect } from "vitest";
import { computeGuarantorStats } from "./guarantorStats";

describe("computeGuarantorStats", () => {
  const cases = [
    { caseId: "c1", createdAt: "2026-01-01T00:00:00Z", latestResult: "approved" as const },
    { caseId: "c2", createdAt: "2026-03-01T00:00:00Z", latestResult: "rejected" as const },
    { caseId: "c3", createdAt: "2026-05-01T00:00:00Z", latestResult: "pending" as const }
  ];
  it("案件数=全部", () => { expect(computeGuarantorStats(cases).total).toBe(3); });
  it("成功率=通过/(通过+拒绝)，pending 不计", () => {
    expect(computeGuarantorStats(cases).successRate).toBeCloseTo(0.5);
  });
  it("担保时间取最早/最近 createdAt", () => {
    const s = computeGuarantorStats(cases);
    expect(s.firstAt).toBe("2026-01-01T00:00:00Z");
    expect(s.lastAt).toBe("2026-05-01T00:00:00Z");
  });
  it("无可判定(全 pending) successRate 为 null", () => {
    expect(computeGuarantorStats([{ caseId: "x", createdAt: "2026-01-01T00:00:00Z", latestResult: "pending" }]).successRate).toBeNull();
  });
  it("空 → total 0, successRate null", () => {
    const s = computeGuarantorStats([]);
    expect(s.total).toBe(0); expect(s.successRate).toBeNull(); expect(s.firstAt).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/john/project/businessHub-dev/packages/shared && pnpm vitest run src/guarantorStats.test.ts`
Expected: FAIL，"Cannot find module './guarantorStats'"

- [ ] **Step 3: 写实现**

```ts
// packages/shared/src/guarantorStats.ts
export interface GuarantorCaseInput {
  caseId: string;
  createdAt: string;
  latestResult: "pending" | "approved" | "rejected" | null;
}
export interface GuarantorStats {
  total: number;
  approved: number;
  rejected: number;
  successRate: number | null;
  firstAt: string | null;
  lastAt: string | null;
}
export function computeGuarantorStats(cases: GuarantorCaseInput[]): GuarantorStats {
  const total = cases.length;
  const approved = cases.filter((c) => c.latestResult === "approved").length;
  const rejected = cases.filter((c) => c.latestResult === "rejected").length;
  const decided = approved + rejected;
  const dates = cases.map((c) => c.createdAt).sort();
  return {
    total, approved, rejected,
    successRate: decided === 0 ? null : approved / decided,
    firstAt: dates[0] ?? null,
    lastAt: dates[dates.length - 1] ?? null
  };
}
```

- [ ] **Step 4: 跑测试确认通过 + 导出**

`export * from "./guarantorStats";` 加到 `packages/shared/src/index.ts`。
Run: `cd /home/john/project/businessHub-dev/packages/shared && pnpm vitest run src/guarantorStats.test.ts`
Expected: PASS(5 个用例)

- [ ] **Step 5: API 带担保人统计**

`apps/api/src/routes/guarantors.ts`：顶部 import 加 `caseSubmissions` 和 `inArray`、`computeGuarantorStats`(从 `@bh/shared`)。在 GET /guarantors(:78-88) 把现有逐行 `sponsoredCount` 升级为带统计：拉该担保人所有 cases + 这些 case 的 submissions(内存聚合，担保人量级小，与现有 `Promise.all` 风格一致)：

```ts
// 替换/扩展 GET /guarantors 行渲染:
const rows = await db.select().from(guarantors);
const result = await Promise.all(rows.map(async (g) => {
  const caseRows = await db.select().from(cases).where(eq(cases.guarantorId, g.id));
  const ids = caseRows.map((c) => c.id);
  const subs = ids.length ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, ids)) : [];
  const latestByCase = new Map<string, string | null>();
  for (const c of caseRows) {
    const list = subs.filter((s) => s.caseId === c.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    latestByCase.set(c.id, list[0]?.result ?? null);
  }
  const stats = computeGuarantorStats(caseRows.map((c) => ({
    caseId: c.id, createdAt: c.createdAt.toISOString(), latestResult: latestByCase.get(c.id) ?? null
  })));
  return { ...serializeGuarantor(g), sponsored_count: stats.total, stats };
}));
return { guarantors: result };
```
(若无 `serializeGuarantor`，沿用现有 GET /guarantors 的序列化方式，仅追加 `stats`。)

- [ ] **Step 6: 扩前端 Guarantor 类型**

`apps/web/src/api/cases.ts:80-91` 的 `Guarantor` 加：
```ts
  stats?: { total: number; approved: number; rejected: number; successRate: number | null; firstAt: string | null; lastAt: string | null };
```

- [ ] **Step 7: Commit**

```bash
cd /home/john/project/businessHub-dev
git add packages/shared/src/guarantorStats.ts packages/shared/src/guarantorStats.test.ts packages/shared/src/index.ts apps/api/src/routes/guarantors.ts apps/web/src/api/cases.ts
git commit -m "feat(ica): 担保人统计 computeGuarantorStats + GET /guarantors 带担保数/成功率"
```

### Task 6: GuarantorsPage 显示担保时间 + 成功率

**Files:**
- Modify: `apps/web/src/pages/business/GuarantorsPage.tsx`(表头 257-266、行 286-314)

- [ ] **Step 1: 表头加列**

在 `sponsoredCount` 列(:263)后加两列：`<Table.Th>担保时间</Table.Th>` `<Table.Th>成功率</Table.Th>`。

- [ ] **Step 2: 行渲染加单元格**

行(:286-314)对应位置加：
```tsx
<Table.Td>
  {guarantor.stats?.firstAt
    ? `${guarantor.stats.firstAt.slice(0, 7)} ~ ${(guarantor.stats.lastAt ?? "").slice(0, 7)}`
    : "—"}
</Table.Td>
<Table.Td>
  {guarantor.stats && guarantor.stats.successRate !== null
    ? <Badge color={guarantor.stats.successRate >= 0.5 ? "green" : "orange"} variant="light">
        {Math.round(guarantor.stats.successRate * 100)}% ({guarantor.stats.approved}/{guarantor.stats.approved + guarantor.stats.rejected})
      </Badge>
    : <Badge color="gray" variant="light">无判定</Badge>}
</Table.Td>
```

- [ ] **Step 3: 编译 + 手动验证**

Run: `cd /home/john/project/businessHub-dev/apps/web && pnpm tsc --noEmit`
Expected: 无类型错误。打开 ICA → templates tab → 担保人，看到「担保时间 / 成功率」两列(导入前数据可能空)。

- [ ] **Step 4: Commit**

```bash
cd /home/john/project/businessHub-dev
git add apps/web/src/pages/business/GuarantorsPage.tsx
git commit -m "feat(ica): 担保人列表显示担保时间与成功率"
```

---

## Phase 4 — 批量导入脚本

### Task 7: 解析/归类纯函数 + 单测

**Files:**
- Create: `apps/api/src/scripts/ica/parse.ts`
- Test: `packages/shared/src/icaParse.test.ts`(放 shared 以复用 vitest；或在 apps/api 配 vitest——优先放 shared，把纯函数定义在 shared)

为可测，纯解析函数放 `packages/shared/src/icaImport.ts`，脚本 import 它。

- [ ] **Step 1: 写失败测试**

```ts
// packages/shared/src/icaImport.test.ts
import { describe, it, expect } from "vitest";
import { normalizeStatus, parseCaseFolderName, classifyFile, clientDedupKey } from "./icaImport";

describe("normalizeStatus", () => {
  it.each([
    ["APPROVED", "approved"], ["APPROVED_", "approved"], ["GRANTED", "approved"],
    ["REJECTED", "rejected"], ["REJECT_", "rejected"], ["Rejected-", "rejected"],
    ["PENDING", "pending"], ["pending", "pending"], ["- p", "pending"], ["", "pending"]
  ])("%s → %s", (input, expected) => expect(normalizeStatus(input)).toBe(expected));
});

describe("parseCaseFolderName", () => {
  it("解析 状态/姓名/AppealID/经办人", () => {
    expect(parseCaseFolderName("REJECTED - DONG YIWEN - ISC2603AM000466 -TAN")).toEqual({
      status: "rejected", name: "DONG YIWEN", appealId: "ISC2603AM000466", owner: "TAN", round: null
    });
  });
  it("带申诉轮次", () => {
    const r = parseCaseFolderName("Hu Yajun-2nd appeal");
    expect(r.name).toBe("HU YAJUN"); expect(r.round).toBe(2); expect(r.status).toBe("pending");
  });
  it("无 AppealID/经办人也能解析姓名", () => {
    expect(parseCaseFolderName("APPROVED - LEI GENHUA").name).toBe("LEI GENHUA");
  });
});

describe("classifyFile", () => {
  it.each([
    ["form14.pdf", "Form 14"], ["APPEAL LETTER.docx", "申诉信"], ["PASSPORT.jpg", "护照"],
    ["IC.pdf", "身份证/NRIC"], ["身份证1.jpg", "身份证/NRIC"], ["HOUSEHOLD REGISTER.jpg", "户口本"],
    ["Incumbency Certification（在职证明）.docx", "在职证明"], ["WANG GUOLANG 新加坡酒店.pdf", "新加坡酒店证明"],
    ["guarantor name card.jpg", "担保人材料"], ["担保人签名.docx", "担保人材料"],
    ["APLOUT_ISC2603AM000466_00.pdf", "ICA 拒信"], ["WechatIMG123.jpg", "其他/证据材料"],
    ["随便什么.bin", "其他/证据材料"]
  ])("%s → 槽 %s", (file, slot) => expect(classifyFile(file).slot).toBe(slot));
});

describe("clientDedupKey", () => {
  it("大小写/空白归一", () => {
    expect(clientDedupKey("Dong  Yiwen")).toBe(clientDedupKey("DONG YIWEN"));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/john/project/businessHub-dev/packages/shared && pnpm vitest run src/icaImport.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 写实现**

```ts
// packages/shared/src/icaImport.ts
export type SubmissionResult = "pending" | "approved" | "rejected";

export function normalizeStatus(raw: string): SubmissionResult {
  const s = raw.toLowerCase();
  if (/(approved|granted)/.test(s)) return "approved";
  if (/reject/.test(s)) return "rejected";
  return "pending";
}

export function clientDedupKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

const ORDINAL: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5 };

export interface ParsedFolder {
  status: SubmissionResult;
  name: string;
  appealId: string | null;
  owner: string | null;
  round: number | null;
}

export function parseCaseFolderName(folder: string): ParsedFolder {
  const appealId = folder.match(/ISC\d{2}\d{2}A[ME]\d{6}/i)?.[0]?.toUpperCase() ?? null;
  const roundMatch = folder.match(/(\d(?:st|nd|rd|th))\s*appeal/i);
  const round = roundMatch ? ORDINAL[roundMatch[1].toLowerCase()] ?? null : null;
  // 拆分段:状态前缀在最前,经办人代号常在最后段
  const parts = folder.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  const status = normalizeStatus(parts[0] ?? "");
  // 姓名:去掉状态前缀词、AppealID、轮次后,取剩余最像姓名的一段
  let name = "";
  for (const p of parts) {
    const cleaned = p.replace(/ISC\d{2}\d{2}A[ME]\d{6}/i, "")
      .replace(/\b(approved|granted|rejected|reject|pending|p)\b/gi, "")
      .replace(/\d(?:st|nd|rd|th)\s*appeal/gi, "").trim();
    if (/[A-Za-z一-龥]{2,}/.test(cleaned) && cleaned.split(/\s+/).length <= 4 && cleaned.length > name.length) {
      // 排除明显的经办人短代号(全大写<=4字母无空格且在末段)留到 owner
    }
    if (cleaned && cleaned.length > name.length && /\s/.test(cleaned)) name = cleaned;
  }
  if (!name) {
    // 退化:取第一个含字母且非状态词的段
    name = (parts.find((p) => /[A-Za-z一-龥]/.test(p) && normalizeStatus(p) === "pending") ?? parts[1] ?? parts[0] ?? "").replace(/ISC\d{2}\d{2}A[ME]\d{6}/i, "").trim();
  }
  name = clientDedupKey(name);
  // owner:末段若是短全大写代号且不等于 name
  const last = parts[parts.length - 1] ?? "";
  const owner = (parts.length > 1 && /^[A-Z][A-Z\s]{1,6}$/.test(last) && clientDedupKey(last) !== name) ? last.trim() : null;
  return { status, name, appealId, owner, round };
}

export interface SlotMatch { slot: string; }

const SLOT_RULES: Array<[RegExp, string]> = [
  [/form\s*14/i, "Form 14"],
  [/appeal\s*letter|申诉信/i, "申诉信"],
  [/passport|护照|^pp[\s._\d]/i, "护照"],
  [/household|户口/i, "户口本"],
  [/incumbency|在职证明/i, "在职证明"],
  [/hotel|酒店/i, "新加坡酒店证明"],
  [/guarantor|担保人|name\s*card/i, "担保人材料"],
  [/aplout|^isc\d|reject|拒信|拒签/i, "ICA 拒信"],
  [/\b(ic|id)[\s._]|身份证|nric/i, "身份证/NRIC"]
];

export function classifyFile(filename: string): SlotMatch {
  const base = filename.toLowerCase();
  for (const [re, slot] of SLOT_RULES) {
    if (re.test(filename) || re.test(base)) return { slot };
  }
  return { slot: "其他/证据材料" };
}
```
> 注意规则顺序：先 Form14/申诉信/护照/户口/在职/酒店/担保人/拒信，再身份证(避免 `ISC...` 误入身份证)。`classifyFile` 的 slot 名必须与 Task 1 模板槽名逐字一致。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/john/project/businessHub-dev/packages/shared && pnpm vitest run src/icaImport.test.ts`
Expected: PASS。**若某用例不过，以真实文件夹名为准微调正则**(parseCaseFolderName 是脏数据解析，允许迭代)。导出：`export * from "./icaImport";` 进 `packages/shared/src/index.ts`。

- [ ] **Step 5: Commit**

```bash
cd /home/john/project/businessHub-dev
git add packages/shared/src/icaImport.ts packages/shared/src/icaImport.test.ts packages/shared/src/index.ts
git commit -m "feat(ica): 文件夹名解析/文件归槽/客户去重 纯函数 + 单测"
```

### Task 8: importIcaClients.ts 编排

**Files:**
- Create: `apps/api/src/scripts/importIcaClients.ts`

整体仿 `importEpClients.ts`，复用其 `saveFileLikeUpload`/`attachDocumentToStep`/`attachImportDocument`/`getMime`/`cloneSteps`/`selectTemplate`/`parseArgs`/`main` 收尾。ICA 专属差异：
- 遍历真实目录 `~/ae/{2025,2026}/<Mon YYYY>/<案件文件夹>/`(忽略 `._*`、`.DS_Store`、根目录模板文件、空 `untitled folder`、`Hotel/` 单独处理)
- **一客户一案件**：用 `clientDedupKey` 聚合同名跨月文件夹；每个客户建 1 个 ica case + 每个月文件夹 1 条 `case_submission`
- **不建计费**(EP 的 `createBillingForCase` 跳过——ICA 无收款里程碑 seed)
- 文件按 `classifyFile` 归槽，挂到对应步骤(护照/身份证/户口/在职/酒店/拒信/证据→步骤2；申诉信→步骤3；Form14→步骤4；担保人→步骤5)

- [ ] **Step 1: 写骨架(目录遍历 + 聚合)**

```ts
// apps/api/src/scripts/importIcaClients.ts
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { db, pool, clients, cases, caseSubmissions, caseSteps, caseStepDocuments, documents, workflowTemplates, templateSteps } from "@bh/db";
import { and, eq } from "drizzle-orm";
import { parseCaseFolderName, clientDedupKey, classifyFile, normalizeStatus } from "@bh/shared";

const AE_ROOT = process.env.AE_ROOT ?? join(process.env.HOME ?? "/home/john", "ae");
const NOISE = (n: string) => n.startsWith("._") || n === ".DS_Store";
const SKIP_FOLDERS = new Set(["Hotel", "untitled folder"]);

interface RoundFolder { absPath: string; folderName: string; month: string; parsed: ReturnType<typeof parseCaseFolderName>; }
interface ClientGroup { key: string; displayName: string; rounds: RoundFolder[]; }

async function collectGroups(): Promise<Map<string, ClientGroup>> {
  const groups = new Map<string, ClientGroup>();
  for (const year of ["2025", "2026"]) {
    const yearDir = join(AE_ROOT, year);
    let months: string[]; try { months = await readdir(yearDir); } catch { continue; }
    for (const month of months) {
      if (NOISE(month)) continue;
      const monthDir = join(yearDir, month);
      if (!(await stat(monthDir)).isDirectory()) continue;
      for (const folder of await readdir(monthDir)) {
        if (NOISE(folder) || SKIP_FOLDERS.has(folder)) continue;
        const abs = join(monthDir, folder);
        if (!(await stat(abs)).isDirectory()) continue;
        const parsed = parseCaseFolderName(folder);
        if (!parsed.name) continue;
        const key = clientDedupKey(parsed.name);
        const g = groups.get(key) ?? { key, displayName: parsed.name, rounds: [] };
        g.rounds.push({ absPath: abs, folderName: folder, month: `${month}`, parsed });
        groups.set(key, g);
      }
    }
  }
  return groups;
}
```

- [ ] **Step 2: 写月份→日期、客户/案件/提交 建表逻辑**

```ts
const MONTHS: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function monthToDate(month: string): Date {
  const m = month.match(/([a-z]{3})\s*(\d{4})/i);
  if (!m) return new Date();
  return new Date(Date.UTC(Number(m[2]), MONTHS[m[1].toLowerCase()] ?? 0, 1));
}

async function ensureClient(name: string): Promise<string> {
  const [existing] = await db.select().from(clients).where(eq(clients.name, name));
  if (existing) return existing.id;
  const [row] = await db.insert(clients).values({ name }).returning();
  return row.id;
}
```

case 幂等：按 `(clientId, businessType='ica')` 查重(仿 `findExistingCase`:246-253)。建 case 后用 `selectTemplate("ica")` + `cloneSteps`(照抄 EP:307-345)克隆步骤与空槽。

- [ ] **Step 3: 每个月文件夹建 submission + 挂文件**

对客户的每个 round(按月排序)：
- `insert(caseSubmissions)`：`{ caseId, submittedAt: monthToDate(round.month), result: round.parsed.status, rejectedAt: null, note: round.folderName + (owner? ` | 经办:${owner}`:"") + (appealId? ` | ${appealId}`:"") }`
- 递归列出该文件夹所有文件(跳过 NOISE)，每个文件 `classifyFile` 得 slot → 找到该 slot 对应的 step(见 slot→step 映射表)→ 照抄 `attachImportDocument`(:522-553)把文件复制进 `uploads/` + 建 `documents`(subjectType `case_step`)+ 建 `caseStepDocuments`(uploaded 槽)。documents 行额外打 tag `[round.folderName]` 以标注轮次(便于回溯)。

slot→stepOrder 映射常量：
```ts
const SLOT_STEP: Record<string, number> = {
  "护照": 2, "身份证/NRIC": 2, "户口本": 2, "在职证明": 2, "新加坡酒店证明": 2, "ICA 拒信": 2, "其他/证据材料": 2,
  "申诉信": 3, "Form 14": 4, "担保人材料": 5
};
```

- [ ] **Step 4: Hotel/ 补挂**

`~/ae/Hotel/` 下文件名含客户名(如 `WANG GUOLANG 新加坡酒店.pdf`)。对每个 Hotel 文件，用 `clientDedupKey` 抽取其中的客户名匹配已建客户，挂到该客户案件步骤2「新加坡酒店证明」槽。匹配不到的 warn 跳过。

- [ ] **Step 5: parseArgs + main + 收尾**

照抄 EP 的 `parseArgs`(:113-141)支持 `--dry-run`(只打印将建的 client/case/submission/文件数，不写库)、`--purge`(删除本脚本导入的 ICA 数据，便于重跑)。`main` 末尾照抄 `try { await main() } finally { await pool.end() }`。

幂等：client 按名复用、case 按 `(client, ica)` 复用、submission 按 `(caseId, folderName)` 查重(note 含 folderName，可查重)、文件按源路径去重(`copiedFiles` Map，照抄 EP)。

- [ ] **Step 6: 跑 dry-run**

Run:
```bash
cd /home/john/project/businessHub-dev/apps/api
pnpm tsx src/scripts/importIcaClients.ts --dry-run
```
Expected: 打印约 90+ 客户、~114 submissions、文件计数；无写库、无报错。**人工核对客户数量级和几个抽样客户的轮次/状态解析是否正确**。

- [ ] **Step 7: Commit(脚本)**

```bash
cd /home/john/project/businessHub-dev
git add apps/api/src/scripts/importIcaClients.ts
git commit -m "feat(ica): importIcaClients 批量导入脚本(一客户一案件+多轮提交+文件归槽)"
```

### Task 9: 实跑导入到 dev 库

- [ ] **Step 1: 备份 dev 库相关表(可回滚)**

Run:
```bash
pg_dump "$DATABASE_URL" -t clients -t cases -t case_submissions -t case_steps -t case_step_documents -t documents -t guarantors > /tmp/claude-1000/-home-john-project-businessHub/4cf9b7aa-6421-4a98-9ac4-4af481a3a1bf/scratchpad/ica_predump_$(date +%s).sql
```
(从 apps/api 取 `$DATABASE_URL`，或 `set -a; . ../../.env`)
Expected: 生成 dump 文件。

- [ ] **Step 2: 实跑导入**

Run:
```bash
cd /home/john/project/businessHub-dev/apps/api
pnpm tsx src/scripts/importIcaClients.ts
```
Expected: 打印创建统计，无报错。

- [ ] **Step 3: 抽查验证**

Run(SQL 抽查计数):
```bash
cd /home/john/project/businessHub-dev/apps/api
pnpm tsx -e "import {db,pool,cases,caseSubmissions} from '@bh/db'; import {eq} from 'drizzle-orm'; const c=await db.select().from(cases).where(eq(cases.businessType,'ica')); const s=await db.select().from(caseSubmissions); console.log('ica cases',c.length,'submissions',s.length); await pool.end();"
```
Expected: ica cases ≈ 90+，submissions ≈ 114。
打开 `dev-bh.youjia.sg/business/ica` cases tab：客户/案件出现，点开案件详情看文件挂在对应槽。

- [ ] **Step 4: 不提交代码(本任务无代码变更)；记录验证结果**

---

## Phase 5 — 拒绝日期 + 担保人身份 抽取回填

### Task 10: 子 agent 抽取 pass(operational)

**产物:** `/tmp/.../scratchpad/ica_extract/<month>.json`，每个文件形如：
```json
{ "REJECTED - DONG YIWEN - ISC2603AM000466 -TAN": { "rejected_at": "2026-02-14", "guarantor": { "name": "ZHANG SAN", "nric": "S1234567A", "relation": "朋友", "contact": "+65..." } } }
```

- [ ] **Step 1: 按月分批派只读子 agent**

对 `~/ae/{2025,2026}` 的每个月文件夹(约 13 个)派一个 Explore/general-purpose 子 agent(可分批并行)。每个 agent 的任务：
- 遍历该月每个案件文件夹
- 对 status=rejected 的：打开 ICA 拒信 PDF(`APLOUT_*` / `<AppealID>.pdf`)抽 `rejected_at`(ISO 日期)
- 对每个文件夹：打开担保人材料(`担保人*`/`guarantor*`/`*name card*`/签名 docx)抽 `{name, nric, relation, contact}`(抽不到的字段填 null)
- **只把结果 JSON 写到 `scratchpad/ica_extract/<month>.json`**，agent 回主对话只回一句"完成 N 个文件夹"(大输出不进主上下文)

主对话额外派一个 agent 解析根目录 `担保人&签名docx(3).docx` 输出担保人名单 → `scratchpad/ica_extract/_guarantor_master.json` 作交叉校验。

- [ ] **Step 2: 汇总检查**

Run: `ls /tmp/.../scratchpad/ica_extract/ && wc -l /tmp/.../scratchpad/ica_extract/*.json`
Expected: ~13 个 month JSON + master。人工抽查 1-2 个 JSON 合理性。

### Task 11: backfillIcaExtraction.ts 回填

**Files:**
- Create: `apps/api/src/scripts/backfillIcaExtraction.ts`

- [ ] **Step 1: 写回填脚本**

读 `scratchpad/ica_extract/*.json`，对每个 `folderName → {rejected_at, guarantor}`：
1. 按 note 含 folderName 找到对应 `case_submission` → 若 `rejected_at` 非空，`update` 其 `rejectedAt`
2. 担保人去重：优先按 NRIC、无 NRIC 退化按 `clientDedupKey(name)`，在 `guarantors` 查重，没有则 `insert`(name/nric/note)；拿到 guarantorId → `update(cases)` set `guarantorId` + 冗余 `guarantorName/guarantorRelation/guarantorContact`(该 folder 对应 case)
3. 抽不到的字段保持空(前端会标"待补")

幂等：rejectedAt/guarantorId 已有值则跳过或覆盖(选覆盖，便于修正)。

```ts
import { readdir, readFile } from "node:fs/promises";
import { db, pool, cases, caseSubmissions, guarantors } from "@bh/db";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { clientDedupKey } from "@bh/shared";
// ... 遍历 JSON、按 note ilike `%${folderName}%` 定位 submission、dedup guarantor、update
```

- [ ] **Step 2: 跑回填**

Run:
```bash
cd /home/john/project/businessHub-dev/apps/api
pnpm tsx src/scripts/backfillIcaExtraction.ts
```
Expected: 打印更新的 submission 数、新建/复用的 guarantor 数，无报错。

- [ ] **Step 3: 验证**

Run(抽查有 rejected_at 的 submission 数 + 有 guarantor 的 case 数):
```bash
cd /home/john/project/businessHub-dev/apps/api
pnpm tsx -e "import {db,pool,caseSubmissions,cases,guarantors} from '@bh/db'; import {isNotNull,eq,and} from 'drizzle-orm'; const r=await db.select().from(caseSubmissions).where(isNotNull(caseSubmissions.rejectedAt)); const g=await db.select().from(cases).where(and(eq(cases.businessType,'ica'),isNotNull(cases.guarantorId))); const gs=await db.select().from(guarantors); console.log('rejected_at填充',r.length,'有担保人case',g.length,'担保人去重数',gs.length); await pool.end();"
```
Expected: 三个数都 >0 且合理。
打开 `dev-bh.youjia.sg/business/ica`：cases 列表「再申请」徽章按拒绝日期显示倒计时；担保人页显示担保数/担保时间/成功率。

- [ ] **Step 4: Commit**

```bash
cd /home/john/project/businessHub-dev
git add apps/api/src/scripts/backfillIcaExtraction.ts
git commit -m "feat(ica): backfillIcaExtraction 回填拒绝日期+担保人身份(去重)"
```

---

## Phase 6 — 端到端验证(dev)

### Task 12: dev-bh.youjia.sg 整体走查

- [ ] **Step 1: 跑全部单测**

Run: `cd /home/john/project/businessHub-dev/packages/shared && pnpm vitest run`
Expected: 全绿(reapply / guarantorStats / icaImport)。

- [ ] **Step 2: 前端类型检查 + build**

Run: `cd /home/john/project/businessHub-dev && pnpm -r build`(或本仓库构建命令)
Expected: 成功无错误。

- [ ] **Step 3: 在 dev-bh.youjia.sg 人工走查清单**

- [ ] ICA cases 列表显示全部导入客户，「再申请」列徽章正确(eligible 绿 / waiting 倒计时变色 / approved 已通过 / pending 等待 / 无日期待补)
- [ ] 勾「待再申请」筛选只剩 rejected 案件
- [ ] 抽 3 个案件详情：多轮 submission 时间线齐全、各轮文件挂在对应槽、ICA 拒信有 rejected_at
- [ ] 担保人页：担保数 / 担保时间 / 成功率三列有数据且口径正确(成功率=通过客户/(通过+拒绝客户))
- [ ] 抽查文件能下载打开

- [ ] **Step 4: 汇报用户，等发 prod 指令**

确认 dev 全部 OK 后，**不要自动发 prod**。汇报用户验证结果，按 `docs/runbooks/deploy-pitfalls.md` 流程、经用户确认后再发布到 prod。

---

## 自检对照(spec → 计划)

- spec A 一客户一案件+多轮提交 → Task 8 Step 2/3 ✅
- spec B 标准文件槽 → Task 1 + Task 7 classifyFile + Task 8 slot→step ✅
- spec C 拒绝日期+担保人抽取 → Task 10/11 ✅
- spec D 再申请倒计时+待再申请筛选 → Task 2/3/4 ✅
- spec D2 担保人统计(担保数/担保时间/成功率按客户最终结果) → Task 5/6 ✅
- spec E 确定性脚本+子agent抽取+dev验证+幂等+零迁移 → Phase 4/5/6 ✅
- 经办人代号存 note → Task 8 Step 3(note 含 owner) ✅
- 担保人抽不到留空标待补 → Task 11 Step 1.3 + Task 4 徽章/Task 6 "无判定" ✅

## 风险 / 执行注意
- `parseCaseFolderName` 是脏数据解析，dry-run 时**人工核对抽样**，按真实文件夹名迭代正则(Task 8 Step 6)
- 纯拼音同名不同人可能误并为一个客户 → dry-run 输出客户清单时人工扫一眼
- 起 dev 服务/端口/鉴权按本仓库现有 dev 方式(计划未写死端口)
- `pnpm -r build` / `tsc --noEmit` 的确切命令以本仓库 package.json 为准
- 全程 dev 库，发 prod 单独走 runbook + 用户确认
