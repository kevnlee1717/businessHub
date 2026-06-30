import { BarChart } from "@mantine/charts";
import { Alert, Group, Paper, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { type BusinessType } from "@bh/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCaseStats } from "../../api/cases";

type BusinessTypeFilter = BusinessType | "all";

const businessTypeOptions: BusinessTypeFilter[] = ["all", "ep", "ica", "dp"];

export function CaseStatsPanel() {
  const { t } = useTranslation();
  const [businessType, setBusinessType] = useState<BusinessTypeFilter>("ep");

  const availableYearsQuery = useQuery({
    queryKey: ["business", "case-stats", "available-years", businessType],
    queryFn: () =>
      getCaseStats({
        business_type: businessType === "all" ? undefined : businessType
      })
  });

  const availableYears = useMemo(
    () => [...(availableYearsQuery.data?.available_years ?? [])].sort((a, b) => b - a),
    [availableYearsQuery.data?.available_years]
  );
  const summary = availableYearsQuery.data?.summary;
  const summaryYearTotals = useMemo(
    () => [...(summary?.year_totals ?? [])].sort((a, b) => b.year - a.year),
    [summary?.year_totals]
  );

  const yearlyStatsQueries = useQueries({
    queries: availableYears.map((year) => ({
      queryKey: ["business", "case-stats", year, businessType],
      queryFn: () =>
        getCaseStats({
          year,
          business_type: businessType === "all" ? undefined : businessType
        })
    }))
  });

  const loadError = availableYearsQuery.error ?? yearlyStatsQueries.find((query) => query.error)?.error;

  return (
    <Paper p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={3}>{t("case.stats.title")}</Title>
          </Stack>
          <Group align="flex-end" wrap="wrap">
            <Select
              label={t("case.stats.businessType")}
              data={businessTypeOptions.map((value) => ({
                value,
                label: value === "all" ? t("common.all") : t(`businessType.${value}`)
              }))}
              value={businessType}
              onChange={(value) => setBusinessType((value as BusinessTypeFilter | null) ?? "ep")}
              w={160}
            />
          </Group>
        </Group>

        {loadError ? (
          <Alert color="red" variant="light">
            {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
          </Alert>
        ) : null}

        {availableYears.length === 0 && !availableYearsQuery.isLoading ? (
          <Text c="dimmed">{t("case.empty")}</Text>
        ) : null}

        {summary ? (
          <Stack gap="xs">
            <Text fw={600}>{t("case.stats.summary_title")}</Text>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }}>
              {summaryYearTotals.map(({ year, count }) => (
                <Paper key={year} withBorder p="md" radius="md">
                  <Stack gap={4}>
                    <Text fw={700} size="xl" c="dark">
                      {count}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t("case.stats.summary_year_total", { year })}
                    </Text>
                  </Stack>
                </Paper>
              ))}
              {[
                { key: "approved", count: summary.result_counts.approved, label: t("case.stats.summary_approved"), color: "teal.6" },
                { key: "pending", count: summary.result_counts.pending, label: t("case.stats.summary_pending"), color: "blue.6" },
                { key: "rejected", count: summary.result_counts.rejected, label: t("case.stats.summary_rejected"), color: "red.6" }
              ].map((item) => (
                <Paper key={item.key} withBorder p="md" radius="md">
                  <Stack gap={4}>
                    <Text fw={700} size="xl" c={item.color}>
                      {item.count}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {item.label}
                    </Text>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        ) : null}

        {availableYears.map((year, index) => {
          const stats = yearlyStatsQueries[index]?.data;
          const chartData = Array.from({ length: 12 }, (_value, monthIndex) => {
            const month = monthIndex + 1;
            const item = stats?.months.find((entry) => entry.month === month);

            return {
              month: t("case.stats.month", { month }),
              count: item?.count ?? 0
            };
          });

          return (
            <Stack key={year} gap="xs">
              <Title order={4}>{t("case.stats.total", { year, count: stats?.total ?? 0 })}</Title>
              <BarChart
                h={320}
                data={chartData}
                dataKey="month"
                series={[{ name: "count", label: t("case.stats.count"), color: "teal.6" }]}
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
      </Stack>
    </Paper>
  );
}
