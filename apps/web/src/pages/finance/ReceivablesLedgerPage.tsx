import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { currencies, type Currency } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listBusinesses } from "../../api/businessSchemes";
import { ApiError } from "../../api/client";
import { collectChargeWithProofs, listCharges, type Charge, type ChargeStatus } from "../../api/charges";
import { listCompanies } from "../../api/hr";
import { listBankAccounts } from "../../api/ledger";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type CollectForm = {
  paid_amount: number | null;
  currency: Currency;
  fx_rate: number | null;
  paid_at: string;
  bank_account_id: string | null;
  proof_files: File[];
  note: string;
};

const defaultForm: CollectForm = {
  paid_amount: null,
  currency: "SGD",
  fx_rate: null,
  paid_at: "",
  bank_account_id: null,
  proof_files: [],
  note: ""
};

function displayMoney(amount?: string | number | null, currency = "SGD") {
  return `${Number(amount ?? 0).toFixed(2)} ${currency}`;
}

function displayDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function toDateTimeLocal(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function companyLabel(company: { name: string; name_en?: string | null }) {
  return company.name_en ? `${company.name} / ${company.name_en}` : company.name;
}

function businessLabel(business: { code: string; name: string; name_en?: string | null }) {
  return business.name_en ? `${business.code} - ${business.name} / ${business.name_en}` : `${business.code} - ${business.name}`;
}

function statusColor(status: ChargeStatus) {
  switch (status) {
    case "paid":
      return "green";
    case "partial":
      return "orange";
    case "waived":
      return "gray";
    default:
      return "gray";
  }
}

function isOverdue(charge: Charge) {
  if (!charge.due_date || charge.status === "paid" || charge.status === "waived") {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(charge.due_date).getTime() < today.getTime();
}

function outstanding(charge: Charge) {
  return Math.max(0, Number(charge.amount_expected) - Number(charge.amount_collected));
}

function errorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : "unknown_error";
  const key = `finance.errors.${message}`;
  const translated = t(key);
  return translated === key ? message : translated;
}

export function ReceivablesLedgerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [collectCharge, setCollectCharge] = useState<Charge | null>(null);
  const [form, setForm] = useState<CollectForm>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const companiesQuery = useQuery({ queryKey: ["hr", "companies"], queryFn: () => listCompanies() });
  const businessesQuery = useQuery({
    queryKey: ["businesses", companyId],
    queryFn: () => listBusinesses({ company_id: companyId }),
    enabled: Boolean(companyId)
  });
  const chargesQuery = useQuery({
    queryKey: ["finance", "charges", "ledger", companyId, businessId, status, period, overdue],
    queryFn: () =>
      listCharges({
        company_id: companyId,
        business_id: businessId,
        status: status as ChargeStatus | null,
        period,
        overdue
      }),
    enabled: Boolean(companyId)
  });
  const accountsQuery = useQuery({
    queryKey: ["finance", "bank-accounts", companyId],
    queryFn: () => listBankAccounts({ company_id: companyId }),
    enabled: Boolean(companyId)
  });

  const companies = companiesQuery.data?.companies ?? [];
  const businesses = businessesQuery.data?.businesses ?? [];
  const charges = chargesQuery.data?.charges ?? [];
  // Totals come from the full filtered receivables ledger, so paginate only after fetching.
  const visibleCharges = charges.slice((page - 1) * pageSize, page * pageSize);
  const totals = chargesQuery.data?.totals;

  useEffect(() => {
    if (!companyId && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const companyOptions = companies.map((company) => ({ value: company.id, label: companyLabel(company) }));
  const businessOptions = businesses.map((business) => ({ value: business.id, label: businessLabel(business) }));
  const statusOptions = [
    { value: "all", label: t("common.all") },
    ...(["pending", "partial", "paid", "waived"] as const).map((item) => ({
      value: item,
      label: t(`chargeStatus.${item}`)
    }))
  ];
  const accountOptions = (accountsQuery.data?.bank_accounts ?? []).map((account) => ({
    value: account.id,
    label: account.name
  }));
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!collectCharge || form.paid_amount === null || !form.paid_at || form.proof_files.length === 0) {
        throw new Error("proof_required");
      }

      return collectChargeWithProofs(collectCharge.id, {
        paid_amount: form.paid_amount,
        currency: form.currency,
        fx_rate: form.currency === "SGD" ? null : form.fx_rate,
        paid_at: toIsoDateTime(form.paid_at),
        bank_account_id: form.bank_account_id,
        proof_files: form.proof_files,
        note: form.note.trim() ? form.note.trim() : null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "charges"] });
      closeCollectModal();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });

  function openCollectModal(charge: Charge) {
    setCollectCharge(charge);
    setForm({
      ...defaultForm,
      paid_amount: outstanding(charge),
      currency: charge.currency,
      paid_at: toDateTimeLocal()
    });
    setFormError(null);
  }

  function closeCollectModal() {
    setCollectCharge(null);
    setForm(defaultForm);
    setFormError(null);
  }

  const submitDisabled =
    form.paid_amount === null ||
    !form.paid_at ||
    form.proof_files.length === 0 ||
    (form.currency !== "SGD" && form.fx_rate === null);

  return (
    <Stack gap="lg">

      {(chargesQuery.error ?? companiesQuery.error ?? businessesQuery.error) ? (
        <Alert color="red" variant="light">
          {(chargesQuery.error ?? companiesQuery.error ?? businessesQuery.error) instanceof Error
            ? (chargesQuery.error ?? companiesQuery.error ?? businessesQuery.error)?.message
            : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder p="md">
        <SimpleGrid cols={{ base: 1, md: 5 }}>
          <Select
            label={t("finance.fields.company")}
            data={companyOptions}
            value={companyId}
            onChange={(value) => {
              setCompanyId(value);
              setPage(1);
            }}
            searchable
          />
          <Select
            label={t("finance.fields.business")}
            data={businessOptions}
            value={businessId}
            onChange={(value) => {
              setBusinessId(value);
              setPage(1);
            }}
            clearable
            searchable
          />
          <Select
            label={t("finance.fields.status")}
            data={statusOptions}
            value={status ?? "all"}
            onChange={(value) => {
              setStatus(value === "all" ? null : value);
              setPage(1);
            }}
          />
          <TextInput
            label={t("chargeSchedule.fields.period")}
            placeholder="2026-06"
            value={period}
            onChange={(event) => {
              setPeriod(event.currentTarget.value);
              setPage(1);
            }}
          />
          <Checkbox
            label={t("receivablesLedger.overdueOnly")}
            checked={overdue}
            onChange={(event) => {
              setOverdue(event.currentTarget.checked);
              setPage(1);
            }}
            mt={30}
          />
        </SimpleGrid>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">{t("chargeSchedule.expected")}</Text>
          <Text fw={700} size="xl">{displayMoney(totals?.expected)}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">{t("chargeSchedule.collected")}</Text>
          <Text fw={700} size="xl">{displayMoney(totals?.collected)}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">{t("chargeSchedule.outstanding")}</Text>
          <Text fw={700} size="xl">{displayMoney(totals?.outstanding)}</Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder>
        <ScrollArea>
          <Table withTableBorder withColumnBorders highlightOnHover miw={1100}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("chargeSchedule.fields.dueDate")}</Table.Th>
                <Table.Th>{t("finance.fields.business")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.label")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.kind")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.expected")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.collected")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.status")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleCharges.map((charge) => {
                const overdueRow = isOverdue(charge);
                return (
                  <Table.Tr key={charge.id} {...(overdueRow ? { bg: "red.0" } : {})}>
                    <Table.Td>
                      <Group gap="xs">
                        <Text {...(overdueRow ? { c: "red" } : {})}>{displayDate(charge.due_date)}</Text>
                        {overdueRow ? (
                          <Badge color="red" variant="light">
                            {t("receivablesLedger.overdue")}
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>{charge.business_name ?? charge.business_id ?? "-"}</Table.Td>
                    <Table.Td>{charge.label}</Table.Td>
                    <Table.Td>{t(`chargeKind.${charge.charge_kind}`)}</Table.Td>
                    <Table.Td>{displayMoney(charge.amount_expected, charge.currency)}</Table.Td>
                    <Table.Td>{displayMoney(charge.amount_collected, charge.currency)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(charge.status)} variant="light">
                        {t(`chargeStatus.${charge.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {charge.status === "pending" || charge.status === "partial" ? (
                        <Button size="xs" variant="light" onClick={() => openCollectModal(charge)}>
                          {t("chargeSchedule.collect")}
                        </Button>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {visibleCharges.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" ta="center" py="lg">
                      {t("receivablesLedger.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <TablePagination
          total={charges.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Paper>

      <Modal opened={Boolean(collectCharge)} onClose={closeCollectModal} title={t("chargeSchedule.collect")} size="lg">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput
              label={t("chargeSchedule.fields.paidAmount")}
              value={form.paid_amount ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, paid_amount: typeof value === "number" ? value : null }))}
              min={0}
              required
            />
            <Select
              label={t("finance.fields.currency")}
              data={currencyOptions}
              value={form.currency}
              onChange={(value) => setForm((current) => ({ ...current, currency: (value as Currency | null) ?? "SGD" }))}
            />
            {form.currency !== "SGD" ? (
              <NumberInput
                label={t("finance.fields.fxRate")}
                value={form.fx_rate ?? ""}
                onChange={(value) => setForm((current) => ({ ...current, fx_rate: typeof value === "number" ? value : null }))}
                min={0}
                required
              />
            ) : null}
            <TextInput
              label={t("chargeSchedule.fields.paidAt")}
              type="datetime-local"
              value={form.paid_at}
              onChange={(event) => setForm((current) => ({ ...current, paid_at: event.currentTarget.value }))}
              required
            />
            <Select
              label={t("finance.fields.bankAccount")}
              data={accountOptions}
              value={form.bank_account_id}
              onChange={(value) => setForm((current) => ({ ...current, bank_account_id: value }))}
              clearable
              searchable
            />
          </SimpleGrid>
          <FileInput
            label={t("finance.fields.proof")}
            value={form.proof_files}
            onChange={(files) => setForm((current) => ({ ...current, proof_files: files }))}
            multiple
            clearable
            required
            error={form.proof_files.length === 0 ? t("finance.ledger.proofRequired") : null}
          />
          <Textarea
            label={t("finance.fields.note")}
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeCollectModal}>{t("common.cancel")}</Button>
            <Button onClick={() => collectMutation.mutate()} loading={collectMutation.isPending} disabled={submitDisabled}>
              {t("chargeSchedule.collect")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
