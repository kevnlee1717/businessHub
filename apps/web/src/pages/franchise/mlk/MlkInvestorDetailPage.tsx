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
  Progress,
  SegmentedControl,
  Select,
  Stack,
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
import {
  createMlkInvestor,
  createMlkPayment,
  deleteMlkInvestor,
  deleteMlkPayment,
  getMlkInvestor,
  listMlkInvestorPayments,
  listMlkStores,
  mlkInvestorDefaults,
  mlkKeys,
  updateMlkInvestor,
  updateMlkPayment,
  type MlkInvestor,
  type MlkInvestorInput,
  type MlkKycStatus,
  type MlkPayment,
  type MlkPaymentInput,
  type MlkPaymentKind,
  type MlkPaymentStatus,
  type MlkPrStatus,
  type MlkServiceTier
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { MlkFilePanel } from "./MlkFilePanel";
import { formatSgd } from "./MlkMoneyText";
import { dateInputValue, ErrorAlert, formatDate, kycColor, prColor, storeStatusColor, tierColor } from "./shared";

const servicePaymentKinds: MlkPaymentKind[] = ["service_tier1", "service_tier2_first", "service_tier2_second"];
const paymentStatuses: MlkPaymentStatus[] = ["pending", "paid", "refunded"];
const prStatuses: MlkPrStatus[] = ["none", "applied", "granted"];
const kycStatuses: MlkKycStatus[] = ["pending", "done"];

type PaymentForm = {
  id?: string;
  kind: MlkPaymentKind;
  amount_due: number;
  amount_paid: number;
  paid_at: string | null;
  status: MlkPaymentStatus;
  notes: string | null;
};

function normalizeInvestor(investor: MlkInvestor): MlkInvestorInput {
  return {
    name: investor.name ?? "",
    company_name: investor.company_name ?? null,
    uen: investor.uen ?? null,
    id_no: investor.id_no ?? null,
    phone: investor.phone ?? null,
    wechat: investor.wechat ?? null,
    address: investor.address ?? null,
    service_tier: investor.service_tier ?? "tier1",
    pr_status: investor.pr_status ?? "none",
    kyc_status: investor.kyc_status ?? "pending",
    drive_folder_id: investor.drive_folder_id ?? null,
    notes: investor.notes ?? null
  };
}

function cleanText(value?: string | null) {
  return value?.trim() || null;
}

function toInvestorBody(form: MlkInvestorInput): MlkInvestorInput {
  return {
    ...form,
    name: form.name.trim(),
    company_name: cleanText(form.company_name),
    uen: cleanText(form.uen),
    id_no: cleanText(form.id_no),
    phone: cleanText(form.phone),
    wechat: cleanText(form.wechat),
    address: cleanText(form.address),
    notes: cleanText(form.notes)
  };
}

function paymentProgress(payments: MlkPayment[]) {
  const due = payments.reduce((total, payment) => total + payment.amount_due, 0);
  const paid = payments.reduce((total, payment) => total + payment.amount_paid, 0);
  return { due, paid, pct: due > 0 ? Math.min(100, (paid / due) * 100) : 0 };
}

function defaultPaymentForm(kind: MlkPaymentKind = "service_tier1"): PaymentForm {
  return {
    kind,
    amount_due: 0,
    amount_paid: 0,
    paid_at: null,
    status: "pending",
    notes: null
  };
}

export function MlkInvestorDetailPage() {
  const { t } = useTranslation();
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [form, setForm] = useState<MlkInvestorInput>(mlkInvestorDefaults());
  const [toast, setToast] = useState<{ color: "green" | "red"; message: string } | null>(null);
  const [paymentModal, setPaymentModal] = useState<PaymentForm | null>(null);

  const detailQuery = useQuery({
    queryKey: mlkKeys.investor(id),
    queryFn: () => getMlkInvestor(id),
    enabled: !isNew
  });
  const storesQuery = useQuery({
    queryKey: mlkKeys.stores(),
    queryFn: listMlkStores,
    enabled: !isNew
  });
  const paymentsQuery = useQuery({
    queryKey: mlkKeys.investorPayments(id),
    queryFn: () => listMlkInvestorPayments(id),
    enabled: !isNew
  });

  useEffect(() => {
    if (detailQuery.data?.investor) setForm(normalizeInvestor(detailQuery.data.investor));
  }, [detailQuery.data?.investor]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createMutation = useMutation({
    mutationFn: createMlkInvestor,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      setToast({ color: "green", message: t("mlk.messages.saved") });
      navigate(`/franchise/mlk/investors/${data.investor.id}`, { replace: true });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const updateMutation = useMutation({
    mutationFn: (body: MlkInvestorInput) => updateMlkInvestor(id, body),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.investor(id) });
      setForm(normalizeInvestor(data.investor));
      setToast({ color: "green", message: t("mlk.messages.saved") });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMlkInvestor,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      navigate("/franchise/mlk?tab=investors");
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const paymentMutation = useMutation({
    mutationFn: (body: PaymentForm) => {
      const input: MlkPaymentInput = {
        investor_id: id,
        store_id: null,
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
      await queryClient.invalidateQueries({ queryKey: mlkKeys.investorPayments(id) });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const deletePaymentMutation = useMutation({
    mutationFn: deleteMlkPayment,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: mlkKeys.investorPayments(id) })
  });

  function setField<K extends keyof MlkInvestorInput>(key: K, value: MlkInvestorInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!canManage) return;
    if (!form.name.trim()) {
      setToast({ color: "red", message: t("mlk.messages.nameRequired") });
      return;
    }
    if (isNew) createMutation.mutate(toInvestorBody(form));
    else updateMutation.mutate(toInvestorBody(form));
  }

  function remove() {
    if (!canManage || isNew) return;
    if (!window.confirm(t("mlk.messages.confirmDelete"))) return;
    deleteMutation.mutate(id);
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

  const disabled = !canManage;
  const saving = createMutation.isPending || updateMutation.isPending;
  const stores = (storesQuery.data?.stores ?? []).filter((store) => store.investor_id === id);
  const allPayments = paymentsQuery.data?.payments ?? [];
  const payments = allPayments.filter((payment) => !payment.store_id && servicePaymentKinds.includes(payment.kind));
  const paymentByStoreId = useMemo(() => {
    const map = new Map<string, MlkPayment[]>();
    allPayments.forEach((payment) => {
      if (!payment.store_id) return;
      map.set(payment.store_id, [...(map.get(payment.store_id) ?? []), payment]);
    });
    return map;
  }, [allPayments]);

  return (
    <Box mt={-16}>
      <Paper px="sm" py={6} mb="sm" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="sm">
            <Button variant="subtle" size="xs" onClick={() => navigate("/franchise/mlk?tab=investors")}>
              {t("common.back")}
            </Button>
            <Text size="md" fw={500}>
              {isNew ? t("mlk.actions.newInvestor") : form.name || t("mlk.detail.investor")}
            </Text>
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
      <ErrorAlert error={detailQuery.error ?? storesQuery.error ?? paymentsQuery.error} />

      <Modal opened={Boolean(paymentModal)} onClose={() => setPaymentModal(null)} title={paymentModal?.id ? t("mlk.payments.edit") : t("mlk.payments.add")}>
        {paymentModal ? (
          <Stack gap="md">
            <Select label={t("mlk.fields.kind")} data={servicePaymentKinds.map((kind) => ({ value: kind, label: t(`mlk.payments.kind.${kind}`) }))} value={paymentModal.kind} onChange={(value) => setPaymentModal({ ...paymentModal, kind: (value ?? "service_tier1") as MlkPaymentKind })} />
            {paymentModal.kind === "service_tier2_second" && form.pr_status !== "granted" ? <Text size="sm" c="dimmed">{t("mlk.payments.prHint")}</Text> : null}
            <NumberInput label={t("mlk.fields.amount_due")} value={paymentModal.amount_due} min={0} thousandSeparator="," onChange={(value) => setPaymentModal({ ...paymentModal, amount_due: typeof value === "number" ? value : 0 })} />
            <NumberInput label={t("mlk.fields.amount_paid")} value={paymentModal.amount_paid} min={0} thousandSeparator="," onChange={(value) => setPaymentModal({ ...paymentModal, amount_paid: typeof value === "number" ? value : 0 })} />
            <TextInput type="date" label={t("mlk.fields.paid_at")} value={dateInputValue(paymentModal.paid_at)} onChange={(event) => setPaymentModal({ ...paymentModal, paid_at: event.currentTarget.value || null })} />
            <Select label={t("mlk.fields.status")} data={paymentStatuses.map((status) => ({ value: status, label: t(`mlk.status.payment.${status}`) }))} value={paymentModal.status} onChange={(value) => setPaymentModal({ ...paymentModal, status: (value ?? "pending") as MlkPaymentStatus })} />
            <Textarea label={t("mlk.fields.notes")} value={paymentModal.notes ?? ""} onChange={(event) => setPaymentModal({ ...paymentModal, notes: event.currentTarget.value || null })} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setPaymentModal(null)}>{t("common.cancel")}</Button>
              <Button loading={paymentMutation.isPending} onClick={() => paymentMutation.mutate(paymentModal)}>{t("common.save")}</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      {detailQuery.isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Stack gap="md">
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <Card withBorder shadow="xs" p="sm">
                <Text fw={600} mb="sm">{t("mlk.cards.profile")}</Text>
                <Grid gutter="sm">
                  <Grid.Col span={12}><TextInput label={t("mlk.fields.name")} value={form.name} disabled={disabled} onChange={(event) => setField("name", event.currentTarget.value)} /></Grid.Col>
                  <Grid.Col span={12}><SegmentedControl fullWidth data={(["tier1", "tier2"] as MlkServiceTier[]).map((tier) => ({ value: tier, label: t(`mlk.status.service_tier.${tier}`) }))} value={form.service_tier} disabled={disabled} onChange={(value) => setField("service_tier", value as MlkServiceTier)} /></Grid.Col>
                  <Grid.Col span={6}><Select label={t("mlk.fields.pr_status")} data={prStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.pr_status} disabled={disabled} onChange={(value) => setField("pr_status", (value ?? "none") as MlkPrStatus)} /></Grid.Col>
                  <Grid.Col span={6}><Select label={t("mlk.fields.kyc_status")} data={kycStatuses.map((value) => ({ value, label: t(`mlk.status.kyc.${value}`) }))} value={form.kyc_status} disabled={disabled} onChange={(value) => setField("kyc_status", (value ?? "pending") as MlkKycStatus)} /></Grid.Col>
                  <Grid.Col span={6}><TextInput label={t("mlk.fields.company_name")} value={form.company_name ?? ""} disabled={disabled} onChange={(event) => setField("company_name", event.currentTarget.value || null)} /></Grid.Col>
                  <Grid.Col span={6}><TextInput label={t("mlk.fields.uen")} value={form.uen ?? ""} disabled={disabled} onChange={(event) => setField("uen", event.currentTarget.value || null)} /></Grid.Col>
                  <Grid.Col span={6}><TextInput label={t("mlk.fields.id_no")} value={form.id_no ?? ""} disabled={disabled} onChange={(event) => setField("id_no", event.currentTarget.value || null)} /></Grid.Col>
                  <Grid.Col span={6}><TextInput label={t("mlk.fields.phone")} value={form.phone ?? ""} disabled={disabled} onChange={(event) => setField("phone", event.currentTarget.value || null)} /></Grid.Col>
                  <Grid.Col span={6}><TextInput label={t("mlk.fields.wechat")} value={form.wechat ?? ""} disabled={disabled} onChange={(event) => setField("wechat", event.currentTarget.value || null)} /></Grid.Col>
                  <Grid.Col span={6}><TextInput label={t("mlk.fields.drive_folder_id")} value={form.drive_folder_id ?? ""} disabled /></Grid.Col>
                  <Grid.Col span={12}><TextInput label={t("mlk.fields.address")} value={form.address ?? ""} disabled={disabled} onChange={(event) => setField("address", event.currentTarget.value || null)} /></Grid.Col>
                  <Grid.Col span={12}><Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} disabled={disabled} minRows={3} onChange={(event) => setField("notes", event.currentTarget.value || null)} /></Grid.Col>
                </Grid>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Stack gap="md">
                <Card withBorder shadow="xs" p="sm">
                  <Text fw={600} mb="sm">{t("mlk.cards.investorStores")}</Text>
                  <Grid gutter="sm">
                    {stores.map((store) => {
                      const progress = paymentProgress(paymentByStoreId.get(store.id) ?? []);
                      return (
                        <Grid.Col key={store.id} span={{ base: 12, md: 6 }}>
                          <Card withBorder p="sm">
                            <Group justify="space-between" mb="xs">
                              <Anchor onClick={() => navigate(`/franchise/mlk/stores/${store.id}`)}>{store.name}</Anchor>
                              <Badge color={storeStatusColor(store.status)}>{t(`mlk.status.store.${store.status}`)}</Badge>
                            </Group>
                            <Progress value={progress.pct} mb={4} />
                            <Text size="sm" c="dimmed">{formatSgd(progress.paid)} / {formatSgd(progress.due)}</Text>
                          </Card>
                        </Grid.Col>
                      );
                    })}
                    {stores.length === 0 ? <Grid.Col span={12}><Text c="dimmed">{t("mlk.messages.empty")}</Text></Grid.Col> : null}
                  </Grid>
                </Card>

                <Card withBorder shadow="xs" p="sm">
                  <Group justify="space-between" mb="sm">
                    <Text fw={600}>{t("mlk.cards.servicePayments")}</Text>
                    {canManage && !isNew ? <Button size="xs" onClick={() => openPayment()}>{t("mlk.payments.add")}</Button> : null}
                  </Group>
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
                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm">{t(`mlk.payments.kind.${payment.kind}`)}</Text>
                              {payment.kind === "service_tier2_second" && form.pr_status !== "granted" ? <Text size="xs" c="dimmed">{t("mlk.payments.prHint")}</Text> : null}
                            </Stack>
                          </Table.Td>
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
              </Stack>
            </Grid.Col>
          </Grid>

          {!isNew ? (
            <Tabs defaultValue="files" keepMounted={false}>
              <Tabs.List mb="md">
                <Tabs.Tab value="files">{t("mlk.tabs.files")}</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="files">
                <MlkFilePanel folderId={form.drive_folder_id} canManage={canManage} />
              </Tabs.Panel>
            </Tabs>
          ) : null}
        </Stack>
      )}
    </Box>
  );
}
