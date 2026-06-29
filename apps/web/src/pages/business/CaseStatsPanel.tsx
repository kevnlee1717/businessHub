import { BarChart } from "@mantine/charts";
import { Alert, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { type BusinessType } from "@bh/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCaseStats } from "../../api/cases";

type BusinessTypeFilter = BusinessType | "all";

const businessTypeOptions: BusinessTypeFilter[] = ["all", "ep", "ica", "dp"];

export function CaseStatsPanel() {
  const { t } = useTranslation();
  const [businessType, setBusinessType] = useState<BusinessTypeFilter>("ep");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const currentYear = new Date().getFullYear();

  const statsQuery = useQuery({
    queryKey: ["business", "case-stats", selectedYear, businessType],
    queryFn: () =>
      getCaseStats({
        year: selectedYear ?? undefined,
        business_type: businessType === "all" ? undefined : businessType
      })
  });

  const stats = statsQuery.data;
  const activeYear = selectedYear ?? stats?.year ?? currentYear;
  const yearOptions = useMemo(() => {
    const years = new Set(stats?.available_years ?? []);
    years.add(activeYear);
    return [...years].sort((a, b) => b - a).map((year) => ({
      value: String(year),
      label: String(year)
    }));
  }, [activeYear, stats?.available_years]);
  const chartData = Array.from({ length: 12 }, (_value, index) => {
    const month = index + 1;
    const item = stats?.months.find((entry) => entry.month === month);

    return {
      month: t("case.stats.month", { month }),
      count: item?.count ?? 0
    };
  });

  return (
    <Paper p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={3}>{t("case.stats.title")}</Title>
            <Text size="sm" c="dimmed">
              {t("case.stats.total", { year: activeYear, count: stats?.total ?? 0 })}
            </Text>
          </Stack>
          <Group align="flex-end" wrap="wrap">
            <Select
              label={t("case.stats.year")}
              data={yearOptions}
              value={String(activeYear)}
              onChange={(value) => setSelectedYear(value ? Number(value) : null)}
              w={140}
            />
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

        {statsQuery.error ? (
          <Alert color="red" variant="light">
            {statsQuery.error instanceof Error ? statsQuery.error.message : t("common.unknown_error")}
          </Alert>
        ) : null}

        <BarChart
          h={320}
          data={chartData}
          dataKey="month"
          series={[{ name: "count", label: t("case.stats.count"), color: "teal.6" }]}
          tickLine="y"
          gridAxis="xy"
          withLegend={false}
        />
      </Stack>
    </Paper>
  );
}
