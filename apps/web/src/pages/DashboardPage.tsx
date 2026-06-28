import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { can, currencies, type Currency } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { listBusinesses } from "../api/businessSchemes";
import {
  createRecurringCost,
  deleteRecurringCost,
  getDashboardKpi,
  getDashboardOverview,
  getPaymentCalendar,
  getReceivables,
  listRecurringCosts,
  runWhatIf,
  updateRecurringCost,
  type DashboardCompany,
  type RecurringCost,
  type WhatIfResult
} from "../api/dashboard";
import { listBankAccounts, updateBankAccount, type BankAccount } from "../api/ledger";

type WhatIfLine = {
  business_id: string | null;
  count: number | null;
};

type CostForm = {
  label: string;
  amount: number | null;
  currency: Currency;
  due_day: number | null;
  active: boolean;
  note: string;
};

type AccountForm = {
  opening_balance: number | null;
  opening_date: string;
};

const dashboardQueryKey = ["dashboard"] as const;

function formatPeriod(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentPeriod() {
  return formatPeriod(new Date());
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined, currency = "SGD") {
  return `${toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency}`;
}

function percent(value: number | string | null | undefined) {
  return Math.max(0, Math.min(100, Math.round(toNumber(value) * 100)));
}

function plColor(value: number | string | null | undefined) {
  return toNumber(value) < 0 ? "red" : "green";
}

function healthColor(health: DashboardCompany["health"]) {
  switch (health) {
    case "profit":
      return "green";
    case "loss":
      return "red";
    default:
      return "gray";
  }
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString();
}

function recurringToForm(cost: RecurringCost): CostForm {
  return {
    label: cost.label,
    amount: toNumber(cost.amount),
    currency: cost.currency,
    due_day: cost.due_day,
    active: cost.active,
    note: cost.note ?? ""
  };
}

function accountToForm(account: BankAccount): AccountForm {
  return {
    opening_balance: toNumber(account.opening_balance),
    opening_date: account.opening_date ?? ""
  };
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManageFinance = user ? can(user.role, "finance.manage") : false;
  const [period, setPeriod] = useState(currentPeriod());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatIfLines, setWhatIfLines] = useState<WhatIfLine[]>([{ business_id: null, count: 1 }]);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [newCost, setNewCost] = useState<CostForm>({
    label: "",
    amount: null,
    currency: "SGD",
    due_day: null,
    active: true,
    note: ""
  });
  const [costForms, setCostForms] = useState<Record<string, CostForm>>({});
  const [accountForms, setAccountForms] = useState<Record<string, AccountForm>>({});

  const overviewQuery = useQuery({
    queryKey: [...dashboardQueryKey, "overview", period],
    queryFn: () => getDashboardOverview(period)
  });
  const calendarQuery = useQuery({
    queryKey: [...dashboardQueryKey, "payment-calendar", selectedCompanyId, period],
    queryFn: () => getPaymentCalendar({ company_id: selectedCompanyId, period })
  });
  const receivablesQuery = useQuery({
    queryKey: [...dashboardQueryKey, "receivables", selectedCompanyId],
    queryFn: () => getReceivables({ company_id: selectedCompanyId })
  });
  const kpiQuery = useQuery({
    queryKey: [...dashboardQueryKey, "kpi", selectedCompanyId, period],
    queryFn: () => getDashboardKpi({ company_id: selectedCompanyId, period })
  });
  const businessesQuery = useQuery({
    queryKey: ["businesses", selectedCompanyId],
    queryFn: () => listBusinesses({ company_id: selectedCompanyId }),
    enabled: Boolean(selectedCompanyId)
  });
  const recurringCostsQuery = useQuery({
    queryKey: ["finance", "recurring-costs", selectedCompanyId],
    queryFn: () => listRecurringCosts({ company_id: selectedCompanyId }),
    enabled: Boolean(selectedCompanyId)
  });
  const accountsQuery = useQuery({
    queryKey: ["finance", "bank-accounts", selectedCompanyId],
    queryFn: () => listBankAccounts({ company_id: selectedCompanyId }),
    enabled: Boolean(selectedCompanyId)
  });

  const overview = overviewQuery.data;
  const companies = overview?.companies ?? [];
  const selectedCompany = companies.find((company) => company.company_id === selectedCompanyId) ?? null;
  const selectedLabel = selectedCompany?.name ?? t("dashboard.scope.global");
  const businesses = businessesQuery.data?.businesses ?? [];
  const recurringCosts = recurringCostsQuery.data?.recurring_costs ?? [];
  const accounts = accountsQuery.data?.bank_accounts ?? [];
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));
  const businessOptions = businesses.map((business) => ({
    value: business.id,
    label: business.name_en ? `${business.code} - ${business.name} / ${business.name_en}` : `${business.code} - ${business.name}`
  }));
  const hasOpeningBalance = accounts.some((account) => toNumber(account.opening_balance) !== 0 || account.opening_date);
  const loadError = overviewQuery.error ?? calendarQuery.error ?? receivablesQuery.error ?? kpiQuery.error;

  useEffect(() => {
    setWhatIfResult(null);
    setWhatIfLines([{ business_id: null, count: 1 }]);
  }, [selectedCompanyId]);

  useEffect(() => {
    setCostForms(Object.fromEntries(recurringCosts.map((cost) => [cost.id, recurringToForm(cost)])));
  }, [recurringCosts]);

  useEffect(() => {
    setAccountForms(Object.fromEntries(accounts.map((account) => [account.id, accountToForm(account)])));
  }, [accounts]);

  const whatIfItems = useMemo(
    () =>
      whatIfLines
        .filter((line): line is { business_id: string; count: number } => Boolean(line.business_id) && toNumber(line.count) > 0)
        .map((line) => ({ business_id: line.business_id, count: Math.trunc(toNumber(line.count)) })),
    [whatIfLines]
  );

  const refreshDashboard = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["finance", "recurring-costs"] }),
      queryClient.invalidateQueries({ queryKey: ["finance", "bank-accounts"] })
    ]);
  };

  const whatIfMutation = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId) {
        throw new Error("company_required");
      }
      return runWhatIf({ company_id: selectedCompanyId, items: whatIfItems });
    },
    onSuccess: setWhatIfResult
  });

  const createCostMutation = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId || !newCost.label.trim() || newCost.amount === null || newCost.due_day === null) {
        throw new Error("required");
      }
      return createRecurringCost({
        company_id: selectedCompanyId,
        label: newCost.label.trim(),
        amount: newCost.amount,
        currency: newCost.currency,
        due_day: newCost.due_day,
        active: newCost.active,
        note: newCost.note.trim() || null
      });
    },
    onSuccess: async () => {
      setNewCost({ label: "", amount: null, currency: "SGD", due_day: null, active: true, note: "" });
      await refreshDashboard();
    }
  });

  const updateCostMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: CostForm }) =>
      updateRecurringCost(id, {
        label: form.label.trim(),
        amount: form.amount ?? 0,
        currency: form.currency,
        due_day: form.due_day ?? 1,
        active: form.active,
        note: form.note.trim() || null
      }),
    onSuccess: refreshDashboard
  });

  const deleteCostMutation = useMutation({
    mutationFn: deleteRecurringCost,
    onSuccess: refreshDashboard
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: AccountForm }) =>
      updateBankAccount(id, {
        opening_balance: form.opening_balance ?? 0,
        opening_date: form.opening_date || null
      }),
    onSuccess: refreshDashboard
  });

  function setWhatIfLine(index: number, patch: Partial<WhatIfLine>) {
    setWhatIfLines((lines) => lines.map((line, currentIndex) => (currentIndex === index ? { ...line, ...patch } : line)));
    setWhatIfResult(null);
  }

  function setCostForm(id: string, patch: Partial<CostForm>) {
    setCostForms((forms) => ({
      ...forms,
      [id]: {
        label: "",
        amount: null,
        currency: "SGD",
        due_day: null,
        active: true,
        note: "",
        ...forms[id],
        ...patch
      }
    }));
  }

  function setAccountForm(id: string, patch: Partial<AccountForm>) {
    setAccountForms((forms) => ({
      ...forms,
      [id]: {
        opening_balance: null,
        opening_date: "",
        ...forms[id],
        ...patch
      }
    }));
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={2}>{t("dashboard.title")}</Title>
          <Text size="sm" c="dimmed">
            {t("dashboard.subtitle")}
          </Text>
        </Stack>
        <TextInput
          type="month"
          label={t("dashboard.fields.month")}
          value={period}
          onChange={(event) => setPeriod(event.currentTarget.value || currentPeriod())}
        />
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder p="md">
        {overviewQuery.isLoading ? (
          <Loader size="sm" />
        ) : overview ? (
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Text fw={700}>{t("dashboard.globalBar.title")}</Text>
                <Text size="sm" c="dimmed">
                  {t("dashboard.globalBar.asOf", {
                    day: overview.as_of_day,
                    days: overview.days_in_month
                  })}
                </Text>
              </Stack>
              <Badge variant="light">{overview.period}</Badge>
            </Group>
            <Progress value={percent(overview.time_progress)} />
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
              <Stack gap={2}>
                <Text size="sm" c="dimmed">
                  {t("dashboard.metrics.cash")}
                </Text>
                <Text fw={700} size="xl">
                  {money(overview.global.cash)}
                </Text>
              </Stack>
              <Stack gap={2}>
                <Text size="sm" c="dimmed">
                  {t("dashboard.metrics.projectedPl")}
                </Text>
                <Text fw={700} size="xl" c={plColor(overview.global.projected_pl)}>
                  {money(overview.global.projected_pl)}
                </Text>
              </Stack>
              <Stack gap={2}>
                <Text size="sm" c="dimmed">
                  {t("dashboard.metrics.receivable")}
                </Text>
                <Text fw={700} size="xl">
                  {money(overview.global.receivable_total)}
                </Text>
              </Stack>
              <Stack gap={2}>
                <Text size="sm" c="dimmed">
                  {t("dashboard.metrics.fixedCost")}
                </Text>
                <Text fw={700} size="xl">
                  {money(overview.global.fixed_cost)}
                </Text>
              </Stack>
            </SimpleGrid>
          </Stack>
        ) : null}
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {companies.map((company) => (
          <Card
            key={company.company_id}
            withBorder
            radius="md"
            p="md"
            style={{ cursor: "pointer" }}
            bd={selectedCompanyId === company.company_id ? "1px solid var(--mantine-color-blue-5)" : undefined}
            onClick={() => setSelectedCompanyId(company.company_id)}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Text fw={700}>{company.name}</Text>
                <Group gap="xs">
                  <Badge color={healthColor(company.health)}>{t(`dashboard.health.${company.health}`)}</Badge>
                  {company.tense ? <Badge color="orange">{t("dashboard.health.tense")}</Badge> : null}
                </Group>
              </Group>
              <SimpleGrid cols={2}>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed">
                    {t("dashboard.metrics.cash")}
                  </Text>
                  <Text fw={700} size="lg">
                    {money(company.cash)}
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed">
                    {t("dashboard.metrics.projectedPl")}
                  </Text>
                  <Text fw={700} size="lg" c={plColor(company.projected_pl)}>
                    {money(company.projected_pl)}
                  </Text>
                </Stack>
              </SimpleGrid>
              <Stack gap={4}>
                <Group justify="space-between">
                  <Text size="sm">{t("dashboard.progress.income")}</Text>
                  <Text size="sm" c={company.behind ? "red" : "dimmed"}>
                    {company.income_progress === null
                      ? t("dashboard.empty.noTarget")
                      : `${percent(company.income_progress)}%${company.behind ? ` · ${t("dashboard.progress.behind")}` : ""}`}
                  </Text>
                </Group>
                <Progress value={company.income_progress === null ? 0 : percent(company.income_progress)} color={company.behind ? "red" : "green"} />
                <Group justify="space-between">
                  <Text size="sm">{t("dashboard.progress.time")}</Text>
                  <Text size="sm" c="dimmed">
                    {percent(overview?.time_progress)}%
                  </Text>
                </Group>
                <Progress value={percent(overview?.time_progress)} color="blue" />
              </Stack>
              <Divider />
              <SimpleGrid cols={3}>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    {t("dashboard.metrics.fixedCost")}
                  </Text>
                  <Text size="sm" fw={600}>
                    {money(company.fixed_cost)}
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    {t("dashboard.metrics.receivable")}
                  </Text>
                  <Text size="sm" fw={600}>
                    {money(company.receivable_total)}
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    {t("dashboard.metrics.upcoming")}
                  </Text>
                  <Text size="sm" fw={600}>
                    {money(company.upcoming_payments_total)}
                  </Text>
                </Stack>
              </SimpleGrid>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      {companies.length === 0 && !overviewQuery.isLoading ? (
        <Paper withBorder p="md">
          <Text c="dimmed">{t("dashboard.empty.noCompanies")}</Text>
        </Paper>
      ) : null}

      <Group justify="space-between">
        <Group>
          <Button variant={selectedCompanyId === null ? "filled" : "light"} onClick={() => setSelectedCompanyId(null)}>
            {t("dashboard.scope.global")}
          </Button>
          {selectedCompany ? <Badge size="lg">{selectedCompany.name}</Badge> : null}
        </Group>
        <Button variant="light" onClick={() => setSettingsOpen((value) => !value)} disabled={!selectedCompanyId}>
          {settingsOpen ? t("common.collapse") : t("dashboard.settings.title")}
        </Button>
      </Group>

      <Collapse in={settingsOpen && Boolean(selectedCompanyId)}>
        <Paper withBorder p="md">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={700}>{t("dashboard.settings.title")}</Text>
                <Text size="sm" c="dimmed">
                  {t("dashboard.settings.hint")}
                </Text>
              </Stack>
              {!canManageFinance ? <Badge color="gray">{t("dashboard.settings.readonly")}</Badge> : null}
            </Group>

            <Stack gap="sm">
              <Text fw={600}>{t("dashboard.settings.recurringCosts")}</Text>
              <SimpleGrid cols={{ base: 1, md: 6 }}>
                <TextInput
                  label={t("dashboard.fields.label")}
                  value={newCost.label}
                  onChange={(event) => setNewCost((form) => ({ ...form, label: event.currentTarget.value }))}
                  disabled={!canManageFinance}
                />
                <NumberInput
                  label={t("dashboard.fields.amount")}
                  value={newCost.amount ?? ""}
                  onChange={(value) => setNewCost((form) => ({ ...form, amount: typeof value === "number" ? value : null }))}
                  min={0}
                  disabled={!canManageFinance}
                />
                <Select
                  label={t("dashboard.fields.currency")}
                  data={currencyOptions}
                  value={newCost.currency}
                  onChange={(value) => setNewCost((form) => ({ ...form, currency: (value as Currency | null) ?? "SGD" }))}
                  disabled={!canManageFinance}
                />
                <NumberInput
                  label={t("dashboard.fields.dueDay")}
                  value={newCost.due_day ?? ""}
                  onChange={(value) => setNewCost((form) => ({ ...form, due_day: typeof value === "number" ? value : null }))}
                  min={1}
                  max={28}
                  disabled={!canManageFinance}
                />
                <TextInput
                  label={t("dashboard.fields.note")}
                  value={newCost.note}
                  onChange={(event) => setNewCost((form) => ({ ...form, note: event.currentTarget.value }))}
                  disabled={!canManageFinance}
                />
                <Button
                  mt={24}
                  onClick={() => createCostMutation.mutate()}
                  loading={createCostMutation.isPending}
                  disabled={!canManageFinance || !newCost.label.trim() || newCost.amount === null || newCost.due_day === null}
                >
                  {t("dashboard.settings.addCost")}
                </Button>
              </SimpleGrid>
              <ScrollArea>
                <Table striped highlightOnHover miw={900}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("dashboard.fields.label")}</Table.Th>
                      <Table.Th>{t("dashboard.fields.amount")}</Table.Th>
                      <Table.Th>{t("dashboard.fields.currency")}</Table.Th>
                      <Table.Th>{t("dashboard.fields.dueDay")}</Table.Th>
                      <Table.Th>{t("dashboard.fields.active")}</Table.Th>
                      <Table.Th>{t("dashboard.fields.note")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {recurringCosts.map((cost) => {
                      const form = costForms[cost.id] ?? recurringToForm(cost);
                      return (
                        <Table.Tr key={cost.id}>
                          <Table.Td>
                            <TextInput value={form.label} onChange={(event) => setCostForm(cost.id, { label: event.currentTarget.value })} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <NumberInput value={form.amount ?? ""} onChange={(value) => setCostForm(cost.id, { amount: typeof value === "number" ? value : null })} min={0} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <Select data={currencyOptions} value={form.currency} onChange={(value) => setCostForm(cost.id, { currency: (value as Currency | null) ?? "SGD" })} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <NumberInput value={form.due_day ?? ""} onChange={(value) => setCostForm(cost.id, { due_day: typeof value === "number" ? value : null })} min={1} max={28} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <Switch checked={form.active} onChange={(event) => setCostForm(cost.id, { active: event.currentTarget.checked })} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <TextInput value={form.note} onChange={(event) => setCostForm(cost.id, { note: event.currentTarget.value })} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Button size="xs" variant="light" onClick={() => updateCostMutation.mutate({ id: cost.id, form })} loading={updateCostMutation.isPending} disabled={!canManageFinance}>
                                {t("common.save")}
                              </Button>
                              <Button size="xs" color="red" variant="light" onClick={() => deleteCostMutation.mutate(cost.id)} loading={deleteCostMutation.isPending} disabled={!canManageFinance}>
                                {t("common.delete")}
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                    {recurringCosts.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text c="dimmed" ta="center">
                            {t("dashboard.empty.noRecurringCosts")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>

            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600}>{t("dashboard.settings.openingBalances")}</Text>
                {!hasOpeningBalance ? <Badge color="yellow">{t("dashboard.empty.noOpeningBalance")}</Badge> : null}
              </Group>
              <ScrollArea>
                <Table striped highlightOnHover miw={760}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("dashboard.fields.account")}</Table.Th>
                      <Table.Th>{t("dashboard.fields.openingBalance")}</Table.Th>
                      <Table.Th>{t("dashboard.fields.openingDate")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {accounts.map((account) => {
                      const form = accountForms[account.id] ?? accountToForm(account);
                      return (
                        <Table.Tr key={account.id}>
                          <Table.Td>
                            <Text fw={600}>{account.name}</Text>
                            <Text size="xs" c="dimmed">
                              {account.bank_name ?? account.currency}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <NumberInput value={form.opening_balance ?? ""} onChange={(value) => setAccountForm(account.id, { opening_balance: typeof value === "number" ? value : null })} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <TextInput type="date" value={form.opening_date} onChange={(event) => setAccountForm(account.id, { opening_date: event.currentTarget.value })} disabled={!canManageFinance} />
                          </Table.Td>
                          <Table.Td>
                            <Button size="xs" variant="light" onClick={() => updateAccountMutation.mutate({ id: account.id, form })} loading={updateAccountMutation.isPending} disabled={!canManageFinance}>
                              {t("common.save")}
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                    {accounts.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text c="dimmed" ta="center">
                            {t("dashboard.empty.noAccounts")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Stack>
        </Paper>
      </Collapse>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>{t("dashboard.paymentCalendar.title", { scope: selectedLabel })}</Text>
              <Badge variant="light">{money(calendarQuery.data?.remaining_from_today)}</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              {t("dashboard.paymentCalendar.total", { total: money(calendarQuery.data?.total), remaining: money(calendarQuery.data?.remaining_from_today) })}
            </Text>
            {calendarQuery.isLoading ? <Loader size="sm" /> : null}
            <Stack gap="xs">
              {(calendarQuery.data?.rows ?? []).map((row) => (
                <Group key={`${row.date}-${row.label}-${row.amount}`} justify="space-between" align="flex-start">
                  <Stack gap={0}>
                    <Text fw={600}>{dateLabel(row.date)}</Text>
                    <Group gap="xs">
                      <Badge color={row.type === "payroll" ? "blue" : "grape"} variant="light">
                        {t(`dashboard.paymentCalendar.type.${row.type}`)}
                      </Badge>
                      <Text size="sm">{row.label}</Text>
                    </Group>
                  </Stack>
                  <Text fw={700}>{money(row.amount, row.currency)}</Text>
                </Group>
              ))}
              {(calendarQuery.data?.rows ?? []).length === 0 && !calendarQuery.isLoading ? (
                <Text c="dimmed">{t("dashboard.empty.noPayments")}</Text>
              ) : null}
            </Stack>
          </Stack>
        </Paper>

        <Paper withBorder p="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>{t("dashboard.receivables.title", { scope: selectedLabel })}</Text>
              <Button component={Link} to="/education/academy-collection" size="xs" variant="light">
                {t("dashboard.receivables.goAcademy")}
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              {t("dashboard.receivables.total", { total: money(receivablesQuery.data?.total) })}
            </Text>
            <ScrollArea>
              <Table striped highlightOnHover miw={720}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("dashboard.fields.source")}</Table.Th>
                    <Table.Th>{t("dashboard.fields.studentOrClient")}</Table.Th>
                    <Table.Th>{t("dashboard.fields.periodOrRef")}</Table.Th>
                    <Table.Th>{t("dashboard.fields.amount")}</Table.Th>
                    <Table.Th>{t("dashboard.fields.overdueMonths")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(receivablesQuery.data?.rows ?? []).map((row) => (
                    <Table.Tr key={`${row.source}-${row.student_or_client}-${row.period_or_ref}`}>
                      <Table.Td>{row.source}</Table.Td>
                      <Table.Td>{row.student_or_client}</Table.Td>
                      <Table.Td>{row.period_or_ref}</Table.Td>
                      <Table.Td>{money(row.amount)}</Table.Td>
                      <Table.Td>
                        <Badge color={toNumber(row.overdue_months) > 0 ? "red" : "gray"} variant="light">
                          {row.overdue_months ?? 0}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {(receivablesQuery.data?.rows ?? []).length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <Text c="dimmed" ta="center">
                          {t("dashboard.empty.noReceivables")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : null}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Text fw={700}>{t("dashboard.kpi.title", { scope: selectedLabel })}</Text>
            {(kpiQuery.data ?? []).map((row) => {
              const gap = row.gap_units ?? row.gap_students ?? 0;
              const breakeven = row.breakeven_units ?? row.breakeven_students ?? 0;
              const hasStudentTarget = row.breakeven_students !== undefined && row.breakeven_students !== null;
              const kpiText = hasStudentTarget
                ? t("dashboard.kpi.studentGap", { breakeven, gap })
                : t("dashboard.kpi.unitGap", { breakeven, gap });
              return (
                <Card key={`${row.scope}-${row.id}`} withBorder radius="md" p="sm">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={600}>{row.name}</Text>
                      <Badge color={row.scope === "company" ? "blue" : gap > 0 ? "orange" : "green"} variant="light">
                        {t(`dashboard.kpi.scope.${row.scope}`)}
                      </Badge>
                    </Group>
                    {row.scope === "company" ? (
                      <Text>
                        {t("dashboard.kpi.companyBreakeven", { amount: money(row.fixed_cost_share) })}
                      </Text>
                    ) : gap > 0 ? (
                      <Text c="orange">{kpiText}</Text>
                    ) : (
                      <Text>{kpiText}</Text>
                    )}
                    {row.scope === "business" && row.per_unit_profit ? (
                      <Text size="sm" c="dimmed">
                        {t("dashboard.kpi.unitBasis", { profit: row.per_unit_profit })}
                      </Text>
                    ) : null}
                  </Stack>
                </Card>
              );
            })}
            {(kpiQuery.data ?? []).length === 0 && !kpiQuery.isLoading ? <Text c="dimmed">{t("dashboard.empty.noKpi")}</Text> : null}
            {kpiQuery.isLoading ? <Loader size="sm" /> : null}
          </Stack>
        </Paper>

        <Paper withBorder p="md">
          <Stack gap="sm">
            <Text fw={700}>{t("dashboard.whatIf.title")}</Text>
            <Text size="sm" c="dimmed">
              {selectedCompanyId ? t("dashboard.whatIf.hint") : t("dashboard.whatIf.selectCompany")}
            </Text>
            {whatIfLines.map((line, index) => (
              <SimpleGrid key={index} cols={{ base: 1, sm: 3 }}>
                <Select
                  label={t("dashboard.fields.business")}
                  data={businessOptions}
                  value={line.business_id}
                  onChange={(value) => setWhatIfLine(index, { business_id: value })}
                  disabled={!selectedCompanyId}
                  searchable
                />
                <NumberInput
                  label={t("dashboard.fields.count")}
                  value={line.count ?? ""}
                  onChange={(value) => setWhatIfLine(index, { count: typeof value === "number" ? value : null })}
                  min={0}
                  disabled={!selectedCompanyId}
                />
                <Button
                  mt={24}
                  variant="subtle"
                  color="red"
                  disabled={whatIfLines.length === 1}
                  onClick={() => setWhatIfLines((lines) => lines.filter((_, currentIndex) => currentIndex !== index))}
                >
                  {t("common.delete")}
                </Button>
              </SimpleGrid>
            ))}
            <Group>
              <Button variant="light" onClick={() => setWhatIfLines((lines) => [...lines, { business_id: null, count: 1 }])} disabled={!selectedCompanyId}>
                {t("dashboard.whatIf.addLine")}
              </Button>
              <Button onClick={() => whatIfMutation.mutate()} loading={whatIfMutation.isPending} disabled={!selectedCompanyId || whatIfItems.length === 0}>
                {t("dashboard.whatIf.calculate")}
              </Button>
            </Group>
            {whatIfResult ? (
              <Paper withBorder p="md" bg="green.0">
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {t("dashboard.whatIf.cash")}
                    </Text>
                    <Text fw={700}>
                      {money(whatIfResult.cash_before)} → {money(whatIfResult.cash_after)}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {t("dashboard.whatIf.projectedPl")}
                    </Text>
                    <Text fw={700}>
                      {money(whatIfResult.projected_pl_before)} → {money(whatIfResult.projected_pl_after)}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {t("dashboard.whatIf.addedProfit")}
                    </Text>
                    <Text fw={700} c="green">
                      +{money(whatIfResult.added_profit)}
                    </Text>
                  </Stack>
                </SimpleGrid>
              </Paper>
            ) : null}
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
