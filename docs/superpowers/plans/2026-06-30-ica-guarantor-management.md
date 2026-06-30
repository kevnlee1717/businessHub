# ICA 担保人管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ICA 担保人管理提升为独立 tab、补全顶部汇总与点击抽屉,并从 `~/ae` 源文档批量提取担保人补全历史数据。

**Architecture:** 复用既有 `guarantors` 表 / CRUD / `computeGuarantorStats`(零迁移)。前端在 `IcaSection` 拆出独立 tab,`GuarantorsPage` 加顶部汇总卡片 + 详情抽屉;后端补一个聚合统计端点和 case 最新结果字段。数据侧用子agent 读 `form14.pdf`/总名册抽取担保人,机械脚本去重写库,提不出的留空标「待补」。

**Tech Stack:** React 18 + Mantine 7 + @tanstack/react-query(`apps/web`)、Fastify + Drizzle(`apps/api`)、共享逻辑 + vitest(`packages/shared`)、tsx 脚本。

**环境铁律:** 全程 `~/project/businessHub-dev`(库 `businesshub_dev`)。绝不在 prod 树改/测。dev 冒烟过后按 `docs/runbooks/deploy-pitfalls.md` 发 prod。

**测试命令:** 共享包 `pnpm --filter @bh/shared exec vitest run <file>`;类型检查 `pnpm -r typecheck`。

---

## 文件结构(改动清单)

**Phase A — UI / 后端展示**
- Modify `apps/web/src/pages/business/IcaSection.tsx` — 拆出 `guarantors` 独立 tab,从 templates 面板移除内嵌块。
- Create `packages/shared/src/guarantorSummary.ts` — 全局汇总聚合 `computeGuarantorSummary()`。
- Create `packages/shared/src/guarantorSummary.test.ts` — 上述单测。
- Modify `packages/shared/src/index.ts` — 导出新函数/类型。
- Modify `packages/shared/src/guarantorStats.ts` — 抽出共用「取最新提交结果」helper `latestSubmissionResult()`(供 case brief 复用)。
- Modify `apps/api/src/routes/guarantors.ts` — 新增 `GET /guarantors/stats`;`GET /guarantors/:id` 的 case brief 附 `latest_result`。
- Modify `apps/web/src/api/cases.ts` — 加 `getGuarantorSummary()` + 类型;`GuarantorCaseBrief` 加 `latest_result`。
- Modify `apps/web/src/pages/business/GuarantorsPage.tsx` — 顶部汇总卡片 + 行点击打开详情抽屉。
- Create `apps/web/src/pages/business/GuarantorDetailDrawer.tsx` — 担保人详情抽屉(担保案件 + 结果)。
- Modify `apps/web/src/i18n/*`(或现有 i18n 文件)— 新增文案 key。

**Phase B — 数据提取**
- Create `apps/api/src/scripts/extractIcaGuarantors.ts` — 机械导入脚本(`--dry-run` / 实跑 / `--purge`),读一份提取映射 JSON 写库。
- Create `apps/api/src/scripts/data/ica-guarantor-map.json` — 子agent 提取产出的「客户→担保人」映射(实施时生成)。

---

# Phase A — 担保人独立 tab + 汇总 + 抽屉

## Task A1: IcaSection 拆出担保人独立 tab

**Files:**
- Modify: `apps/web/src/pages/business/IcaSection.tsx`

- [ ] **Step 1: 改 tab 结构**

把整个组件 return 改成(新增 `guarantors` tab,templates 面板去掉内嵌担保人块):

```tsx
import { Tabs } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CasesPage } from "./CasesPage";
import { ClientsPage } from "./ClientsPage";
import { GuarantorsPage } from "./GuarantorsPage";
import { IcaStatsPanel } from "./IcaStatsPanel";
import { TemplatesPage } from "./TemplatesPage";

export function IcaSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("cases");

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="cases">{t("business.tabs.cases")}</Tabs.Tab>
        <Tabs.Tab value="clients">{t("business.tabs.clients")}</Tabs.Tab>
        <Tabs.Tab value="guarantors">{t("business.tabs.guarantors")}</Tabs.Tab>
        <Tabs.Tab value="templates">{t("business.tabs.templates")}</Tabs.Tab>
        <Tabs.Tab value="stats">{t("business.tabs.stats")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="cases" pt="md">
        <CasesPage businessType="ica" />
      </Tabs.Panel>
      <Tabs.Panel value="clients" pt="md">
        <ClientsPage />
      </Tabs.Panel>
      <Tabs.Panel value="guarantors" pt="md">
        <GuarantorsPage />
      </Tabs.Panel>
      <Tabs.Panel value="templates" pt="md">
        <TemplatesPage businessType="ica" />
      </Tabs.Panel>
      <Tabs.Panel value="stats" pt="md">
        <IcaStatsPanel />
      </Tabs.Panel>
    </Tabs>
  );
}
```

注意:删掉了原 import 里不再用的 `Stack` / `Title`。`business.tabs.guarantors` key 已存在(原内嵌标题用过)。

- [ ] **Step 2: 类型检查**

Run: `pnpm -r typecheck`
Expected: PASS(无未用 import 报错)

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/pages/business/IcaSection.tsx
git commit -m "feat(ica): 担保人提升为顶部独立 tab"
```

## Task A2: 共享 helper — 抽出「取最新提交结果」

**Files:**
- Modify: `packages/shared/src/guarantorStats.ts`

- [ ] **Step 1: 在 guarantorStats.ts 顶部加导出 helper**

在 `computeGuarantorStats` 之前加:

```ts
export type SubmissionResult = "pending" | "approved" | "rejected";

/** 一个案件的若干轮提交里,取最新一轮的 result(无提交返回 null) */
export function latestSubmissionResult(
  submissions: { result: SubmissionResult; submittedAt: string | null; createdAt: string }[]
): SubmissionResult | null {
  if (submissions.length === 0) {
    return null;
  }
  const sorted = [...submissions].sort((a, b) => {
    const sa = a.submittedAt ?? a.createdAt;
    const sb = b.submittedAt ?? b.createdAt;
    if (sa !== sb) {
      return sb.localeCompare(sa);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
  return sorted[0]!.result;
}
```

- [ ] **Step 2: 导出到包入口**

Modify `packages/shared/src/index.ts`,确认 `guarantorStats` 的 re-export 包含新符号(若是 `export * from "./guarantorStats"` 则无需改;否则补 `latestSubmissionResult`、`SubmissionResult`)。

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @bh/shared exec tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add packages/shared/src/guarantorStats.ts packages/shared/src/index.ts
git commit -m "refactor(shared): 抽出 latestSubmissionResult 供 case brief 复用"
```

## Task A3: 共享聚合 — computeGuarantorSummary(TDD)

**Files:**
- Create: `packages/shared/src/guarantorSummary.ts`
- Test: `packages/shared/src/guarantorSummary.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写失败测试**

`packages/shared/src/guarantorSummary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeGuarantorSummary } from "./guarantorSummary";

describe("computeGuarantorSummary", () => {
  const perGuarantor = [
    { total: 6, approved: 2, rejected: 3, successRate: 0.4, firstAt: null, lastAt: null },
    { total: 4, approved: 4, rejected: 0, successRate: 1, firstAt: null, lastAt: null }
  ];
  it("担保人数=条目数", () => {
    expect(computeGuarantorSummary(perGuarantor).guarantorCount).toBe(2);
  });
  it("总担保人次=Σtotal", () => {
    expect(computeGuarantorSummary(perGuarantor).sponsoredTotal).toBe(10);
  });
  it("已批准/被拒=Σ", () => {
    const s = computeGuarantorSummary(perGuarantor);
    expect(s.approved).toBe(6);
    expect(s.rejected).toBe(3);
  });
  it("整体成功率=Σ批准/(Σ批准+Σ被拒)", () => {
    expect(computeGuarantorSummary(perGuarantor).successRate).toBeCloseTo(6 / 9);
  });
  it("无判定时成功率为 null", () => {
    expect(computeGuarantorSummary([]).successRate).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @bh/shared exec vitest run src/guarantorSummary.test.ts`
Expected: FAIL("computeGuarantorSummary is not a function" 或模块找不到)

- [ ] **Step 3: 写实现**

`packages/shared/src/guarantorSummary.ts`:

```ts
import type { GuarantorStats } from "./guarantorStats";

export interface GuarantorSummary {
  guarantorCount: number;
  sponsoredTotal: number;
  approved: number;
  rejected: number;
  successRate: number | null;
}

export function computeGuarantorSummary(
  perGuarantor: Pick<GuarantorStats, "total" | "approved" | "rejected">[]
): GuarantorSummary {
  const guarantorCount = perGuarantor.length;
  const sponsoredTotal = perGuarantor.reduce((s, g) => s + g.total, 0);
  const approved = perGuarantor.reduce((s, g) => s + g.approved, 0);
  const rejected = perGuarantor.reduce((s, g) => s + g.rejected, 0);
  const decided = approved + rejected;
  return {
    guarantorCount,
    sponsoredTotal,
    approved,
    rejected,
    successRate: decided === 0 ? null : approved / decided
  };
}
```

- [ ] **Step 4: 导出**

Modify `packages/shared/src/index.ts`,加一行(与现有 export 风格一致):

```ts
export * from "./guarantorSummary";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @bh/shared exec vitest run src/guarantorSummary.test.ts`
Expected: PASS(5 passed)

- [ ] **Step 6: 提交**

```bash
git add packages/shared/src/guarantorSummary.ts packages/shared/src/guarantorSummary.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): 担保人全局汇总聚合 computeGuarantorSummary + 单测"
```

## Task A4: 后端聚合端点 + case brief 结果

**Files:**
- Modify: `apps/api/src/routes/guarantors.ts`

- [ ] **Step 1: 新增 `GET /guarantors/stats`**

在 `registerGuarantorRoutes` 内、`GET /guarantors` 之后加(导入处补 `computeGuarantorSummary`、`latestSubmissionResult`):

```ts
app.get("/guarantors/stats", { preHandler: requirePerm("case.view") }, async () => {
  const rows = await db.select().from(guarantors);
  const perGuarantor = await Promise.all(
    rows.map(async (row) => {
      const caseRows = await db.select().from(cases).where(eq(cases.guarantorId, row.id));
      const ids = caseRows.map((c) => c.id);
      const subs = ids.length
        ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, ids))
        : [];
      return computeGuarantorStats(
        caseRows.map((c) => {
          const list = subs
            .filter((s) => s.caseId === c.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return {
            caseId: c.id,
            createdAt: c.createdAt.toISOString(),
            latestResult: list[0]?.result ?? null
          };
        })
      );
    })
  );
  return { summary: computeGuarantorSummary(perGuarantor) };
});
```

> 路由顺序注意:`/guarantors/stats` 必须注册在 `/guarantors/:id` **之前**,否则 `stats` 会被当成 `:id`。当前文件 `:id` 在 `/guarantors` 之后,把 `stats` 插在 `/guarantors` 与 `/guarantors/:id` 之间即可。

- [ ] **Step 2: `GET /guarantors/:id` 的 case brief 附 latest_result**

把该端点里 `caseRows.map(serializeCaseBrief)` 改为带结果。先批量取提交:

```ts
const ids = caseRows.map((c) => c.id);
const subs = ids.length
  ? await db.select().from(caseSubmissions).where(inArray(caseSubmissions.caseId, ids))
  : [];
const casesWithResult = caseRows.map((c) => ({
  ...serializeCaseBrief(c),
  latest_result: latestSubmissionResult(
    subs
      .filter((s) => s.caseId === c.id)
      .map((s) => ({
        result: s.result,
        submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
        createdAt: s.createdAt.toISOString()
      }))
  )
}));
```

并把返回里的 `cases: caseRows.map(serializeCaseBrief)` 换成 `cases: casesWithResult`。
(client 名字也一并带上便于抽屉展示:在 `casesWithResult` 里 join `clients` 取 `client_name`;若嫌重,抽屉可只显示案件状态+结果,client 名留作 A5 可选增强。)

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @bh/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 4: 手测端点**

启动 dev API(若未起):`pnpm --filter @bh/api dev`,另开终端拿 token 后
Run: `curl -s -H "Authorization: Bearer $TOKEN" localhost:<port>/api/guarantors/stats | head`
Expected: 返回 `{"summary":{"guarantorCount":13,...}}`

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/routes/guarantors.ts
git commit -m "feat(api): 担保人全局汇总端点 + case brief 附最新结果"
```

## Task A5: 前端 api 客户端 + 类型

**Files:**
- Modify: `apps/web/src/api/cases.ts`

- [ ] **Step 1: 加汇总类型与函数**

在 `getIcaStats` 附近加:

```ts
export type GuarantorSummary = {
  guarantorCount: number;
  sponsoredTotal: number;
  approved: number;
  rejected: number;
  successRate: number | null;
};

export function getGuarantorSummary(): Promise<{ summary: GuarantorSummary }> {
  return api<{ summary: GuarantorSummary }>("/guarantors/stats");
}
```

- [ ] **Step 2: case brief 类型加 latest_result**

找到 `getGuarantor`(`/guarantors/:id`)的返回类型(约 line 426-433 的 `guarantor: { ...; cases: ... }`),给 case brief 元素加:

```ts
latest_result?: "pending" | "approved" | "rejected" | null;
client_name?: string | null;
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @bh/web exec tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/api/cases.ts
git commit -m "feat(web): 担保人汇总 api + case brief 结果类型"
```

## Task A6: GuarantorsPage 顶部汇总卡片

**Files:**
- Modify: `apps/web/src/pages/business/GuarantorsPage.tsx`

- [ ] **Step 1: 加汇总查询 + 卡片**

在组件顶部 import 补 `SimpleGrid`、`Paper`(已用)、`getGuarantorSummary`;在 `guarantorsQuery` 后加:

```tsx
const summaryQuery = useQuery({
  queryKey: ["business", "guarantors", "summary"],
  queryFn: getGuarantorSummary
});
const summary = summaryQuery.data?.summary;
```

在 return 的最外层 `<Stack>` 顶部(增删按钮 Group 之前)插入汇总卡片(照 `IcaStatsPanel` 的 SummaryCard 版式):

```tsx
<SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
  <SummaryCard label={t("guarantor.summary.count")} value={summary?.guarantorCount ?? 0} />
  <SummaryCard label={t("guarantor.summary.sponsored")} value={summary?.sponsoredTotal ?? 0} />
  <SummaryCard label={t("guarantor.summary.approved")} value={summary?.approved ?? 0} color="teal.7" />
  <SummaryCard label={t("guarantor.summary.rejected")} value={summary?.rejected ?? 0} color="red.6" />
  <SummaryCard
    label={t("guarantor.summary.successRate")}
    value={summary && summary.successRate !== null ? Math.round(summary.successRate * 100) : 0}
    suffix="%"
  />
</SimpleGrid>
```

在文件内加一个本地 `SummaryCard`(与 IcaStatsPanel 同款,多一个可选 `suffix`):

```tsx
function SummaryCard({ label, value, color, suffix }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={4} align="center">
        <Text fz={36} fw={700} c={color ?? "dark"} lh={1}>
          {value}{suffix ?? ""}
        </Text>
        <Text fz="sm" c="dimmed" ta="center">{label}</Text>
      </Stack>
    </Paper>
  );
}
```

`updateMutation`/`createMutation`/`deleteMutation` 的 `onSuccess` 里把汇总也 invalidate:在现有 `invalidateQueries({ queryKey: guarantorQueryKey })` 后加一行 `await queryClient.invalidateQueries({ queryKey: ["business", "guarantors", "summary"] });`(三处)。

- [ ] **Step 2: 加 i18n 文案**

在 i18n 文件 `guarantor` 命名空间下加 `summary`: `{ count, sponsored, approved, rejected, successRate }`(中英各一份,英文同理)。中文示例:`担保人总数 / 总担保人次 / 已批准 / 被拒 / 整体成功率`。

- [ ] **Step 3: 启动前端看效果**

Run: `pnpm --filter @bh/web dev`,浏览器开 `dev-bh.youjia.sg` ICA→担保人 tab
Expected: 顶部 5 张卡片有数(担保人 13、总人次 30…),无报错。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/pages/business/GuarantorsPage.tsx apps/web/src/i18n
git commit -m "feat(web): 担保人页顶部汇总卡片"
```

## Task A7: 担保人详情抽屉

**Files:**
- Create: `apps/web/src/pages/business/GuarantorDetailDrawer.tsx`
- Modify: `apps/web/src/pages/business/GuarantorsPage.tsx`

- [ ] **Step 1: 写抽屉组件**

`GuarantorDetailDrawer.tsx`:

```tsx
import { Badge, Drawer, Group, Loader, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getGuarantor } from "../../api/cases";

const RESULT_COLOR: Record<string, string> = {
  approved: "teal",
  rejected: "red",
  pending: "blue"
};

export function GuarantorDetailDrawer({
  guarantorId,
  onClose
}: {
  guarantorId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["business", "guarantors", "detail", guarantorId],
    queryFn: () => getGuarantor(guarantorId as string),
    enabled: guarantorId !== null
  });
  const g = query.data?.guarantor;

  return (
    <Drawer opened={guarantorId !== null} onClose={onClose} position="right" size="lg" title={g?.name ?? ""}>
      {query.isLoading ? (
        <Group justify="center" py="lg"><Loader size="sm" /></Group>
      ) : g ? (
        <Stack gap="md">
          <Text fz="sm" c="dimmed">{t("guarantor.detail.casesTitle", { count: g.cases?.length ?? 0 })}</Text>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("guarantor.detail.client")}</Table.Th>
                <Table.Th>{t("guarantor.detail.status")}</Table.Th>
                <Table.Th>{t("guarantor.detail.result")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(g.cases ?? []).map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.client_name ?? c.client_id}</Table.Td>
                  <Table.Td>{t(`caseStatus.${c.status}`)}</Table.Td>
                  <Table.Td>
                    {c.latest_result ? (
                      <Badge color={RESULT_COLOR[c.latest_result]} variant="light">
                        {t(`caseResult.${c.latest_result}`)}
                      </Badge>
                    ) : <Badge color="gray" variant="light">{t("guarantor.detail.noResult")}</Badge>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : null}
    </Drawer>
  );
}
```

> 注:`getGuarantor` 已存在(`apps/web/src/api/cases.ts`,返回 `{ guarantor: { ..., cases } }`)。`caseStatus.*` / `caseResult.*` i18n key 若不存在则在 Step 3 补;先 grep 确认。

- [ ] **Step 2: 在 GuarantorsPage 接线**

`GuarantorsPage.tsx` 顶部加 state 与组件:

```tsx
const [detailId, setDetailId] = useState<string | null>(null);
```

担保人姓名单元格改为可点击打开抽屉:

```tsx
<Table.Td>
  <Text component="button" type="button" variant="link" onClick={() => setDetailId(guarantor.id)} style={{ cursor: "pointer", background: "none", border: "none", padding: 0, color: "var(--mantine-color-blue-6)" }}>
    {guarantor.name}
  </Text>
</Table.Td>
```

在最外层 `<Stack>` 末尾(Modal 旁)挂:

```tsx
<GuarantorDetailDrawer guarantorId={detailId} onClose={() => setDetailId(null)} />
```

- [ ] **Step 3: 补缺失 i18n key**

grep 确认 `caseStatus.*`、`caseResult.*`、`guarantor.detail.*` 是否存在;缺的补上(中英)。`caseResult`: `pending=提交中`、`approved=已批准`、`rejected=被拒`。

- [ ] **Step 4: 启动看效果**

Run: 前端 dev 已起,点担保人姓名
Expected: 右侧抽屉弹出,列出该担保人担保的案件 + 结果徽章,无报错。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/pages/business/GuarantorDetailDrawer.tsx apps/web/src/pages/business/GuarantorsPage.tsx apps/web/src/i18n
git commit -m "feat(web): 担保人详情抽屉(担保案件+结果)"
```

---

# Phase B — 从 ~/ae 批量提取担保人

> 本阶段用子agent 读文档抽取(非纯脚本)。产出一份映射 JSON,再由机械脚本写库。提不出的留空标「待补」。**直接写库,无需用户逐条审批**(用户已确认)。

## Task B1: 准备 docx 文本 + 勘察总名册

**Files:** 无代码改动(勘察 + 生成中间文本)

- [ ] **Step 1: 装 docx→文本能力**

Run(任选其一可用的):`which libreoffice soffice` → 若有,用 `soffice --headless --convert-to txt`;否则 `pip install --user python-docx` 后用脚本读。
Expected: 能把 `~/ae/担保人&签名docx(3).docx` 转出文本。

- [ ] **Step 2: 转总名册为文本并人工/子agent 速读**

Run: `soffice --headless --convert-to txt --outdir /tmp/claude-*/scratchpad "$HOME/ae/担保人&签名docx(3).docx"`(或 python-docx)
Expected: 得到文本。判断它是否为结构化「客户→担保人(姓名/NRIC)」名单。
- 是 → B2 以它为主源;
- 否(仅签名扫描拼图)→ B2 退化为逐案 `form14.pdf` 抽取。

- [ ] **Step 3: 列出 dev 库 87 个 ICA 案件 + 现状**

Run:
```bash
docker exec -e PGPASSWORD=bh businesshub-db-1 psql -h localhost -U bh -d businesshub_dev -tAF$'\t' \
 -c "SELECT c.id, cl.name, c.guarantor_id, c.guarantor_name FROM cases c JOIN clients cl ON cl.id=c.client_id WHERE c.business_type='ica' ORDER BY cl.name;" > /tmp/claude-*/scratchpad/ica-cases.tsv
```
Expected: 87 行,标出哪 57 个 `guarantor_id` 为空。这是提取的目标清单与匹配 key(client name)。

## Task B2: 子agent 驱动提取 → 映射 JSON

**Files:**
- Create: `apps/api/src/scripts/data/ica-guarantor-map.json`

- [ ] **Step 1: 按客户名定位每个缺失案件的源文件夹**

对 `ica-cases.tsv` 中 `guarantor_id` 为空的 57 个客户,在 `~/ae/{2025,2026}/<Mon>/` 下按归一化客户名匹配案件文件夹(文件夹名形如 `REJECTED-<NAME>` / `APPROVED-<NAME>`)。产出 `客户名 → 文件夹路径`。

- [ ] **Step 2: 分批 dispatch 子agent 读 form14.pdf 抽担保人**

每批 N 个客户,给子agent:对应文件夹的 `form14.pdf`(必要时附 `WechatIMG*.jpg`/总名册片段),要求**只读不改**,输出严格 JSON:
```json
{ "client": "<客户名>", "guarantor": { "name": "", "nric": "", "relation": "", "contact": "" }, "source": "form14.pdf", "confidence": "high|low", "notFound": false }
```
抽不到 → `notFound: true`、`guarantor: null`。

- [ ] **Step 3: 顺带还原占位代号**

对现有 13 个担保人中的占位代号(`CAT`/`S9408`/`JEFF`/`MSLULU`/`AO` 等),用总名册 / 其担保案件的 `form14.pdf` 还原真名 + NRIC,产出 `代号 → {realName, nric}` 修正表(并入同一 JSON 的 `corrections` 段)。

- [ ] **Step 4: 汇总写入映射文件**

把全部子agent 输出合并成 `ica-guarantor-map.json`:
```json
{
  "matches": [ { "client": "...", "guarantor": { "name": "...", "nric": "...", "relation": "...", "contact": "..." } } ],
  "notFound": [ "客户A", "客户B" ],
  "corrections": [ { "fromName": "CAT", "name": "真名", "nric": "..." } ]
}
```

- [ ] **Step 5: 提交映射(作为可复跑产物)**

```bash
git add apps/api/src/scripts/data/ica-guarantor-map.json
git commit -m "chore(ica): 担保人提取映射 JSON(子agent 产出)"
```

## Task B3: 机械导入脚本 extractIcaGuarantors.ts

**Files:**
- Create: `apps/api/src/scripts/extractIcaGuarantors.ts`

- [ ] **Step 1: 写脚本骨架(dry-run / apply / purge)**

仿 `importIcaClients.ts` 的 argv 解析与 dry-run 风格。核心逻辑:

```ts
/**
 * 从 ica-guarantor-map.json 把担保人写回 ICA 案件。
 * - matches: upsert 担保人(NRIC 优先去重,无 NRIC 用归一化姓名),回填 cases.guarantorId + 内联列
 * - corrections: 把占位代号担保人改名/补 NRIC(就地更新 guarantors 行)
 * - notFound: 仅打印,不写(留空 = 待补)
 * 用法: pnpm tsx src/scripts/extractIcaGuarantors.ts [--dry-run] [--purge]
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cases, clients, guarantors, db, pool } from "@bh/db";
import { and, eq } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dirname, "data", "ica-guarantor-map.json");

const normName = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const normNric = (s?: string | null) => (s ? s.trim().toUpperCase().replace(/\s+/g, "") : "");

type Match = { client: string; guarantor: { name: string; nric?: string; relation?: string; contact?: string } };
type Correction = { fromName: string; name: string; nric?: string };
type MapFile = { matches: Match[]; notFound: string[]; corrections: Correction[] };

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const purge = args.has("--purge");

async function main() {
  const map: MapFile = JSON.parse(await readFile(MAP_PATH, "utf8"));

  // 现有担保人索引(NRIC 优先,姓名兜底)
  const existing = await db.select().from(guarantors);
  const byNric = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const g of existing) {
    if (g.nric) byNric.set(normNric(g.nric), g.id);
    byName.set(normName(g.name), g.id);
  }

  if (purge) {
    // 仅回滚本脚本的回填:把本次 matches 命中的 case 的 guarantor 清空。保守起见用专门标记,
    // 这里以 dry-run 打印待清单为主,实清需人工确认范围。
    console.log("[purge] 略 —— 见脚本注释,避免误删既有 30 条已确认数据");
    return;
  }

  // 1) corrections:就地改名/补 NRIC
  for (const c of map.corrections) {
    const id = byName.get(normName(c.fromName));
    if (!id) { console.log(`[correction miss] ${c.fromName} 不在 guarantors`); continue; }
    console.log(`[correction] ${c.fromName} → ${c.name}${c.nric ? " ("+c.nric+")" : ""}`);
    if (!dryRun) {
      await db.update(guarantors).set({ name: c.name, nric: c.nric ?? null, updatedAt: new Date() }).where(eq(guarantors.id, id));
      byName.set(normName(c.name), id);
      if (c.nric) byNric.set(normNric(c.nric), id);
    }
  }

  // 2) matches:upsert 担保人 + 回填案件
  let linked = 0;
  for (const m of map.matches) {
    const [clientRow] = await db.select().from(clients).where(eq(clients.name, m.client)).limit(1);
    if (!clientRow) { console.log(`[client miss] ${m.client}`); continue; }
    const [caseRow] = await db.select().from(cases).where(and(eq(cases.clientId, clientRow.id), eq(cases.businessType, "ica"))).limit(1);
    if (!caseRow) { console.log(`[case miss] ${m.client}`); continue; }

    const nk = normNric(m.guarantor.nric);
    let gid = (nk && byNric.get(nk)) || byName.get(normName(m.guarantor.name));
    if (!gid) {
      console.log(`[guarantor new] ${m.guarantor.name}${nk ? " ("+nk+")" : ""}`);
      if (!dryRun) {
        const [ins] = await db.insert(guarantors).values({ name: m.guarantor.name, nric: m.guarantor.nric ?? null }).returning({ id: guarantors.id });
        gid = ins!.id;
        if (nk) byNric.set(nk, gid);
        byName.set(normName(m.guarantor.name), gid);
      } else { gid = "DRYRUN"; }
    }
    console.log(`[link] ${m.client} → ${m.guarantor.name}`);
    if (!dryRun) {
      await db.update(cases).set({
        guarantorId: gid,
        guarantorName: m.guarantor.name,
        guarantorRelation: m.guarantor.relation ?? "",
        guarantorContact: m.guarantor.contact ?? "",
        updatedAt: new Date()
      }).where(eq(cases.id, caseRow.id));
    }
    linked++;
  }

  console.log(`\n汇总: matches=${map.matches.length} 回填=${linked} notFound=${map.notFound.length} corrections=${map.corrections.length}`);
  console.log(`待补(留空)客户: ${map.notFound.join(", ")}`);
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @bh/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 3: 提交脚本**

```bash
git add apps/api/src/scripts/extractIcaGuarantors.ts
git commit -m "feat(api): ICA 担保人提取导入脚本(dry-run/apply,NRIC去重)"
```

## Task B4: dry-run → 实跑 → 校验

**Files:** 无(运行 + 验证)

- [ ] **Step 1: dry-run 自查**

Run: `cd ~/project/businessHub-dev && pnpm --filter @bh/api tsx src/scripts/extractIcaGuarantors.ts --dry-run`
Expected: 打印 link/correction/new 计划 + 汇总;无报错;`[client miss]`/`[case miss]` 应很少(若多,回 B2 修客户名归一化)。

- [ ] **Step 2: 实跑**

Run: `pnpm --filter @bh/api tsx src/scripts/extractIcaGuarantors.ts`
Expected: 写库完成,汇总打印回填数。

- [ ] **Step 3: 校验 dev 库**

Run:
```bash
docker exec -e PGPASSWORD=bh businesshub-db-1 psql -h localhost -U bh -d businesshub_dev -tAF, \
 -c "SELECT count(*) total, count(guarantor_id) linked FROM cases WHERE business_type='ica';"
```
Expected: `linked` 显著上升(从 30 升到「30 + 能提取到的数」);占位代号被还原;notFound 客户仍留空。

- [ ] **Step 4: 前端冒烟**

浏览器 ICA→担保人:汇总卡片数字上升,新担保人出现,点击抽屉案件结果正确;ICA→统计页不受影响。

- [ ] **Step 5: 提交(若有数据快照/无代码改动可跳过)**

无代码改动则跳过;有则按需提交。

---

# Phase C — 发布 prod

- [ ] **Step 1: dev 全量冒烟**

ICA 五个 tab 全开一遍;担保人增删改、上传身份证、抽屉、汇总、统计无报错;`pnpm -r typecheck` PASS。

- [ ] **Step 2: 按 runbook 发布**

照 `docs/runbooks/deploy-pitfalls.md` 把代码 + 数据迁移(本特性零 schema 迁移,但**提取脚本需在 prod 库重跑一遍**,源文档 `~/ae` 同机可读)发布到 prod;注意 prod 库担保人现状可能与 dev 不同,prod 上单独 dry-run 再实跑。
- [ ] **Step 3: prod 冒烟 + 更新 dev-dashboard(若部署拓扑/端口有变,通常无变,可跳过)**

---

## 风险与备注
- **路由顺序**:`/guarantors/stats` 必须在 `/guarantors/:id` 之前,否则 404/误匹配。
- **提取质量**:`form14.pdf` 可能是扫描图,OCR 不一定准 → `confidence: low` 的条目在 dry-run 里重点扫一眼;拿不准宁可 `notFound` 留空。
- **客户名匹配**:文件夹名带 `APPROVED-`/`REJECTED-` 前缀,匹配时要剥前缀 + 归一化大小写/空格。
- **prod 数据**:dev 与 prod 的 ICA 数据可能不同步(见 memory `prod-full-sync-20260629`),prod 上提取要独立 dry-run。
- **并发会话**:dev 树可能有别的 Claude 会话,每次提交前 `git status` + 扫冲突标记(memory `dev-tree-concurrent-sessions`)。
