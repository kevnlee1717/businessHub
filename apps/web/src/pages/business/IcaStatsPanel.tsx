import { LineChart } from "@mantine/charts";
import { Alert, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getIcaStats } from "../../api/cases";

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={4} align="center">
        <Text fz={36} fw={700} c={color ?? "dark"} lh={1}>
          {value}
        </Text>
        <Text fz="sm" c="dimmed" ta="center">
          {label}
        </Text>
      </Stack>
    </Paper>
  );
}

export function IcaStatsPanel() {
  const { t } = useTranslation();

  const statsQuery = useQuery({
    queryKey: ["business", "ica-stats"],
    queryFn: getIcaStats
  });

  const data = statsQuery.data;
  const error = statsQuery.error;

  // 近两年合并成一条连续折线：年份升序铺开各月，裁掉首尾的空月
  const yearsAsc = [...(data?.years ?? [])].sort((a, b) => a.year - b.year);
  const flatTrend = yearsAsc.flatMap((yearData) =>
    yearData.months.map((m) => ({
      label: `${yearData.year}/${String(m.month).padStart(2, "0")}`,
      count: m.count
    }))
  );
  const firstIdx = flatTrend.findIndex((p) => p.count > 0);
  const lastIdx = flatTrend.reduce((acc, p, i) => (p.count > 0 ? i : acc), -1);
  const trendData = firstIdx === -1 ? [] : flatTrend.slice(firstIdx, lastIdx + 1);
  const trendTotal = yearsAsc.reduce((sum, y) => sum + y.total, 0);

  return (
    <Paper p="md">
      <Stack gap="lg">
        <Title order={3}>{t("icaStats.title")}</Title>

        {error ? (
          <Alert color="red" variant="light">
            {error instanceof Error ? error.message : String(error)}
          </Alert>
        ) : null}

        {/* 汇总卡片 */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <SummaryCard label={t("icaStats.totalClients")} value={data?.summary.totalClients ?? 0} />
          <SummaryCard label={t("icaStats.approved")} value={data?.summary.approved ?? 0} color="teal.7" />
          <SummaryCard label={t("icaStats.rejected")} value={data?.summary.rejected ?? 0} color="red.6" />
          <SummaryCard label={t("icaStats.pending")} value={data?.summary.pending ?? 0} color="blue.6" />
        </SimpleGrid>

        {/* 近两年新增案件趋势：一条跨年连续折线 */}
        {trendData.length > 0 ? (
          <Stack gap="xs">
            <Title order={4}>{t("icaStats.trendTitle", { count: trendTotal })}</Title>
            <LineChart
              h={340}
              data={trendData}
              dataKey="label"
              series={[{ name: "count", label: t("icaStats.newCases"), color: "teal.6" }]}
              curveType="monotone"
              withDots
              withPointLabels
              withLegend={false}
              tickLine="xy"
              gridAxis="xy"
              dotProps={{ r: 3 }}
              lineChartProps={{ margin: { top: 24 } }}
            />
          </Stack>
        ) : null}

        {!statsQuery.isLoading && (data?.years ?? []).length === 0 ? (
          <Text c="dimmed">{t("case.empty")}</Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
