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
import { currencies, type Currency } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import {
  collectChargeWithProofs,
  createCharge,
  listBillingCharges,
  listCaseCharges,
  type Charge
} from "../api/charges";
import { listBankAccounts } from "../api/ledger";

type Props = {
  billingId?: string | null;
  caseId?: string | null;
  onChargesLoaded?: (charges: Charge[]) => void;
};

type CollectForm = {
  paid_amount: number | null;
  currency: Currency;
  fx_rate: number | null;
  paid_at: string;
  bank_account_id: string | null;
  proof_files: File[];
  note: string;
};

type EventForm = {
  label: string;
  amount_expected: number | null;
  period: string;
  due_date: string;
  case_step_id: string | null;
};

const defaultCollectForm: CollectForm = {
  paid_amount: null,
  currency: "SGD",
  fx_rate: null,
  paid_at: "",
  bank_account_id: null,
  proof_files: [],
  note: ""
};

function formatMoney(amount?: string | number | null, currency = "SGD") {
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

function outstanding(charge: Charge) {
  return Math.max(0, Number(charge.amount_expected) - Number(charge.amount_collected));
}

function chargeStatusColor(status: Charge["status"]) {
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

function chargeKindColor(kind: Charge["charge_kind"]) {
  switch (kind) {
    case "event":
      return "blue";
    case "period":
      return "violet";
    default:
      return "teal";
  }
}

function errorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : "unknown_error";
  const key = `finance.errors.${message}`;
  const translated = t(key);
  return translated === key ? message : translated;
}

function makeQueryKey(billingId?: string | null, caseId?: string | null) {
  return ["finance", "charges", billingId ? "billing" : "case", billingId ?? caseId] as const;
}

export function ChargeSchedulePanel({ billingId, caseId, onChargesLoaded }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [collectCharge, setCollectCharge] = useState<Charge | null>(null);
  const [collectForm, setCollectForm] = useState<CollectForm>(defaultCollectForm);
  const [eventOpened, setEventOpened] = useState(false);
  const [eventForm, setEventForm] = useState<EventForm>({
    label: "",
    amount_expected: null,
    period: "",
    due_date: "",
    case_step_id: null
  });
  const [formError, setFormError] = useState<string | null>(null);

  const chargesQuery = useQuery({
    queryKey: makeQueryKey(billingId, caseId),
    queryFn: () => (billingId ? listBillingCharges(billingId) : listCaseCharges(caseId ?? "")),
    enabled: Boolean(billingId || caseId)
  });

  const charges = chargesQuery.data?.charges ?? [];
  const companyId = charges.find((charge) => charge.company_id)?.company_id ?? null;
  const resolvedBillingId = billingId ?? charges[0]?.billing_id ?? null;
  const hasEventCharges = charges.some((charge) => charge.charge_kind === "event");
  const accountsQuery = useQuery({
    queryKey: ["finance", "bank-accounts", companyId],
    queryFn: () => listBankAccounts({ company_id: companyId }),
    enabled: Boolean(collectCharge || eventOpened)
  });

  useEffect(() => {
    onChargesLoaded?.(charges);
  }, [charges, onChargesLoaded]);

  const totals = useMemo(() => {
    const expected = charges.reduce((sum, charge) => sum + Number(charge.amount_expected), 0);
    const collected = charges.reduce((sum, charge) => sum + Number(charge.amount_collected), 0);
    return { expected, collected, outstanding: expected - collected };
  }, [charges]);

  const accountOptions = (accountsQuery.data?.bank_accounts ?? []).map((account) => ({
    value: account.id,
    label: account.name
  }));
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!collectCharge || collectForm.paid_amount === null || !collectForm.paid_at || collectForm.proof_files.length === 0) {
        throw new Error("proof_required");
      }

      return collectChargeWithProofs(collectCharge.id, {
        paid_amount: collectForm.paid_amount,
        currency: collectForm.currency,
        fx_rate: collectForm.currency === "SGD" ? null : collectForm.fx_rate,
        paid_at: toIsoDateTime(collectForm.paid_at),
        bank_account_id: collectForm.bank_account_id,
        proof_files: collectForm.proof_files,
        note: collectForm.note.trim() ? collectForm.note.trim() : null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "charges"] });
      closeCollectModal();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });

  const eventMutation = useMutation({
    mutationFn: () => {
      if (!resolvedBillingId || eventForm.amount_expected === null || !eventForm.label.trim()) {
        throw new Error("missing_required_fields");
      }

      return createCharge({
        billing_id: resolvedBillingId,
        charge_kind: "event",
        label: eventForm.label.trim(),
        amount_expected: eventForm.amount_expected,
        period: eventForm.period.trim() || null,
        due_date: eventForm.due_date || null,
        case_step_id: eventForm.case_step_id
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "charges"] });
      closeEventModal();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });

  function openCollectModal(charge: Charge) {
    setCollectCharge(charge);
    setCollectForm({
      ...defaultCollectForm,
      paid_amount: outstanding(charge),
      currency: charge.currency,
      paid_at: toDateTimeLocal()
    });
    setFormError(null);
  }

  function closeCollectModal() {
    setCollectCharge(null);
    setCollectForm(defaultCollectForm);
    setFormError(null);
  }

  function openEventModal() {
    setEventForm({ label: "", amount_expected: null, period: "", due_date: "", case_step_id: null });
    setFormError(null);
    setEventOpened(true);
  }

  function closeEventModal() {
    setEventOpened(false);
    setEventForm({ label: "", amount_expected: null, period: "", due_date: "", case_step_id: null });
    setFormError(null);
  }

  const collectDisabled =
    collectForm.paid_amount === null ||
    !collectForm.paid_at ||
    collectForm.proof_files.length === 0 ||
    (collectForm.currency !== "SGD" && collectForm.fx_rate === null);
  const eventDisabled = !resolvedBillingId || !eventForm.label.trim() || eventForm.amount_expected === null;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={3}>{t("chargeSchedule.title")}</Title>
            {chargesQuery.isFetching ? <Loader size="sm" /> : null}
          </Stack>
          {resolvedBillingId && hasEventCharges ? (
            <Button variant="light" onClick={openEventModal}>
              {t("chargeSchedule.addEvent")}
            </Button>
          ) : null}
        </Group>

        {chargesQuery.error ? (
          <Alert color="red" variant="light">
            {chargesQuery.error instanceof Error ? chargesQuery.error.message : t("common.unknown_error")}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <SummaryItem label={t("chargeSchedule.expected")} value={formatMoney(totals.expected)} />
          <SummaryItem label={t("chargeSchedule.collected")} value={formatMoney(totals.collected)} />
          <SummaryItem label={t("chargeSchedule.outstanding")} value={formatMoney(totals.outstanding)} />
        </SimpleGrid>

        <ScrollArea>
          <Table miw={920} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("chargeSchedule.fields.label")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.kind")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.expected")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.collected")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.status")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.caseStep")}</Table.Th>
                <Table.Th>{t("chargeSchedule.fields.dueDate")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {charges.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" ta="center" py="md">
                      {t("chargeSchedule.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                charges.map((charge) => (
                  <Table.Tr key={charge.id}>
                    <Table.Td>{charge.label}</Table.Td>
                    <Table.Td>
                      <Badge color={chargeKindColor(charge.charge_kind)} variant="light">
                        {t(`chargeKind.${charge.charge_kind}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatMoney(charge.amount_expected, charge.currency)}</Table.Td>
                    <Table.Td>{formatMoney(charge.amount_collected, charge.currency)}</Table.Td>
                    <Table.Td>
                      <Badge color={chargeStatusColor(charge.status)} variant="light">
                        {t(`chargeStatus.${charge.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{charge.case_step_id ?? "-"}</Table.Td>
                    <Table.Td>{displayDate(charge.due_date)}</Table.Td>
                    <Table.Td>
                      {charge.status === "pending" || charge.status === "partial" ? (
                        <Button size="xs" variant="light" onClick={() => openCollectModal(charge)}>
                          {t("chargeSchedule.collect")}
                        </Button>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>

      <Modal opened={Boolean(collectCharge)} onClose={closeCollectModal} title={t("chargeSchedule.collect")} size="lg">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput
              label={t("chargeSchedule.fields.paidAmount")}
              value={collectForm.paid_amount ?? ""}
              onChange={(value) =>
                setCollectForm((current) => ({ ...current, paid_amount: typeof value === "number" ? value : null }))
              }
              min={0}
              required
            />
            <Select
              label={t("finance.fields.currency")}
              data={currencyOptions}
              value={collectForm.currency}
              onChange={(value) => setCollectForm((current) => ({ ...current, currency: (value as Currency | null) ?? "SGD" }))}
            />
            {collectForm.currency !== "SGD" ? (
              <NumberInput
                label={t("finance.fields.fxRate")}
                value={collectForm.fx_rate ?? ""}
                onChange={(value) =>
                  setCollectForm((current) => ({ ...current, fx_rate: typeof value === "number" ? value : null }))
                }
                min={0}
                required
              />
            ) : null}
            <TextInput
              label={t("chargeSchedule.fields.paidAt")}
              type="datetime-local"
              value={collectForm.paid_at}
              onChange={(event) => setCollectForm((current) => ({ ...current, paid_at: event.currentTarget.value }))}
              required
            />
            <Select
              label={t("finance.fields.bankAccount")}
              data={accountOptions}
              value={collectForm.bank_account_id}
              onChange={(value) => setCollectForm((current) => ({ ...current, bank_account_id: value }))}
              searchable
              clearable
            />
          </SimpleGrid>
          <FileInput
            label={t("finance.fields.proof")}
            description={collectForm.proof_files.length === 0 ? t("finance.ledger.proofRequired") : undefined}
            value={collectForm.proof_files}
            onChange={(files) => setCollectForm((current) => ({ ...current, proof_files: files }))}
            multiple
            clearable
            required
            error={collectForm.proof_files.length === 0 ? t("finance.ledger.proofRequired") : null}
          />
          <Textarea
            label={t("finance.fields.note")}
            value={collectForm.note}
            onChange={(event) => setCollectForm((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeCollectModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => collectMutation.mutate()} loading={collectMutation.isPending} disabled={collectDisabled}>
              {t("chargeSchedule.collect")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={eventOpened} onClose={closeEventModal} title={t("chargeSchedule.addEvent")} size="lg">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label={t("chargeSchedule.fields.label")}
              value={eventForm.label}
              onChange={(event) => setEventForm((current) => ({ ...current, label: event.currentTarget.value }))}
              required
            />
            <NumberInput
              label={t("chargeSchedule.fields.expected")}
              value={eventForm.amount_expected ?? ""}
              onChange={(value) =>
                setEventForm((current) => ({ ...current, amount_expected: typeof value === "number" ? value : null }))
              }
              min={0}
              required
            />
            <TextInput
              label={t("chargeSchedule.fields.period")}
              placeholder="2026-06"
              value={eventForm.period}
              onChange={(event) => setEventForm((current) => ({ ...current, period: event.currentTarget.value }))}
            />
            <TextInput
              label={t("chargeSchedule.fields.dueDate")}
              type="date"
              value={eventForm.due_date}
              onChange={(event) => setEventForm((current) => ({ ...current, due_date: event.currentTarget.value }))}
            />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeEventModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => eventMutation.mutate()} loading={eventMutation.isPending} disabled={eventDisabled}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="sm">
      <Text c="dimmed" size="sm">
        {label}
      </Text>
      <Text fw={700}>{value}</Text>
    </Paper>
  );
}
