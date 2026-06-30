import {
  Alert,
  Button,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listCompanies } from "../../api/hr";
import {
  downloadPnlCsv,
  getGst,
  getPnl,
  type PnlExpenseLine,
  type PnlReport,
  type PnlRevenueLine,
  type PnlSection
} from "../../api/reports";

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function yearStartIsoDate() {
  return `${todayIsoDate().slice(0, 4)}-01-01`;
}

function companyLabel(company: { name: string; name_en?: string | null }) {
  return company.name_en ? `${company.name} / ${company.name_en}` : company.name;
}

function money(value?: string | number | null) {
  return Number(value ?? 0).toFixed(2);
}

function amountColor(value?: string | number | null) {
  return Number(value ?? 0) < 0 ? "red" : undefined;
}

function negativeColorProps(value?: string | number | null) {
  return amountColor(value) ? ({ c: "red" } as const) : {};
}

type PnlRow =
  | { kind: "section"; label: string }
  | { kind: "line"; label: string; amount: string }
  | { kind: "total"; label: string; amount: string }
  | { kind: "summary"; label: string; amount: string };

function sectionRows<TLine extends PnlRevenueLine | PnlExpenseLine>(
  title: string,
  totalLabel: string,
  section: PnlSection<TLine>,
  getLabel: (line: TLine) => string
): PnlRow[] {
  return [
    { kind: "section", label: title },
    ...section.lines.map((line) => ({
      kind: "line" as const,
      label: getLabel(line),
      amount: line.amount
    })),
    { kind: "total", label: totalLabel, amount: section.total }
  ];
}

function pnlRows(pnl: PnlReport, t: (key: string) => string): PnlRow[] {
  return [
    ...sectionRows(t("finance.reports.revenue"), t("finance.reports.revenueTotal"), pnl.revenue, (line) => line.business_name),
    ...sectionRows(
      t("finance.reports.costOfSales"),
      t("finance.reports.costOfSalesTotal"),
      pnl.cost_of_sales,
      (line) => line.category
    ),
    { kind: "summary", label: t("finance.reports.grossProfit"), amount: pnl.gross_profit },
    ...sectionRows(
      t("finance.reports.operatingExpenses"),
      t("finance.reports.operatingExpensesTotal"),
      pnl.operating_expenses,
      (line) => line.category
    ),
    ...sectionRows(
      t("finance.reports.otherExpenses"),
      t("finance.reports.otherExpensesTotal"),
      pnl.other_expenses,
      (line) => line.category
    ),
    { kind: "summary", label: t("finance.reports.netProfitBeforeTax"), amount: pnl.net_profit_before_tax }
  ];
}

export function ReportsPage() {
  const { t } = useTranslation();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [from, setFrom] = useState(yearStartIsoDate);
  const [to, setTo] = useState(todayIsoDate);
  const [gstOpen, setGstOpen] = useState(true);

  const reportParams = { company_id: companyId, from, to };
  const companiesQuery = useQuery({ queryKey: ["hr", "companies"], queryFn: () => listCompanies() });
  const pnlQuery = useQuery({
    queryKey: ["finance", "reports", "pnl", companyId, from, to],
    queryFn: () => getPnl(reportParams)
  });
  const gstQuery = useQuery({
    queryKey: ["finance", "reports", "gst", companyId, from, to],
    queryFn: () => getGst(reportParams)
  });
  const exportMutation = useMutation({
    mutationFn: () => downloadPnlCsv(reportParams)
  });

  const companies = companiesQuery.data?.companies ?? [];
  const companyOptions = [
    { value: "all", label: t("common.all") },
    ...companies.map((company) => ({ value: company.id, label: companyLabel(company) }))
  ];
  const pnl = pnlQuery.data;
  const gst = gstQuery.data;
  const error = pnlQuery.error ?? gstQuery.error ?? companiesQuery.error ?? exportMutation.error;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
          {t("finance.reports.exportCsv")}
        </Button>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          {error instanceof Error ? error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder p="md">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Select
            label={t("finance.fields.company")}
            data={companyOptions}
            value={companyId ?? "all"}
            onChange={(value) => setCompanyId(value === "all" ? null : value)}
            searchable
          />
          <TextInput label={t("finance.fields.from")} type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
          <TextInput label={t("finance.fields.to")} type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
        </SimpleGrid>
      </Paper>

      <Alert color="blue" variant="light" title={t("finance.reports.cashBasis")}>
        {t("finance.reports.cashBasisHint")}
      </Alert>

      <Paper withBorder>
        <Group justify="space-between" p="md" pb="xs">
          <Stack gap={2}>
            <Title order={3}>{t("finance.reports.pnl")}</Title>
            <Text size="sm" c="dimmed">
              {pnl?.period.from ?? from} - {pnl?.period.to ?? to}
            </Text>
          </Stack>
          <Text size="sm" c="dimmed">
            SGD
          </Text>
        </Group>
        <ScrollArea>
          <Table withTableBorder withColumnBorders highlightOnHover miw={720}>
            <Table.Tbody>
              {pnl
                ? pnlRows(pnl, t).map((row, index) => (
                    <Table.Tr key={`${row.kind}-${row.label}-${index}`}>
                      <Table.Td fw={row.kind === "section" || row.kind === "total" || row.kind === "summary" ? 700 : undefined}>
                        {row.kind === "line" ? row.label || t("common.uncategorized") : row.label}
                      </Table.Td>
                      <Table.Td
                        ta="right"
                        fw={row.kind === "total" || row.kind === "summary" ? 700 : undefined}
                        {...negativeColorProps("amount" in row ? row.amount : 0)}
                      >
                        {"amount" in row ? money(row.amount) : ""}
                      </Table.Td>
                    </Table.Tr>
                  ))
                : null}
              {!pnl || pnlRows(pnl, t).length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={2}>
                    <Text c="dimmed" ta="center" py="lg">
                      {pnlQuery.isLoading ? t("finance.reports.loading") : t("finance.reports.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between">
          <Title order={3}>{t("finance.reports.gstEstimate")}</Title>
          <Button size="xs" variant="subtle" onClick={() => setGstOpen((value) => !value)}>
            {gstOpen ? t("common.collapse") : t("finance.reports.expand")}
          </Button>
        </Group>
        <Collapse in={gstOpen}>
          <SimpleGrid cols={{ base: 1, md: 4 }} mt="md">
            <Paper withBorder p="sm">
              <Text c="dimmed" size="sm">{t("finance.reports.gstRate")}</Text>
              <Text fw={700}>{(((gst?.rate ?? 0) as number) * 100).toFixed(2)}%</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text c="dimmed" size="sm">{t("finance.reports.outputTaxEst")}</Text>
              <Text fw={700}>{money(gst?.output_tax_est)}</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text c="dimmed" size="sm">{t("finance.reports.inputTaxEst")}</Text>
              <Text fw={700}>{money(gst?.input_tax_est)}</Text>
            </Paper>
            <Paper withBorder p="sm">
              <Text c="dimmed" size="sm">{t("finance.reports.netGstEst")}</Text>
              <Text fw={700} {...negativeColorProps(gst?.net_gst_est)}>{money(gst?.net_gst_est)}</Text>
            </Paper>
          </SimpleGrid>
          <Text size="sm" c="dimmed" mt="sm">
            {gst?.note ? `${gst.note}; ${t("finance.reports.estimateOnly")}` : t("finance.reports.estimateOnly")}
          </Text>
        </Collapse>
      </Paper>

      {!companyId && pnl?.by_company?.length ? (
        <Paper withBorder>
          <Title order={3} p="md" pb="xs">{t("finance.reports.byCompany")}</Title>
          <ScrollArea>
            <Table withTableBorder withColumnBorders highlightOnHover miw={520}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("finance.fields.company")}</Table.Th>
                  <Table.Th ta="right">{t("finance.reports.netProfitBeforeTax")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pnl.by_company.map((companyReport) => (
                  <Table.Tr key={companyReport.company.id ?? companyReport.company.name}>
                    <Table.Td>{companyReport.company.name}</Table.Td>
                    <Table.Td ta="right" fw={700} {...negativeColorProps(companyReport.net_profit_before_tax)}>
                      {money(companyReport.net_profit_before_tax)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      ) : null}
    </Stack>
  );
}
