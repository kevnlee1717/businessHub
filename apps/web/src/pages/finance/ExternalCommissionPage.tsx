import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Loader,
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
import { commissionEntryStatuses, type CommissionEntryStatus } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listBusinesses } from "../../api/businessSchemes";
import { ApiError } from "../../api/client";
import {
  getExternalCommissionSummary,
  listExternalCommissionEntries,
  recomputeExternalCommission,
  settleExternalCommission,
  updateExternalCommission,
  type ExternalCommissionEntry,
  type ExternalCommissionSummaryResponse
} from "../../api/externalCommission";
import { listExternalParties } from "../../api/externalParties";
import { listBankAccounts, uploadProofDocument } from "../../api/ledger";

type SettleForm = {
  amount: number | null;
  bank_account_id: string | null;
  occurred_at: string;
  proof_files: File[];
  note: string;
};

const defaultSettleForm: SettleForm = {
  amount: null,
  bank_account_id: null,
  occurred_at: "",
  proof_files: [],
  note: ""
};

type AmountForm = {
  amount_sgd: number | null;
  note: string;
};

const entriesQueryKey = ["finance", "external-commission", "entries"] as const;
const summaryQueryKey = ["finance", "external-commission", "summary"] as const;

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function businessLabel(business?: { code?: string | null; name: string; name_en?: string | null } | null) {
  if (!business) {
    return "-";
  }

  const name = displayName(business.name, business.name_en);
  return business.code ? `${business.code} · ${name}` : name;
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? String(value) : numberValue.toFixed(2);
}

function statusColor(status: CommissionEntryStatus) {
  switch (status) {
    case "pending":
      return "yellow";
    case "settled":
      return "green";
    case "void":
      return "gray";
    default:
      return "gray";
  }
}

function settlementStatus(entry: { amount_sgd?: string | null; amount?: string | null; amount_settled?: string | null }) {
  const payable = Number(entry.amount_sgd ?? entry.amount ?? 0);
  const settled = Number(entry.amount_settled ?? 0);

  if (settled <= 0) {
    return "pending";
  }
  if (settled < payable) {
    return "partial";
  }
  return "settled";
}

function settlementStatusColor(status: "pending" | "partial" | "settled") {
  switch (status) {
    case "settled":
      return "green";
    case "partial":
      return "yellow";
    default:
      return "gray";
  }
}

function moneyToNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function outstandingAmount(entry: { outstanding?: string | null; amount_sgd?: string | null; amount?: string | null; amount_settled?: string | null }) {
  const outstanding = moneyToNumber(entry.outstanding);
  if (outstanding !== null) {
    return outstanding;
  }

  return Math.max(0, Number(entry.amount_sgd ?? entry.amount ?? 0) - Number(entry.amount_settled ?? 0));
}

function toNumberOrNull(value: string | number) {
  return typeof value === "number" ? value : null;
}

function toDateTimeLocal(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function errorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : "unknown_error";
  const key = `finance.errors.${message}`;
  const translated = t(key);
  return translated === key ? message : translated;
}

function readSummary(data?: ExternalCommissionSummaryResponse) {
  if (!data) {
    return undefined;
  }

  return "summary" in data ? data.summary : data;
}

export function ExternalCommissionPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [payeeFilter, setPayeeFilter] = useState<string | null>(null);
  const [businessFilter, setBusinessFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CommissionEntryStatus | null>(null);
  const [settleEntry, setSettleEntry] = useState<ExternalCommissionEntry | null>(null);
  const [settleForm, setSettleForm] = useState<SettleForm>(defaultSettleForm);
  const [amountEntry, setAmountEntry] = useState<ExternalCommissionEntry | null>(null);
  const [amountForm, setAmountForm] = useState<AmountForm>({ amount_sgd: null, note: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const payeesQuery = useQuery({
    queryKey: ["business-finance", "external-parties"],
    queryFn: listExternalParties
  });
  const businessesQuery = useQuery({
    queryKey: ["business-finance", "businesses"],
    queryFn: () => listBusinesses()
  });
  const accountsQuery = useQuery({
    queryKey: ["finance", "bank-accounts"],
    queryFn: () => listBankAccounts()
  });
  const summaryQuery = useQuery({
    queryKey: summaryQueryKey,
    queryFn: getExternalCommissionSummary
  });
  const entriesQuery = useQuery({
    queryKey: [...entriesQueryKey, payeeFilter, businessFilter, statusFilter],
    queryFn: () =>
      listExternalCommissionEntries({
        payee_id: payeeFilter,
        business_id: businessFilter,
        status: statusFilter
      })
  });

  const payees = payeesQuery.data?.external_parties ?? [];
  const businesses = businessesQuery.data?.businesses ?? [];
  const accounts = accountsQuery.data?.bank_accounts ?? [];
  const entries = entriesQuery.data?.entries ?? [];
  const summary = readSummary(summaryQuery.data);
  const loadError = payeesQuery.error ?? businessesQuery.error ?? accountsQuery.error ?? entriesQuery.error ?? summaryQuery.error;

  const payeeOptions = payees.map((party) => ({
    value: party.id,
    label: displayName(party.name, party.name_en)
  }));
  const businessOptions = businesses.map((business) => ({
    value: business.id,
    label: businessLabel(business)
  }));
  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.name
  }));
  const statusOptions = commissionEntryStatuses.map((status) => ({
    value: status,
    label: t(`externalCommission.status.${status}`)
  }));

  const recomputeMutation = useMutation({
    mutationFn: recomputeExternalCommission,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entriesQueryKey }),
        queryClient.invalidateQueries({ queryKey: summaryQueryKey })
      ]);
    }
  });
  const settleMutation = useMutation({
    mutationFn: async () => {
      if (!settleEntry || settleForm.proof_files.length === 0) {
        throw new Error("proof_required");
      }

      const uploaded = [];
      for (const file of settleForm.proof_files) {
        uploaded.push(await uploadProofDocument(file));
      }

      return settleExternalCommission(settleEntry.entry.id, {
        amount: settleForm.amount,
        bank_account_id: settleForm.bank_account_id,
        occurred_at: toIsoDateTime(settleForm.occurred_at),
        proof_document_ids: uploaded.map((document) => document.id),
        note: settleForm.note.trim() || null
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entriesQueryKey }),
        queryClient.invalidateQueries({ queryKey: summaryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["finance", "ledger"] })
      ]);
      closeSettleModal();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });
  const updateAmountMutation = useMutation({
    mutationFn: () => {
      if (!amountEntry || amountForm.amount_sgd === null) {
        throw new Error("missing_required_fields");
      }

      return updateExternalCommission(amountEntry.entry.id, {
        amount_sgd: amountForm.amount_sgd,
        note: amountForm.note.trim() || null
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entriesQueryKey }),
        queryClient.invalidateQueries({ queryKey: summaryQueryKey })
      ]);
      closeAmountModal();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });

  function openSettleModal(entry: ExternalCommissionEntry) {
    setSettleEntry(entry);
    setSettleForm({ ...defaultSettleForm, amount: outstandingAmount(entry.entry), occurred_at: toDateTimeLocal() });
    setFormError(null);
  }

  function closeSettleModal() {
    setSettleEntry(null);
    setSettleForm(defaultSettleForm);
    setFormError(null);
  }

  function openAmountModal(entry: ExternalCommissionEntry) {
    setAmountEntry(entry);
    setAmountForm({
      amount_sgd: moneyToNumber(entry.entry.amount_sgd ?? entry.entry.amount),
      note: entry.entry.note ?? ""
    });
    setFormError(null);
  }

  function closeAmountModal() {
    setAmountEntry(null);
    setAmountForm({ amount_sgd: null, note: "" });
    setFormError(null);
  }

  const settleDisabled = settleForm.amount === null || settleForm.proof_files.length === 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>{t("externalCommission.title")}</Title>
        <Button variant="light" onClick={() => recomputeMutation.mutate()} loading={recomputeMutation.isPending}>
          {t("externalCommission.recompute")}
        </Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}
      {recomputeMutation.error ? (
        <Alert color="red" variant="light">
          {recomputeMutation.error instanceof Error ? recomputeMutation.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">
            {t("externalCommission.totals.total")}
          </Text>
          <Text fw={700} size="xl">
            {formatMoney(summary?.total ?? summary?.earned)}
          </Text>
        </Paper>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">
            {t("externalCommission.totals.settled")}
          </Text>
          <Text fw={700} size="xl">
            {formatMoney(summary?.settled)}
          </Text>
        </Paper>
        <Paper withBorder p="md">
          <Text c="dimmed" size="sm">
            {t("externalCommission.totals.outstanding")}
          </Text>
          <Text fw={700} size="xl">
            {formatMoney(summary?.outstanding ?? summary?.pending)}
          </Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="md" p="md">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Select
            label={t("externalCommission.fields.payee")}
            data={payeeOptions}
            value={payeeFilter}
            onChange={setPayeeFilter}
            clearable
            searchable
          />
          <Select
            label={t("externalCommission.fields.business")}
            data={businessOptions}
            value={businessFilter}
            onChange={setBusinessFilter}
            clearable
            searchable
          />
          <Select
            label={t("externalCommission.fields.status")}
            data={statusOptions}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as CommissionEntryStatus | null)}
            clearable
          />
        </SimpleGrid>
      </Paper>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={980} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("externalCommission.fields.payee")}</Table.Th>
                <Table.Th>{t("externalCommission.fields.business")}</Table.Th>
                <Table.Th>{t("externalCommission.fields.period")}</Table.Th>
                <Table.Th>{t("externalCommission.fields.stage")}</Table.Th>
                <Table.Th>{t("externalCommission.fields.payable")}</Table.Th>
                <Table.Th>{t("externalCommission.fields.settled")}</Table.Th>
                <Table.Th>{t("externalCommission.fields.outstanding")}</Table.Th>
                <Table.Th>{t("externalCommission.fields.status")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entriesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : entries.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("externalCommission.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                entries.map((row) => {
                  const entry = row.entry;
                  const amount = entry.amount_sgd ?? entry.amount;
                  const computedStatus = settlementStatus(entry);

                  return (
                    <Table.Tr key={entry.id}>
                      <Table.Td>{row.payee ? displayName(row.payee.name, row.payee.name_en) : entry.payee_id}</Table.Td>
                      <Table.Td>{businessLabel(row.business)}</Table.Td>
                      <Table.Td>{entry.period}</Table.Td>
                      <Table.Td>{entry.note ?? "-"}</Table.Td>
                      <Table.Td>{formatMoney(amount)}</Table.Td>
                      <Table.Td>{formatMoney(entry.amount_settled)}</Table.Td>
                      <Table.Td>{formatMoney(entry.outstanding ?? outstandingAmount(entry))}</Table.Td>
                      <Table.Td>
                        <Badge color={entry.status === "void" ? statusColor(entry.status) : settlementStatusColor(computedStatus)} variant="light">
                          {entry.status === "void"
                            ? t("externalCommission.status.void")
                            : t(`externalCommission.status.${computedStatus}`)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => openAmountModal(row)}>
                            {t("externalCommission.editAmount")}
                          </Button>
                          {entry.status !== "void" ? (
                            <Button size="xs" variant="light" onClick={() => openSettleModal(row)}>
                              {t("externalCommission.settle")}
                            </Button>
                          ) : null}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal opened={Boolean(settleEntry)} onClose={closeSettleModal} title={t("externalCommission.settle")} size="lg">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput
              label={t("externalCommission.fields.settleAmount")}
              value={settleForm.amount ?? ""}
              onChange={(value) => setSettleForm((current) => ({ ...current, amount: toNumberOrNull(value) }))}
              min={0}
              decimalScale={2}
              required
            />
            <Select
              label={t("finance.fields.bankAccount")}
              data={accountOptions}
              value={settleForm.bank_account_id}
              onChange={(value) => setSettleForm((current) => ({ ...current, bank_account_id: value }))}
              clearable
              searchable
            />
            <TextInput
              label={t("finance.fields.occurredAt")}
              type="datetime-local"
              value={settleForm.occurred_at}
              onChange={(event) => setSettleForm((current) => ({ ...current, occurred_at: event.currentTarget.value }))}
            />
          </SimpleGrid>
          <FileInput
            label={t("finance.fields.proof")}
            description={settleForm.proof_files.length === 0 ? t("finance.ledger.proofRequired") : undefined}
            value={settleForm.proof_files}
            onChange={(files) => setSettleForm((current) => ({ ...current, proof_files: files }))}
            multiple
            clearable
            required
            error={settleForm.proof_files.length === 0 ? t("finance.ledger.proofRequired") : null}
          />
          <Textarea
            label={t("finance.fields.note")}
            value={settleForm.note}
            onChange={(event) => setSettleForm((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeSettleModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => settleMutation.mutate()} loading={settleMutation.isPending} disabled={settleDisabled}>
              {t("externalCommission.settle")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={Boolean(amountEntry)} onClose={closeAmountModal} title={t("externalCommission.editAmount")} size="md">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <NumberInput
            label={t("externalCommission.fields.payable")}
            value={amountForm.amount_sgd ?? ""}
            onChange={(value) => setAmountForm((current) => ({ ...current, amount_sgd: toNumberOrNull(value) }))}
            min={0}
            decimalScale={2}
            required
          />
          <Textarea
            label={t("finance.fields.note")}
            value={amountForm.note}
            onChange={(event) => setAmountForm((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAmountModal}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => updateAmountMutation.mutate()}
              loading={updateAmountMutation.isPending}
              disabled={amountForm.amount_sgd === null}
            >
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
