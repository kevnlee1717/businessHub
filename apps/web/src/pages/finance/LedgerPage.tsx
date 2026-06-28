import {
  Alert,
  Badge,
  Button,
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
import { currencies, ledgerDirections, type Currency, type LedgerDirection } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../api/client";
import { listBusinesses } from "../../api/businessSchemes";
import { listCompanies } from "../../api/hr";
import {
  createLedgerEntry,
  ignoreLedgerEntry,
  listBankAccounts,
  listExpenseCategories,
  listLedger,
  listProofMissing,
  uploadProofDocument,
  type LedgerEntry
} from "../../api/ledger";

type LedgerForm = {
  direction: LedgerDirection;
  amount: number | null;
  currency: Currency;
  fx_rate: number | null;
  bank_account_id: string | null;
  occurred_at: string;
  business_id: string | null;
  expense_category_id: string | null;
  counterparty: string;
  note: string;
  proof_files: File[];
};

const defaultForm: LedgerForm = {
  direction: "in",
  amount: null,
  currency: "SGD",
  fx_rate: null,
  bank_account_id: null,
  occurred_at: "",
  business_id: null,
  expense_category_id: null,
  counterparty: "",
  note: "",
  proof_files: []
};

function companyLabel(company: { name: string; name_en?: string | null }) {
  return company.name_en ? `${company.name} / ${company.name_en}` : company.name;
}

function businessLabel(business: { code: string; name: string; name_en?: string | null }) {
  return business.name_en ? `${business.code} - ${business.name} / ${business.name_en}` : `${business.code} - ${business.name}`;
}

function displayDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function displayMoney(amount?: string | null, currency?: string | null) {
  return `${Number(amount ?? 0).toFixed(2)} ${currency ?? ""}`.trim();
}

function toDateTimeLocal(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function errorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : "unknown_error";
  const key = `finance.errors.${message}`;
  const translated = t(key);
  return translated === key ? message : translated;
}

function directionColor(direction: LedgerDirection) {
  return direction === "in" ? "green" : "red";
}

function statusColor(status: string) {
  switch (status) {
    case "reconciled":
      return "green";
    case "ignored":
      return "gray";
    default:
      return "yellow";
  }
}

export function LedgerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [opened, setOpened] = useState(false);
  const [proofModalEntry, setProofModalEntry] = useState<LedgerEntry | null>(null);
  const [form, setForm] = useState<LedgerForm>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);

  const companiesQuery = useQuery({ queryKey: ["hr", "companies"], queryFn: listCompanies });
  const accountsQuery = useQuery({
    queryKey: ["finance", "bank-accounts", companyId],
    queryFn: () => listBankAccounts({ company_id: companyId }),
    enabled: Boolean(companyId)
  });
  const categoriesQuery = useQuery({ queryKey: ["finance", "expense-categories"], queryFn: listExpenseCategories });
  const businessesQuery = useQuery({
    queryKey: ["businesses", companyId],
    queryFn: () => listBusinesses({ company_id: companyId }),
    enabled: Boolean(companyId)
  });
  const ledgerQuery = useQuery({
    queryKey: ["finance", "ledger", companyId, bankAccountId, direction, businessId, categoryId, from, to, missingOnly],
    queryFn: () =>
      listLedger({
        company_id: companyId,
        bank_account_id: bankAccountId,
        direction: direction as LedgerDirection | null,
        business_id: businessId,
        expense_category_id: categoryId,
        from,
        to
      }),
    enabled: Boolean(companyId)
  });
  const proofMissingQuery = useQuery({
    queryKey: ["finance", "ledger", "proof-missing", companyId],
    queryFn: () => listProofMissing(companyId ?? ""),
    enabled: Boolean(companyId)
  });

  const companies = companiesQuery.data?.companies ?? [];
  const accounts = accountsQuery.data?.bank_accounts ?? [];
  const categories = categoriesQuery.data?.expense_categories ?? [];
  const businesses = businessesQuery.data?.businesses ?? [];
  const proofMissingIds = useMemo(
    () => new Set((proofMissingQuery.data?.rows ?? []).map((row) => row.id)),
    [proofMissingQuery.data?.rows]
  );
  const rows = (ledgerQuery.data?.rows ?? []).filter((row) => !missingOnly || proofMissingIds.has(row.id));

  useEffect(() => {
    if (!companyId && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const companyOptions = companies.map((company) => ({ value: company.id, label: companyLabel(company) }));
  const accountOptions = accounts.map((account) => ({ value: account.id, label: account.name }));
  const categoryOptions = categories
    .filter((category) => category.active)
    .map((category) => ({ value: category.id, label: category.name }));
  const businessOptions = businesses.map((business) => ({ value: business.id, label: businessLabel(business) }));
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));
  const directionOptions = ledgerDirections.map((item) => ({ value: item, label: t(`finance.direction.${item}`) }));
  const filterDirectionOptions = [{ value: "all", label: t("common.all") }, ...directionOptions];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || form.amount === null || !form.occurred_at || form.proof_files.length === 0) {
        throw new Error("proof_required");
      }

      const uploaded = [];
      for (const file of form.proof_files) {
        uploaded.push(await uploadProofDocument(file));
      }

      return createLedgerEntry({
        company_id: companyId,
        bank_account_id: form.bank_account_id,
        direction: form.direction,
        amount: form.amount,
        currency: form.currency,
        fx_rate: form.currency === "SGD" ? null : form.fx_rate,
        occurred_at: toIsoDateTime(form.occurred_at),
        business_id: form.direction === "in" ? form.business_id : null,
        expense_category_id: form.direction === "out" ? form.expense_category_id : null,
        counterparty: nullableText(form.counterparty),
        proof_document_ids: uploaded.map((document) => document.id),
        note: nullableText(form.note)
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance", "ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "bank-accounts"] })
      ]);
      closeCreateModal();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });

  const ignoreMutation = useMutation({
    mutationFn: ignoreLedgerEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "ledger"] })
  });

  function openCreateModal() {
    setForm({
      ...defaultForm,
      bank_account_id: bankAccountId,
      occurred_at: toDateTimeLocal()
    });
    setFormError(null);
    setOpened(true);
  }

  function closeCreateModal() {
    setOpened(false);
    setFormError(null);
  }

  const missingCount = proofMissingQuery.data?.rows.length ?? 0;
  const submitDisabled =
    !companyId ||
    form.amount === null ||
    !form.occurred_at ||
    form.proof_files.length === 0 ||
    (form.direction === "in" && !form.business_id) ||
    (form.direction === "out" && !form.expense_category_id) ||
    (form.currency !== "SGD" && form.fx_rate === null);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Button onClick={openCreateModal}>{t("finance.ledger.add")}</Button>
      </Group>

      {missingCount > 0 ? (
        <Alert color="red" title={t("finance.ledger.proofMissingTitle", { count: missingCount })}>
          <Group justify="space-between">
            <Text size="sm">{t("finance.ledger.proofMissingHint")}</Text>
            <Button size="xs" color="red" variant="light" onClick={() => setMissingOnly(true)}>
              {t("finance.ledger.filterMissing")}
            </Button>
          </Group>
        </Alert>
      ) : null}

      <Paper withBorder p="md">
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          <Select label={t("finance.fields.company")} data={companyOptions} value={companyId} onChange={setCompanyId} searchable />
          <Select
            label={t("finance.fields.bankAccount")}
            data={accountOptions}
            value={bankAccountId}
            onChange={setBankAccountId}
            clearable
            searchable
          />
          <Select
            label={t("finance.fields.direction")}
            data={filterDirectionOptions}
            value={direction ?? "all"}
            onChange={(value) => setDirection(value === "all" ? null : value)}
          />
          <Select
            label={t("finance.fields.expenseCategory")}
            data={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            clearable
            searchable
          />
          <Select
            label={t("finance.fields.business")}
            data={businessOptions}
            value={businessId}
            onChange={setBusinessId}
            clearable
            searchable
          />
          <TextInput label={t("finance.fields.from")} type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
          <TextInput label={t("finance.fields.to")} type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
          <Button variant={missingOnly ? "filled" : "light"} mt={24} onClick={() => setMissingOnly((value) => !value)}>
            {t("finance.ledger.missingOnly")}
          </Button>
        </SimpleGrid>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">{t("finance.ledger.totalIn")}</Text>
          <Text fw={700} size="xl">{Number(ledgerQuery.data?.totals.in_sgd ?? 0).toFixed(2)}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">{t("finance.ledger.totalOut")}</Text>
          <Text fw={700} size="xl">{Number(ledgerQuery.data?.totals.out_sgd ?? 0).toFixed(2)}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">{t("finance.ledger.net")}</Text>
          <Text fw={700} size="xl">{Number(ledgerQuery.data?.totals.net_sgd ?? 0).toFixed(2)}</Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder>
        <ScrollArea>
          <Table withTableBorder withColumnBorders highlightOnHover miw={1100}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("finance.fields.date")}</Table.Th>
                <Table.Th>{t("finance.fields.direction")}</Table.Th>
                <Table.Th>{t("finance.fields.amount")}</Table.Th>
                <Table.Th>{t("finance.fields.relatedTo")}</Table.Th>
                <Table.Th>{t("finance.fields.counterparty")}</Table.Th>
                <Table.Th>{t("finance.fields.proof")}</Table.Th>
                <Table.Th>{t("finance.fields.reconcileStatus")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>{displayDate(row.occurred_at)}</Table.Td>
                  <Table.Td>
                    <Badge color={directionColor(row.direction)}>{t(`finance.direction.${row.direction}`)}</Badge>
                  </Table.Td>
                  <Table.Td>{displayMoney(row.amount, row.currency)}</Table.Td>
                  <Table.Td>
                    {row.direction === "in"
                      ? row.business_name ?? row.business?.name ?? row.business_id ?? "-"
                      : row.expense_category_name ?? row.category?.name ?? row.expense_category_id ?? "-"}
                  </Table.Td>
                  <Table.Td>{row.counterparty || "-"}</Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="subtle" onClick={() => setProofModalEntry(row)}>
                      {t("finance.ledger.proofCount", { count: row.proof_document_ids.length })}
                    </Button>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(row.reconcile_status)}>{t(`finance.reconcileStatus.${row.reconcile_status}`)}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={row.reconcile_status === "ignored"}
                      loading={ignoreMutation.isPending}
                      onClick={() => ignoreMutation.mutate(row.id)}
                    >
                      {t("finance.ledger.ignore")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" ta="center" py="lg">{t("finance.ledger.empty")}</Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal opened={opened} onClose={closeCreateModal} title={t("finance.ledger.add")} size="lg">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Select
              label={t("finance.fields.direction")}
              data={directionOptions}
              value={form.direction}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  direction: (value as LedgerDirection | null) ?? "in",
                  business_id: null,
                  expense_category_id: null
                }))
              }
              required
            />
            <NumberInput
              label={t("finance.fields.amount")}
              value={form.amount ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, amount: typeof value === "number" ? value : null }))}
              required
              min={0}
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
                required
                min={0}
              />
            ) : null}
            <Select
              label={t("finance.fields.bankAccount")}
              data={accountOptions}
              value={form.bank_account_id}
              onChange={(value) => setForm((current) => ({ ...current, bank_account_id: value }))}
              clearable
              searchable
            />
            <TextInput
              label={t("finance.fields.occurredAt")}
              type="datetime-local"
              value={form.occurred_at}
              onChange={(event) => setForm((current) => ({ ...current, occurred_at: event.currentTarget.value }))}
              required
            />
            {form.direction === "in" ? (
              <Select
                label={t("finance.fields.business")}
                data={businessOptions}
                value={form.business_id}
                onChange={(value) => setForm((current) => ({ ...current, business_id: value }))}
                required
                searchable
              />
            ) : (
              <Select
                label={t("finance.fields.expenseCategory")}
                data={categoryOptions}
                value={form.expense_category_id}
                onChange={(value) => setForm((current) => ({ ...current, expense_category_id: value }))}
                required
                searchable
              />
            )}
            <TextInput
              label={t("finance.fields.counterparty")}
              value={form.counterparty}
              onChange={(event) => setForm((current) => ({ ...current, counterparty: event.currentTarget.value }))}
            />
          </SimpleGrid>
          <FileInput
            label={t("finance.fields.proof")}
            description={form.proof_files.length === 0 ? t("finance.ledger.proofRequired") : undefined}
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
            <Button variant="subtle" onClick={closeCreateModal}>{t("common.cancel")}</Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={submitDisabled}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={Boolean(proofModalEntry)} onClose={() => setProofModalEntry(null)} title={t("finance.fields.proof")}>
        <Stack gap="xs">
          {(proofModalEntry?.proof_document_ids ?? []).map((id) => (
            <Text key={id} ff="monospace" size="sm">{id}</Text>
          ))}
          {(proofModalEntry?.proof_document_ids ?? []).length === 0 ? <Text c="dimmed">{t("finance.ledger.noProof")}</Text> : null}
        </Stack>
      </Modal>
    </Stack>
  );
}
