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
import { currencies, type BusinessType, type Currency } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import {
  collectChargeWithProofs,
  createCharge,
  listBillingCharges,
  listCaseCharges,
  updateCharge,
  type Charge
} from "../api/charges";
import { createBilling } from "../api/finance";
import { updateCase } from "../api/cases";
import { listBankAccounts } from "../api/ledger";

type Props = {
  billingId?: string | null;
  caseId?: string | null;
  caseBusinessType?: BusinessType | null;
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

export function ChargeSchedulePanel({ billingId, caseId, caseBusinessType, onChargesLoaded }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [createPlanOpened, setCreatePlanOpened] = useState(false);
  const [planTotal, setPlanTotal] = useState<number | null>(null);
  const [planDeposit, setPlanDeposit] = useState<number | null>(null);
  const [collectCharge, setCollectCharge] = useState<Charge | null>(null);
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editingExpected, setEditingExpected] = useState<number | null>(null);
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

  const accountOptions = (accountsQuery.data?.bank_accounts ?? []).map((account) => {
    const parts = [account.name];
    if (account.type) {
      parts.push(t(`bankAccountType.${account.type}`));
    }
    parts.push(account.currency);
    if (account.account_no) {
      parts.push(account.account_no);
    }
    return { value: account.id, label: parts.join(" · ") };
  });
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
  const updateChargeMutation = useMutation({
    mutationFn: ({ id, amount_expected }: { id: string; amount_expected: number }) =>
      updateCharge(id, { amount_expected }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "charges"] });
      closeExpectedEditor();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });

  // 案件还没有收款计划(billing)时,在此面板直接给案件建一张空账单并绑定,之后即可手动添加收款项
  const createPlanMutation = useMutation({
    mutationFn: async () => {
      if (!caseId || (caseBusinessType !== "ep" && caseBusinessType !== "ica")) {
        throw new Error("missing_required_fields");
      }
      const { billing } = await createBilling({
        ref_type: caseBusinessType,
        ref_id: caseId,
        total_price_sgd: planTotal ?? 0,
        deposit_sgd: planDeposit ?? undefined
      });
      await updateCase(caseId, { billing_id: billing.id });
      // ICA 收费简单:总价 → 定金 + 尾款,直接铺两笔收款项
      if (caseBusinessType === "ica") {
        const deposit = planDeposit ?? 0;
        const balance = Math.max(0, (planTotal ?? 0) - deposit);
        await createCharge({
          billing_id: billing.id,
          charge_kind: "milestone",
          label: t("chargeSchedule.depositLabel"),
          amount_expected: deposit
        });
        await createCharge({
          billing_id: billing.id,
          charge_kind: "milestone",
          label: t("chargeSchedule.balanceLabel"),
          amount_expected: balance
        });
      }
      return billing;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
      await queryClient.invalidateQueries({ queryKey: ["finance", "charges"] });
      closeCreatePlanModal();
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

  function openExpectedEditor(charge: Charge) {
    setEditingChargeId(charge.id);
    setEditingExpected(Number(charge.amount_expected));
    setFormError(null);
  }

  function closeExpectedEditor() {
    setEditingChargeId(null);
    setEditingExpected(null);
    setFormError(null);
  }

  function saveExpected(charge: Charge) {
    if (editingExpected === null) {
      return;
    }

    updateChargeMutation.mutate({ id: charge.id, amount_expected: editingExpected });
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

  function openCreatePlanModal() {
    setPlanTotal(null);
    setPlanDeposit(null);
    setFormError(null);
    setCreatePlanOpened(true);
  }

  function closeCreatePlanModal() {
    setCreatePlanOpened(false);
    setPlanTotal(null);
    setPlanDeposit(null);
    setFormError(null);
  }

  const collectDisabled =
    collectForm.paid_amount === null ||
    !collectForm.paid_at ||
    collectForm.proof_files.length === 0 ||
    (collectForm.currency !== "SGD" && collectForm.fx_rate === null);
  const eventDisabled = !resolvedBillingId || !eventForm.label.trim() || eventForm.amount_expected === null;
  // 案件还没绑定 billing(收款计划)。只有 EP/ICA 案件支持在此面板直接创建。
  const isNotFoundError = chargesQuery.error instanceof Error && chargesQuery.error.message === "not_found";
  const canCreatePlan =
    Boolean(caseId) && !resolvedBillingId && (caseBusinessType === "ep" || caseBusinessType === "ica");

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={3}>{t("chargeSchedule.title")}</Title>
            {chargesQuery.isFetching ? <Loader size="sm" /> : null}
          </Stack>
          {canCreatePlan ? (
            <Button onClick={openCreatePlanModal}>{t("chargeSchedule.createPlan")}</Button>
          ) : resolvedBillingId ? (
            <Button variant="light" onClick={openEventModal}>
              {t("chargeSchedule.addEvent")}
            </Button>
          ) : null}
        </Group>

        {canCreatePlan ? (
          <Alert color="blue" variant="light">
            {t("chargeSchedule.noPlanHint")}
          </Alert>
        ) : chargesQuery.error ? (
          <Alert color="red" variant="light">
            {isNotFoundError
              ? t("chargeSchedule.notFound")
              : chargesQuery.error instanceof Error
                ? chargesQuery.error.message
                : t("common.unknown_error")}
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
                      <Group gap="xs" wrap="nowrap">
                        <Button size="xs" variant="subtle" onClick={() => openExpectedEditor(charge)}>
                          {t("chargeSchedule.editExpected")}
                        </Button>
                      {charge.status === "pending" || charge.status === "partial" ? (
                        <Button size="xs" variant="light" onClick={() => openCollectModal(charge)}>
                          {t("chargeSchedule.collect")}
                        </Button>
                      ) : null}
                      </Group>
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

      <Modal opened={Boolean(editingChargeId)} onClose={closeExpectedEditor} title={t("chargeSchedule.editExpected")} size="md">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <NumberInput
            label={t("chargeSchedule.fields.expected")}
            value={editingExpected ?? ""}
            onChange={(value) => setEditingExpected(typeof value === "number" ? value : null)}
            min={0}
            decimalScale={2}
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeExpectedEditor}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const charge = charges.find((item) => item.id === editingChargeId);
                if (charge) {
                  saveExpected(charge);
                }
              }}
              loading={updateChargeMutation.isPending}
              disabled={editingExpected === null}
            >
              {t("common.save")}
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

      <Modal opened={createPlanOpened} onClose={closeCreatePlanModal} title={t("chargeSchedule.createPlan")} size="md">
        <Stack gap="md">
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <Text size="sm" c="dimmed">
            {t("chargeSchedule.createPlanHint")}
          </Text>
          <NumberInput
            label={t("chargeSchedule.fields.totalPrice")}
            value={planTotal ?? ""}
            onChange={(value) => setPlanTotal(typeof value === "number" ? value : null)}
            min={0}
            decimalScale={2}
          />
          <NumberInput
            label={t("chargeSchedule.fields.deposit")}
            value={planDeposit ?? ""}
            onChange={(value) => setPlanDeposit(typeof value === "number" ? value : null)}
            min={0}
            decimalScale={2}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeCreatePlanModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => createPlanMutation.mutate()} loading={createPlanMutation.isPending}>
              {t("chargeSchedule.createPlan")}
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
