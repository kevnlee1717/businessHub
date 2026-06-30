import { BarChart } from "@mantine/charts";
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

        {/* 年度柱状图（years 已按倒序） */}
        {(data?.years ?? []).map((yearData) => {
          const chartData = yearData.months.map((m) => ({
            month: t("icaStats.month", { month: m.month }),
            count: m.count
          }));

          return (
            <Stack key={yearData.year} gap="xs">
              <Title order={4}>
                {t("icaStats.chartTitle", { year: yearData.year, count: yearData.total })}
              </Title>
              <BarChart
                h={320}
                data={chartData}
                dataKey="month"
                series={[{ name: "count", label: t("icaStats.newCases"), color: "teal.6" }]}
                tickLine="y"
                gridAxis="xy"
                withLegend={false}
                withBarValueLabel
                valueLabelProps={{ position: "top" }}
                barChartProps={{ margin: { top: 24 } }}
              />
            </Stack>
          );
        })}

        {!statsQuery.isLoading && (data?.years ?? []).length === 0 ? (
          <Text c="dimmed">{t("case.empty")}</Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
