import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Popover,
  Progress,
  Select,
  Stack,
  Stepper,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { fnbFoodCourtKeys, getFoodCourt, listFoodCourts, type FoodCourt } from "../../../api/fnbFoodCourts";
import {
  createMlkPayment,
  createMlkCuisine,
  deleteMlkPayment,
  deleteMlkSettlement,
  getMlkStore,
  listMlkCuisines,
  listMlkManagers,
  listMlkCoupleLedger,
  listMlkCouples,
  listMlkInvestors,
  listMlkRevenue,
  listMlkStores,
  mlkKeys,
  mlkStoreDefaults,
  updateMlkPayment,
  createMlkStore,
  deleteMlkStore,
  updateMlkStore,
  upsertMlkRevenue,
  upsertMlkSettlement,
  type MlkPayment,
  type MlkCuisineInput,
  type MlkPaymentInput,
  type MlkPaymentKind,
  type MlkPaymentStatus,
  type MlkRevenueInput,
  type MlkSettlementInput,
  type MlkStatus,
  type MlkStore,
  type MlkStoreInput
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { calcAtRevenue, type FoodCourtCalcResult } from "../foodCourtCalc";
import { MlkFilePanel } from "./MlkFilePanel";
import { formatSgd, MlkMoneyText } from "./MlkMoneyText";
import { dateInputValue, ErrorAlert, formatDate, storeStatusColor } from "./shared";

const storeStatuses: MlkStatus[] = ["intent", "selected", "incorporated", "lease_signed", "renovation", "open", "closed"];
const stepStatuses: MlkStatus[] = ["intent", "selected", "incorporated", "lease_signed", "renovation", "open"];
const paymentKinds: MlkPaymentKind[] = [
  "instalment1",
  "instalment2",
  "instalment3",
  "instalment4",
  "fc_deposit",
  "service_tier1",
  "service_tier2_first",
  "service_tier2_second"
];
const storePaymentKinds: MlkPaymentKind[] = ["instalment1", "instalment2", "instalment3", "instalment4", "fc_deposit"];
const paymentStatuses: MlkPaymentStatus[] = ["pending", "paid", "refunded"];
const instalmentPlan: { kind: MlkPaymentKind; amount: number }[] = [
  { kind: "instalment1", amount: 5000 },
  { kind: "instalment2", amount: 5000 },
  { kind: "instalment3", amount: 30000 },
  { kind: "instalment4", amount: 10000 }
];
const dateFieldByStatus: Partial<Record<MlkStatus, keyof MlkStoreInput>> = {
  intent: "intent_signed_at",
  selected: "selected_at",
  incorporated: "incorporated_at",
  lease_signed: "lease_signed_at",
  renovation: "renovation_at",
  open: "opened_at",
  closed: "closed_at"
};

type PaymentForm = {
  id?: string;
  kind: MlkPaymentKind;
  amount_due: number;
  amount_paid: number;
  paid_at: string | null;
  status: MlkPaymentStatus;
  notes: string | null;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(month: string) {
  return `${month}-01`;
}

function monthEnd(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  return new Date(year ?? 1970, rawMonth ?? 1, 0).toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function previousMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function normalizeStore(store: MlkStore): MlkStoreInput {
  return {
    name: store.name ?? "",
    stall: store.stall ?? null,
    cuisine_id: store.cuisine_id ?? null,
    address: store.address ?? null,
    spv_name: store.spv_name ?? null,
    spv_uen: store.spv_uen ?? null,
    investor_id: store.investor_id ?? null,
    couple_id: store.couple_id ?? null,
    food_court_id: store.food_court_id ?? null,
    kitchen_store_id: store.kitchen_store_id ?? null,
    status: store.status ?? "intent",
    intent_signed_at: dateInputValue(store.intent_signed_at) || null,
    selected_at: dateInputValue(store.selected_at) || null,
    incorporated_at: dateInputValue(store.incorporated_at) || null,
    lease_signed_at: dateInputValue(store.lease_signed_at) || null,
    renovation_at: dateInputValue(store.renovation_at) || null,
    opened_at: dateInputValue(store.opened_at) || null,
    closed_at: dateInputValue(store.closed_at) || null,
    fc_deposit_amount: store.fc_deposit_amount ?? null,
    drive_folder_id: store.drive_folder_id ?? null,
    notes: store.notes ?? null
  };
}

function cleanText(value?: string | null) {
  return value?.trim() || null;
}

function toStoreBody(form: MlkStoreInput): MlkStoreInput {
  return {
    ...form,
    name: form.name.trim(),
    stall: cleanText(form.stall),
    address: cleanText(form.address),
    spv_name: cleanText(form.spv_name),
    spv_uen: cleanText(form.spv_uen),
    kitchen_store_id: cleanText(form.kitchen_store_id),
    notes: cleanText(form.notes)
  };
}

function sumRevenue(rows: { turnover: number }[]) {
  return rows.reduce((total, row) => total + row.turnover, 0);
}

function paymentProgress(payments: MlkPayment[]) {
  const relevant = payments.filter((payment) => storePaymentKinds.includes(payment.kind));
  const due = relevant.reduce((total, payment) => total + payment.amount_due, 0);
  const paid = relevant.reduce((total, payment) => total + payment.amount_paid, 0);
  return { due, paid, pct: due > 0 ? Math.min(100, (paid / due) * 100) : 0 };
}

function defaultPaymentForm(kind: MlkPaymentKind = "instalment1"): PaymentForm {
  return {
    kind,
    amount_due: 0,
    amount_paid: 0,
    paid_at: null,
    status: "pending",
    notes: null
  };
}

function calcDetailRows(calc: FoodCourtCalcResult) {
  return [
    ["profit", calc.profit],
    ["investor", calc.investor],
    ["couple", calc.couple],
    ["mgmtTotal", calc.mgmtTotal],
    ["F", calc.F],
    ["food", calc.food],
    ["mgmt", calc.mgmt]
  ] as const;
}

function ResultPreview({ calc }: { calc: FoodCourtCalcResult }) {
  const { t } = useTranslation();
  return (
    <Table withTableBorder withColumnBorders>
      <Table.Tbody>
        {calcDetailRows(calc).map(([key, value]) => (
          <Table.Tr key={key}>
            <Table.Td>{t(`mlk.calc.${key}`)}</Table.Td>
            <Table.Td>{formatSgd(value)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function MlkStoreDetailPage() {
  const { t } = useTranslation();
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [form, setForm] = useState<MlkStoreInput>(mlkStoreDefaults());
  const [toast, setToast] = useState<{ color: "green" | "red"; message: string } | null>(null);
  const [stepModal, setStepModal] = useState<{ status: MlkStatus; date: string } | null>(null);
  const [paymentModal, setPaymentModal] = useState<PaymentForm | null>(null);
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [revenueForm, setRevenueForm] = useState<MlkRevenueInput>({ date: todayDate(), turnover: 0, source: "manual" });
  const [revenueMonth, setRevenueMonth] = useState(currentMonth());
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [settlementMonth, setSettlementMonth] = useState(previousMonth());
  const [settlementTurnover, setSettlementTurnover] = useState(0);
  const [noRepay, setNoRepay] = useState(false);
  const [cuisineModalOpen, setCuisineModalOpen] = useState(false);
  const [cuisineForm, setCuisineForm] = useState<MlkCuisineInput>({ name: "", manager_id: null, notes: null });

  const detailQuery = useQuery({
    queryKey: mlkKeys.store(id),
    queryFn: () => getMlkStore(id),
    enabled: !isNew
  });
  const investorsQuery = useQuery({ queryKey: mlkKeys.investors(), queryFn: listMlkInvestors });
  const couplesQuery = useQuery({ queryKey: mlkKeys.couples(), queryFn: listMlkCouples });
  const storesQuery = useQuery({ queryKey: mlkKeys.stores(), queryFn: listMlkStores });
  const cuisinesQuery = useQuery({ queryKey: mlkKeys.cuisines(), queryFn: () => listMlkCuisines() });
  const managersQuery = useQuery({ queryKey: mlkKeys.managers(), queryFn: listMlkManagers });
  const foodCourtsQuery = useQuery({ queryKey: fnbFoodCourtKeys.list(), queryFn: listFoodCourts });
  const linkedFoodCourtQuery = useQuery({
    queryKey: form.food_court_id ? fnbFoodCourtKeys.detail(form.food_court_id) : ["fnb-food-courts", null],
    queryFn: () => getFoodCourt(form.food_court_id || ""),
    enabled: Boolean(form.food_court_id)
  });
  const currentRevenueQuery = useQuery({
    queryKey: mlkKeys.revenue(id, monthStart(currentMonth()), monthEnd(currentMonth())),
    queryFn: () => listMlkRevenue(id, { from: monthStart(currentMonth()), to: monthEnd(currentMonth()) }),
    enabled: !isNew
  });
  const previousRevenueQuery = useQuery({
    queryKey: mlkKeys.revenue(id, monthStart(previousMonth()), monthEnd(previousMonth())),
    queryFn: () => listMlkRevenue(id, { from: monthStart(previousMonth()), to: monthEnd(previousMonth()) }),
    enabled: !isNew
  });
  const revenueQuery = useQuery({
    queryKey: mlkKeys.revenue(id, monthStart(revenueMonth), monthEnd(revenueMonth)),
    queryFn: () => listMlkRevenue(id, { from: monthStart(revenueMonth), to: monthEnd(revenueMonth) }),
    enabled: !isNew
  });
  const settlementRevenueQuery = useQuery({
    queryKey: mlkKeys.revenue(id, monthStart(settlementMonth), monthEnd(settlementMonth)),
    queryFn: () => listMlkRevenue(id, { from: monthStart(settlementMonth), to: monthEnd(settlementMonth) }),
    enabled: !isNew && settlementModalOpen
  });
  const ledgerQuery = useQuery({
    queryKey: form.couple_id ? mlkKeys.coupleLedger(form.couple_id) : ["mlk", "couple-ledger", null],
    queryFn: () => listMlkCoupleLedger(form.couple_id || ""),
    enabled: Boolean(form.couple_id)
  });

  useEffect(() => {
    if (detailQuery.data?.store) setForm(normalizeStore(detailQuery.data.store));
  }, [detailQuery.data?.store]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!settlementModalOpen) return;
    setSettlementTurnover(sumRevenue(settlementRevenueQuery.data?.revenue ?? []));
  }, [settlementModalOpen, settlementRevenueQuery.data?.revenue]);

  useEffect(() => {
    const repaid = (ledgerQuery.data?.ledger ?? [])
      .filter((entry) => entry.kind === "advance_repay")
      .reduce((total, entry) => total + entry.amount, 0);
    setNoRepay(repaid >= 50000);
  }, [ledgerQuery.data?.ledger]);

  function errorText(error: unknown) {
    if (error instanceof Error && error.message === "couple_already_assigned") return t("mlk.messages.coupleAlreadyAssigned");
    return error instanceof Error ? error.message : t("common.unknown_error");
  }

  const createMutation = useMutation({
    mutationFn: createMlkStore,
    onSuccess: async (data) => {
      if (data.store.investor_id) {
        await Promise.all(
          instalmentPlan.map((item) =>
            createMlkPayment({
              investor_id: data.store.investor_id || "",
              store_id: data.store.id,
              kind: item.kind,
              amount_due: item.amount,
              amount_paid: 0,
              paid_at: null,
              status: "pending",
              notes: null
            })
          )
        );
      }
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      setToast({ color: "green", message: t("mlk.messages.saved") });
      navigate(`/franchise/mlk/stores/${data.store.id}`, { replace: true });
    },
    onError: (error) => setToast({ color: "red", message: errorText(error) })
  });
  const updateMutation = useMutation({
    mutationFn: (body: Partial<MlkStoreInput>) => updateMlkStore(id, body),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.store(id) });
      setForm(normalizeStore(data.store));
      setToast({ color: "green", message: t("mlk.messages.saved") });
    },
    onError: (error) => setToast({ color: "red", message: errorText(error) })
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMlkStore,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      navigate("/franchise/mlk");
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const paymentMutation = useMutation({
    mutationFn: (body: PaymentForm) => {
      const input: MlkPaymentInput = {
        investor_id: form.investor_id || detailQuery.data?.store.investor_id || "",
        store_id: id,
        kind: body.kind,
        amount_due: body.amount_due,
        amount_paid: body.amount_paid,
        paid_at: body.paid_at,
        status: body.status,
        notes: cleanText(body.notes)
      };
      return body.id ? updateMlkPayment(body.id, input) : createMlkPayment(input);
    },
    onSuccess: async () => {
      setPaymentModal(null);
      await queryClient.invalidateQueries({ queryKey: mlkKeys.store(id) });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const deletePaymentMutation = useMutation({
    mutationFn: deleteMlkPayment,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: mlkKeys.store(id) })
  });
  const revenueMutation = useMutation({
    mutationFn: (body: MlkRevenueInput) => upsertMlkRevenue(id, body),
    onSuccess: async () => {
      setRevenueModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: mlkKeys.store(id) });
      await queryClient.invalidateQueries({ queryKey: ["mlk", "stores", id, "revenue"] });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const settlementMutation = useMutation({
    mutationFn: (body: MlkSettlementInput) => upsertMlkSettlement(id, body),
    onSuccess: async () => {
      setSettlementModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: mlkKeys.store(id) });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const cuisineMutation = useMutation({
    mutationFn: createMlkCuisine,
    onSuccess: async (data) => {
      setField("cuisine_id", data.cuisine.id);
      setCuisineModalOpen(false);
      setCuisineForm({ name: "", manager_id: null, notes: null });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.cuisines() });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const deleteSettlementMutation = useMutation({
    mutationFn: deleteMlkSettlement,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: mlkKeys.store(id) })
  });

  function setField<K extends keyof MlkStoreInput>(key: K, value: MlkStoreInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!canManage) return;
    if (!form.name.trim()) {
      setToast({ color: "red", message: t("mlk.messages.nameRequired") });
      return;
    }
    if (isNew) createMutation.mutate(toStoreBody(form));
    else updateMutation.mutate(toStoreBody(form));
  }

  function remove() {
    if (!canManage || isNew) return;
    if (!window.confirm(t("mlk.messages.confirmDelete"))) return;
    deleteMutation.mutate(id);
  }

  function advanceStatus() {
    if (!stepModal) return;
    const dateKey = dateFieldByStatus[stepModal.status];
    updateMutation.mutate({
      status: stepModal.status,
      ...(dateKey ? { [dateKey]: stepModal.date } : {})
    });
    setStepModal(null);
  }

  function openPayment(payment?: MlkPayment) {
    setPaymentModal(
      payment
        ? {
            id: payment.id,
            kind: payment.kind,
            amount_due: payment.amount_due,
            amount_paid: payment.amount_paid,
            paid_at: dateInputValue(payment.paid_at) || null,
            status: payment.status,
            notes: payment.notes ?? null
          }
        : defaultPaymentForm()
    );
  }

  function submitSettlement() {
    if (!foodCourt) return;
    const calc = calcAtRevenue(foodCourt, settlementTurnover, { noRepay });
    settlementMutation.mutate({
      month: monthStart(settlementMonth),
      turnover: settlementTurnover,
      net_profit: calc.profit,
      investor_payout: calc.investor,
      couple_payout: calc.couple,
      mgmt_payout: calc.mgmtTotal,
      detail: calc
    });
  }

  const disabled = !canManage;
  const saving = createMutation.isPending || updateMutation.isPending;
  const payments = detailQuery.data?.store.payments ?? [];
  const settlements = detailQuery.data?.store.settlements ?? [];
  const progress = paymentProgress(payments);
  const latestSettlement = settlements[0];
  const activeStep = form.status === "closed" ? -1 : Math.max(0, stepStatuses.indexOf(form.status));
  const allStores = storesQuery.data?.stores ?? [];
  // 夫妻只能属于一家门店:排除已被"其它门店"占用的夫妻(保留当前门店已选的那对)
  const takenCoupleIds = new Set(
    allStores.filter((store) => store.id !== id && store.couple_id).map((store) => store.couple_id as string)
  );
  const investorOptions = (investorsQuery.data?.investors ?? []).map((investor) => ({ value: investor.id, label: investor.name }));
  const coupleOptions = (couplesQuery.data?.couples ?? [])
    .filter((couple) => !takenCoupleIds.has(couple.id) || couple.id === form.couple_id)
    .map((couple) => ({ value: couple.id, label: `${couple.husband_name} / ${couple.wife_name}` }));
  const cuisineOptions = (cuisinesQuery.data?.cuisines ?? []).map((cuisine) => ({
    value: cuisine.id,
    label: cuisine.manager_name ? `${cuisine.name} · ${cuisine.manager_name}` : cuisine.name
  }));
  const managerOptions = (managersQuery.data?.managers ?? []).map((manager) => ({ value: manager.id, label: manager.name }));
  const foodCourtOptions = (foodCourtsQuery.data?.food_courts ?? []).map((court) => ({ value: court.id, label: court.name }));
  const selectedInvestor = (investorsQuery.data?.investors ?? []).find((investor) => investor.id === form.investor_id);
  const selectedCouple = (couplesQuery.data?.couples ?? []).find((couple) => couple.id === form.couple_id);
  const selectedFoodCourt = (foodCourtsQuery.data?.food_courts ?? []).find((court) => court.id === form.food_court_id);
  const foodCourt = linkedFoodCourtQuery.data?.food_court as FoodCourt | undefined;
  const settlementCalc = foodCourt ? calcAtRevenue(foodCourt, settlementTurnover, { noRepay }) : null;

  const stepperSection = (
    <Card withBorder shadow="xs" p="md">
      {form.status === "closed" ? (
        <Group justify="space-between">
          <Text fw={600}>{t("mlk.lifecycle.title")}</Text>
          <Badge color="red">{t("mlk.status.store.closed")}</Badge>
        </Group>
      ) : (
        <Stepper active={activeStep} size="xs">
          {stepStatuses.map((status) => {
            const dateKey = dateFieldByStatus[status];
            return (
              <Stepper.Step
                key={status}
                label={t(`mlk.status.store.${status}`)}
                description={dateKey ? formatDate(form[dateKey] as string | null | undefined) : "-"}
                onClick={() => canManage && setStepModal({ status, date: dateInputValue(dateKey ? (form[dateKey] as string | null | undefined) : null) || todayDate() })}
              />
            );
          })}
        </Stepper>
      )}
    </Card>
  );

  const infoSection = (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Card withBorder shadow="xs" p="sm" h="100%">
          <Text fw={600} mb="sm">{t("mlk.cards.basic")}</Text>
          <Grid gutter="sm">
            <Grid.Col span={12}><TextInput label={t("mlk.fields.name")} value={form.name} disabled={disabled} onChange={(event) => setField("name", event.currentTarget.value)} /></Grid.Col>
            <Grid.Col span={4}><TextInput label={t("mlk.fields.stall")} value={form.stall ?? ""} disabled={disabled} onChange={(event) => setField("stall", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={4}>
              <Group align="flex-end" wrap="nowrap">
                <Select w="100%" label={t("mlk.fields.cuisine")} data={cuisineOptions} value={form.cuisine_id ?? null} disabled={disabled} clearable searchable onChange={(value) => setField("cuisine_id", value)} />
                {canManage ? <Button variant="light" onClick={() => setCuisineModalOpen(true)}>{t("mlk.cuisines.add")}</Button> : null}
              </Group>
            </Grid.Col>
            <Grid.Col span={4}><Select label={t("mlk.fields.status")} data={storeStatuses.map((value) => ({ value, label: t(`mlk.status.store.${value}`) }))} value={form.status} disabled={disabled} onChange={(value) => setField("status", (value ?? "intent") as MlkStatus)} /></Grid.Col>
            <Grid.Col span={12}><TextInput label={t("mlk.fields.address")} value={form.address ?? ""} disabled={disabled} onChange={(event) => setField("address", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={6}><TextInput label={t("mlk.fields.spv_name")} value={form.spv_name ?? ""} disabled={disabled} onChange={(event) => setField("spv_name", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={6}><TextInput label={t("mlk.fields.spv_uen")} value={form.spv_uen ?? ""} disabled={disabled} onChange={(event) => setField("spv_uen", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={12}><TextInput label={t("mlk.fields.kitchen_store_id")} value={form.kitchen_store_id ?? ""} disabled={disabled} onChange={(event) => setField("kitchen_store_id", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={12}><Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} disabled={disabled} minRows={2} onChange={(event) => setField("notes", event.currentTarget.value || null)} /></Grid.Col>
          </Grid>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Stack gap="md">
          <Card withBorder shadow="xs" p="sm">
            <Text fw={600} mb="sm">{t("mlk.cards.equity")}</Text>
            <Stack gap="sm">
              <Group align="flex-end" wrap="nowrap">
                <Select w="100%" label={t("mlk.fields.investor")} data={investorOptions} value={form.investor_id ?? null} disabled={disabled} onChange={(value) => setField("investor_id", value)} clearable searchable />
                {selectedInvestor ? <Anchor onClick={() => navigate(`/franchise/mlk/investors/${selectedInvestor.id}`)}>51%</Anchor> : <Text>51%</Text>}
              </Group>
              <Group align="flex-end" wrap="nowrap">
                <Select w="100%" label={t("mlk.fields.couple")} data={coupleOptions} value={form.couple_id ?? null} disabled={disabled} onChange={(value) => setField("couple_id", value)} clearable searchable />
                {selectedCouple ? <Anchor onClick={() => navigate(`/franchise/mlk/couples/${selectedCouple.id}`)}>48%</Anchor> : <Text>48%</Text>}
              </Group>
              <Group justify="space-between">
                <Text>{t("mlk.fields.cuisine")}</Text>
                <Text fw={600}>{detailQuery.data?.store.cuisine_name || "-"}</Text>
              </Group>
              <Group justify="space-between">
                <Text>{t("mlk.fields.manager")}</Text>
                {detailQuery.data?.store.manager_id && detailQuery.data.store.manager_name ? (
                  <Anchor onClick={() => navigate(`/franchise/mlk/managers/${detailQuery.data?.store.manager_id}`)}>{detailQuery.data.store.manager_name}</Anchor>
                ) : (
                  <Text>-</Text>
                )}
              </Group>
              <Group justify="space-between">
                <Text>Kaider Management</Text>
                <Text fw={600}>1%</Text>
              </Group>
            </Stack>
          </Card>

          <Card withBorder shadow="xs" p="sm">
            <Text fw={600} mb="sm">{t("mlk.cards.foodCourt")}</Text>
            <Stack gap="sm">
              <Select label={t("mlk.fields.food_court")} data={foodCourtOptions} value={form.food_court_id ?? null} disabled={disabled} onChange={(value) => setField("food_court_id", value)} clearable searchable />
              {selectedFoodCourt ? <Anchor onClick={() => navigate(`/franchise/fnb/${selectedFoodCourt.id}`)}>{t("mlk.actions.viewFoodCourt")}</Anchor> : null}
              <NumberInput label={t("mlk.fields.fc_deposit_amount")} value={form.fc_deposit_amount ?? ""} min={0} thousandSeparator="," disabled={disabled} onChange={(value) => setField("fc_deposit_amount", typeof value === "number" ? value : null)} />
            </Stack>
          </Card>
        </Stack>
      </Grid.Col>
    </Grid>
  );

  const paymentsSection = (
    <Card withBorder shadow="xs" p="sm">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{t("mlk.cards.payments")}</Text>
        {canManage && !isNew ? <Button size="xs" onClick={() => openPayment()} disabled={!form.investor_id}>{t("mlk.payments.add")}</Button> : null}
      </Group>
      <Progress value={progress.pct} mb="xs" />
      <Text size="sm" c="dimmed" mb="sm">{formatSgd(progress.paid)} / {formatSgd(progress.due)}</Text>
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("mlk.fields.kind")}</Table.Th>
            <Table.Th>{t("mlk.fields.amount_due")}</Table.Th>
            <Table.Th>{t("mlk.fields.amount_paid")}</Table.Th>
            <Table.Th>{t("mlk.fields.paid_at")}</Table.Th>
            <Table.Th>{t("mlk.fields.status")}</Table.Th>
            <Table.Th>{t("common.actions")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {payments.map((payment) => (
            <Table.Tr key={payment.id}>
              <Table.Td>{t(`mlk.payments.kind.${payment.kind}`)}</Table.Td>
              <Table.Td>{formatSgd(payment.amount_due)}</Table.Td>
              <Table.Td>{formatSgd(payment.amount_paid)}</Table.Td>
              <Table.Td>{formatDate(payment.paid_at)}</Table.Td>
              <Table.Td><Badge color={payment.status === "paid" ? "green" : payment.status === "refunded" ? "gray" : "yellow"} variant="light">{t(`mlk.status.payment.${payment.status}`)}</Badge></Table.Td>
              <Table.Td>
                {canManage ? (
                  <Group gap={4}>
                    <Button size="xs" variant="subtle" onClick={() => openPayment(payment)}>{t("common.edit")}</Button>
                    <Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("mlk.messages.confirmDelete")) && deletePaymentMutation.mutate(payment.id)}>{t("common.delete")}</Button>
                  </Group>
                ) : null}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );

  const revenueSection = (
    <Stack gap="md">
      <Card withBorder shadow="xs" p="sm">
        <Text fw={600} mb="sm">{t("mlk.cards.revenueOverview")}</Text>
        <Grid>
          <Grid.Col span={4}><Text c="dimmed" size="sm">{t("mlk.revenue.currentMonth")}</Text><MlkMoneyText value={sumRevenue(currentRevenueQuery.data?.revenue ?? [])} fw={700} /></Grid.Col>
          <Grid.Col span={4}><Text c="dimmed" size="sm">{t("mlk.revenue.previousMonth")}</Text><MlkMoneyText value={sumRevenue(previousRevenueQuery.data?.revenue ?? [])} fw={700} /></Grid.Col>
          <Grid.Col span={4}><Text c="dimmed" size="sm">{t("mlk.settlements.latest")}</Text><MlkMoneyText value={latestSettlement?.net_profit ?? null} fw={700} /></Grid.Col>
        </Grid>
      </Card>
      <Card withBorder shadow="xs" p="sm">
        <Group justify="space-between" mb="sm">
          <TextInput type="month" label={t("mlk.fields.month")} value={revenueMonth} onChange={(event) => setRevenueMonth(event.currentTarget.value)} />
          {canManage ? <Button onClick={() => setRevenueModalOpen(true)}>{t("mlk.revenue.add")}</Button> : null}
        </Group>
        <Table withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr><Table.Th>{t("mlk.fields.date")}</Table.Th><Table.Th>{t("mlk.fields.turnover")}</Table.Th><Table.Th>{t("mlk.fields.source")}</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(revenueQuery.data?.revenue ?? []).map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{row.date}</Table.Td>
                <Table.Td>{formatSgd(row.turnover)}</Table.Td>
                <Table.Td><Badge color={row.source === "kitchen" ? "blue" : "gray"}>{row.source}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );

  const settlementsSection = (
    <Card withBorder shadow="xs" p="sm">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <Text fw={600}>{t("mlk.tabs.settlements")}</Text>
          {!form.food_court_id ? <Badge color="yellow">{t("mlk.settlements.linkFoodCourtFirst")}</Badge> : null}
        </Group>
        {canManage ? <Button disabled={!form.food_court_id} onClick={() => setSettlementModalOpen(true)}>{t("mlk.settlements.generate")}</Button> : null}
      </Group>
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("mlk.fields.month")}</Table.Th>
            <Table.Th>{t("mlk.fields.turnover")}</Table.Th>
            <Table.Th>{t("mlk.fields.net_profit")}</Table.Th>
            <Table.Th>{t("mlk.fields.investor_payout")}</Table.Th>
            <Table.Th>{t("mlk.fields.couple_payout")}</Table.Th>
            <Table.Th>{t("mlk.fields.mgmt_payout")}</Table.Th>
            <Table.Th>{t("common.actions")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {settlements.map((settlement) => (
            <Table.Tr key={settlement.id}>
              <Table.Td>{settlement.month}</Table.Td>
              <Table.Td>{formatSgd(settlement.turnover)}</Table.Td>
              <Table.Td>{formatSgd(settlement.net_profit)}</Table.Td>
              <Table.Td>{formatSgd(settlement.investor_payout)}</Table.Td>
              <Table.Td>{formatSgd(settlement.couple_payout)}</Table.Td>
              <Table.Td>{formatSgd(settlement.mgmt_payout)}</Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <Popover width={300} withArrow shadow="md">
                    <Popover.Target><Button size="xs" variant="subtle">{t("mlk.settlements.detail")}</Button></Popover.Target>
                    <Popover.Dropdown><Text size="xs" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(settlement.detail ?? {}, null, 2)}</Text></Popover.Dropdown>
                  </Popover>
                  {canManage ? <Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("mlk.messages.confirmDelete")) && deleteSettlementMutation.mutate(settlement.id)}>{t("common.delete")}</Button> : null}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );

  return (
    <Box mt={-16}>
      <Paper px="sm" py={6} mb="sm" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="sm">
            <Button variant="subtle" size="xs" onClick={() => navigate("/franchise/mlk")}>
              {t("common.back")}
            </Button>
            <Text size="md" fw={500}>
              {isNew ? t("mlk.actions.newStore") : form.name || t("mlk.detail.store")}
            </Text>
            {!isNew ? (
              <Badge color={storeStatusColor(form.status)} variant={form.status === "closed" ? "filled" : "light"}>
                {t(`mlk.status.store.${form.status}`)}
              </Badge>
            ) : null}
          </Group>
          {canManage ? (
            <Group gap="xs">
              {!isNew ? (
                <Button color="red" variant="light" size="xs" loading={deleteMutation.isPending} onClick={remove}>
                  {t("common.delete")}
                </Button>
              ) : null}
              <Button size="xs" loading={saving} onClick={save}>
                {t("common.save")}
              </Button>
            </Group>
          ) : null}
        </Group>
      </Paper>

      {toast ? <Alert color={toast.color} mb="sm" variant="light">{toast.message}</Alert> : null}
      <ErrorAlert error={detailQuery.error} />

      <Modal opened={Boolean(stepModal)} onClose={() => setStepModal(null)} title={t("mlk.lifecycle.advance")}>
        {stepModal ? (
          <Stack gap="md">
            <Text>{t("mlk.lifecycle.advanceTo", { status: t(`mlk.status.store.${stepModal.status}`) })}</Text>
            <TextInput type="date" label={t("mlk.fields.date")} value={stepModal.date} onChange={(event) => setStepModal({ ...stepModal, date: event.currentTarget.value })} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setStepModal(null)}>{t("common.cancel")}</Button>
              <Button loading={updateMutation.isPending} onClick={advanceStatus}>{t("common.save")}</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal opened={Boolean(paymentModal)} onClose={() => setPaymentModal(null)} title={paymentModal?.id ? t("mlk.payments.edit") : t("mlk.payments.add")}>
        {paymentModal ? (
          <Stack gap="md">
            <Select label={t("mlk.fields.kind")} data={paymentKinds.map((kind) => ({ value: kind, label: t(`mlk.payments.kind.${kind}`) }))} value={paymentModal.kind} onChange={(value) => setPaymentModal({ ...paymentModal, kind: (value ?? "instalment1") as MlkPaymentKind })} />
            <NumberInput label={t("mlk.fields.amount_due")} value={paymentModal.amount_due} min={0} thousandSeparator="," onChange={(value) => setPaymentModal({ ...paymentModal, amount_due: typeof value === "number" ? value : 0 })} />
            <NumberInput label={t("mlk.fields.amount_paid")} value={paymentModal.amount_paid} min={0} thousandSeparator="," onChange={(value) => setPaymentModal({ ...paymentModal, amount_paid: typeof value === "number" ? value : 0 })} />
            <TextInput type="date" label={t("mlk.fields.paid_at")} value={dateInputValue(paymentModal.paid_at)} onChange={(event) => setPaymentModal({ ...paymentModal, paid_at: event.currentTarget.value || null })} />
            <Select label={t("mlk.fields.status")} data={paymentStatuses.map((status) => ({ value: status, label: t(`mlk.status.payment.${status}`) }))} value={paymentModal.status} onChange={(value) => setPaymentModal({ ...paymentModal, status: (value ?? "pending") as MlkPaymentStatus })} />
            <Textarea label={t("mlk.fields.notes")} value={paymentModal.notes ?? ""} onChange={(event) => setPaymentModal({ ...paymentModal, notes: event.currentTarget.value || null })} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setPaymentModal(null)}>{t("common.cancel")}</Button>
              <Button loading={paymentMutation.isPending} onClick={() => paymentMutation.mutate(paymentModal)} disabled={!form.investor_id}>{t("common.save")}</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal opened={revenueModalOpen} onClose={() => setRevenueModalOpen(false)} title={t("mlk.revenue.add")}>
        <Stack gap="md">
          <TextInput type="date" label={t("mlk.fields.date")} value={revenueForm.date} onChange={(event) => setRevenueForm({ ...revenueForm, date: event.currentTarget.value })} />
          <NumberInput label={t("mlk.fields.turnover")} value={revenueForm.turnover} min={0} thousandSeparator="," onChange={(value) => setRevenueForm({ ...revenueForm, turnover: typeof value === "number" ? value : 0 })} />
          <Select label={t("mlk.fields.source")} data={[{ value: "manual", label: "manual" }, { value: "kitchen", label: "kitchen" }]} value={revenueForm.source ?? "manual"} onChange={(value) => setRevenueForm({ ...revenueForm, source: (value ?? "manual") as "manual" | "kitchen" })} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setRevenueModalOpen(false)}>{t("common.cancel")}</Button>
            <Button loading={revenueMutation.isPending} onClick={() => revenueMutation.mutate(revenueForm)}>{t("common.save")}</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={cuisineModalOpen} onClose={() => setCuisineModalOpen(false)} title={t("mlk.cuisines.add")}>
        <Stack gap="md">
          <TextInput label={t("mlk.fields.name")} value={cuisineForm.name} onChange={(event) => setCuisineForm({ ...cuisineForm, name: event.currentTarget.value })} />
          <Select label={t("mlk.fields.manager")} data={managerOptions} value={cuisineForm.manager_id ?? null} onChange={(value) => setCuisineForm({ ...cuisineForm, manager_id: value })} clearable searchable />
          <Textarea label={t("mlk.fields.notes")} value={cuisineForm.notes ?? ""} onChange={(event) => setCuisineForm({ ...cuisineForm, notes: event.currentTarget.value || null })} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setCuisineModalOpen(false)}>{t("common.cancel")}</Button>
            <Button loading={cuisineMutation.isPending} disabled={!cuisineForm.name.trim()} onClick={() => cuisineMutation.mutate({ ...cuisineForm, name: cuisineForm.name.trim() })}>{t("common.save")}</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={settlementModalOpen} onClose={() => setSettlementModalOpen(false)} title={t("mlk.settlements.generate")} size="lg">
        <Stack gap="md">
          <TextInput type="month" label={t("mlk.fields.month")} value={settlementMonth} onChange={(event) => setSettlementMonth(event.currentTarget.value)} />
          <NumberInput label={t("mlk.fields.turnover")} value={settlementTurnover} min={0} thousandSeparator="," onChange={(value) => setSettlementTurnover(typeof value === "number" ? value : 0)} />
          <Switch label={t("mlk.settlements.noRepay")} checked={noRepay} onChange={(event) => setNoRepay(event.currentTarget.checked)} />
          {settlementCalc ? <ResultPreview calc={settlementCalc} /> : <Alert color="yellow">{t("mlk.settlements.linkFoodCourtFirst")}</Alert>}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setSettlementModalOpen(false)}>{t("common.cancel")}</Button>
            <Button loading={settlementMutation.isPending} disabled={!settlementCalc} onClick={submitSettlement}>{t("mlk.settlements.confirm")}</Button>
          </Group>
        </Stack>
      </Modal>

      {detailQuery.isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Stack gap="md">
          {isNew ? (
            infoSection
          ) : (
            <Tabs defaultValue="info" keepMounted={false}>
              <Tabs.List mb="md">
                <Tabs.Tab value="steps">{t("mlk.tabs.steps")}</Tabs.Tab>
                <Tabs.Tab value="info">{t("mlk.tabs.info")}</Tabs.Tab>
                <Tabs.Tab value="payments">{t("mlk.tabs.payments")}</Tabs.Tab>
                <Tabs.Tab value="revenue">{t("mlk.tabs.revenue")}</Tabs.Tab>
                <Tabs.Tab value="settlements">{t("mlk.tabs.settlements")}</Tabs.Tab>
                <Tabs.Tab value="files">{t("mlk.tabs.files")}</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="steps">{stepperSection}</Tabs.Panel>
              <Tabs.Panel value="info">{infoSection}</Tabs.Panel>
              <Tabs.Panel value="payments">{paymentsSection}</Tabs.Panel>
              <Tabs.Panel value="revenue">{revenueSection}</Tabs.Panel>
              <Tabs.Panel value="settlements">{settlementsSection}</Tabs.Panel>
              <Tabs.Panel value="files">
                <MlkFilePanel folderId={form.drive_folder_id} canManage={canManage} />
              </Tabs.Panel>
            </Tabs>
          )}
        </Stack>
      )}
    </Box>
  );
}
