import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { db, recruitmentFollowups, recruitmentGroupOwners, recruitmentKpiTargets, recruitmentPostings } from "@bh/db";

// 招聘指标周期粒度：目标数 = 每周期完成 N 个；达成率窗口跟着周期走
export const kpiPeriods = ["daily", "weekly", "monthly"] as const;
export type KpiPeriod = (typeof kpiPeriods)[number];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateString(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// 给定基准日，算该周期的起止（含两端，YYYY-MM-DD）：daily=当天，weekly=ISO 周一~周日，monthly=自然月
export function kpiPeriodWindow(period: string, date: string): { start: string; end: string } {
  if (period === "weekly") {
    const d = new Date(`${date}T00:00:00.000Z`);
    const isoDay = (d.getUTCDay() + 6) % 7; // 周一=0
    d.setUTCDate(d.getUTCDate() - isoDay);
    const start = toDateString(d);
    d.setUTCDate(d.getUTCDate() + 6);
    return { start, end: toDateString(d) };
  }
  if (period === "monthly") {
    const d = new Date(`${date}T00:00:00.000Z`);
    const start = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
    const endDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { start, end: toDateString(endDate) };
  }
  return { start: date, end: date };
}

// 周期还剩几天（含基准日当天）；daily 恒为 1
export function kpiPeriodDaysLeft(period: string, date: string): number {
  const { end } = kpiPeriodWindow(period, date);
  const diff = Math.round((new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${date}T00:00:00.000Z`).getTime()) / 86_400_000);
  return diff + 1;
}

// 枚举与 [from,to] 有交集的周期窗口（按 period 对齐：daily=逐天，weekly=逐 ISO 周，monthly=逐自然月）
export function enumerateKpiPeriodWindows(period: string, from: string, to: string): { start: string; end: string }[] {
  const windows: { start: string; end: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const window = kpiPeriodWindow(period, cursor);
    windows.push(window);
    const next = new Date(`${window.end}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = toDateString(next);
  }
  return windows;
}

// 周期内实绩：发帖/联系/群主按 assignee 在窗口内计数（platform 仅发帖指标生效）
export async function computeKpiActualForPeriod(target: typeof recruitmentKpiTargets.$inferSelect, date: string): Promise<number> {
  const { start, end } = kpiPeriodWindow(target.period, date);
  if (target.metric === "daily_posts") {
    const filters = [
      eq(recruitmentPostings.ownerId, target.assigneeEmployeeId),
      gte(recruitmentPostings.publishedOn, start),
      lte(recruitmentPostings.publishedOn, end),
      ...(target.platform ? [eq(recruitmentPostings.platform, target.platform)] : [])
    ];
    const [row] = await db.select({ total: count() }).from(recruitmentPostings).where(and(...filters));
    return row?.total ?? 0;
  }

  if (target.metric === "daily_contacts") {
    const [row] = await db
      .select({ total: count() })
      .from(recruitmentFollowups)
      .where(
        and(
          eq(recruitmentFollowups.byEmployeeId, target.assigneeEmployeeId),
          sql`date(${recruitmentFollowups.contactedAt}) >= ${start}`,
          sql`date(${recruitmentFollowups.contactedAt}) <= ${end}`
        )
      );
    return row?.total ?? 0;
  }

  const [row] = await db
    .select({ total: count() })
    .from(recruitmentGroupOwners)
    .where(
      and(
        eq(recruitmentGroupOwners.foundBy, target.assigneeEmployeeId),
        gte(recruitmentGroupOwners.foundOn, start),
        lte(recruitmentGroupOwners.foundOn, end)
      )
    );
  return row?.total ?? 0;
}
