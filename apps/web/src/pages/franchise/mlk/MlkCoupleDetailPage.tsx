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
  createMlkCouple,
  createMlkLedgerEntry,
  deleteMlkCouple,
  deleteMlkLedgerEntry,
  getMlkCouple,
  listMlkCoupleLedger,
  listMlkCouples,
  listMlkStores,
  mlkCoupleDefaults,
  mlkKeys,
  updateMlkCouple,
  updateMlkLedgerEntry,
  type MlkCouple,
  type MlkCoupleInput,
  type MlkCoupleStatus,
  type MlkEpStatus,
  type MlkLedgerEntry,
  type MlkLedgerInput,
  type MlkLedgerKind,
  type MlkPrStatus
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { MlkFilePanel } from "./MlkFilePanel";
import { formatSgd } from "./MlkMoneyText";
import { coupleStatusColor, dateInputValue, ErrorAlert, formatDate, prColor, storeStatusColor } from "./shared";

const epStatuses: MlkEpStatus[] = ["none", "applied", "granted"];
const prStatuses: MlkPrStatus[] = ["none", "applied", "granted"];
const coupleStatuses: MlkCoupleStatus[] = ["candidate", "active", "exited"];
const ledgerKinds: MlkLedgerKind[] = [
  "advance_repay",
  "retention_hold",
  "retention_refund",
  "bond_paid",
  "bond_refund",
  "platform_fee",
  "mentor_income"
];

type LedgerForm = {
  id?: string;
  month: string;
  kind: MlkLedgerKind;
  amount: number;
  store_id: string | null;
  notes: string | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthStart(month: string) {
  return `${month}-01`;
}

function normalizeMonth(value?: string | null) {
  return value ? value.slice(0, 7) : currentMonth();
}

function normalizeCouple(couple: MlkCouple): MlkCoupleInput {
  return {
    operator_company: couple.operator_company ?? null,
    operator_uen: couple.operator_uen ?? null,
    husband_name: couple.husband_name ?? "",
    husband_id_no: couple.husband_id_no ?? null,
    husband_passport: couple.husband_passport ?? null,
    wife_name: couple.wife_name ?? "",
    wife_id_no: couple.wife_id_no ?? null,
    wife_passport: couple.wife_passport ?? null,
    phone: couple.phone ?? null,
    wechat: couple.wechat ?? null,
    husband_ep: couple.husband_ep ?? "none",
    wife_ep: couple.wife_ep ?? "none",
    pr_status: couple.pr_status ?? "none",
    mentor_id: couple.mentor_id ?? null,
    status: couple.status ?? "candidate",
    joined_at: dateInputValue(couple.joined_at) || null,
    exited_at: dateInputValue(couple.exited_at) || null,
    drive_folder_id: couple.drive_folder_id ?? null,
    notes: couple.notes ?? null
  };
}

function cleanText(value?: string | null) {
  return value?.trim() || null;
}

function toCoupleBody(form: MlkCoupleInput): MlkCoupleInput {
  return {
    ...form,
    operator_company: cleanText(form.operator_company),
    operator_uen: cleanText(form.operator_uen),
    husband_name: form.husband_name.trim(),
    husband_id_no: cleanText(form.husband_id_no),
    husband_passport: cleanText(form.husband_passport),
    wife_name: form.wife_name.trim(),
    wife_id_no: cleanText(form.wife_id_no),
    wife_passport: cleanText(form.wife_passport),
    phone: cleanText(form.phone),
    wechat: cleanText(form.wechat),
    notes: cleanText(form.notes)
  };
}

function defaultLedgerForm(): LedgerForm {
  return {
    month: currentMonth(),
    kind: "advance_repay",
    amount: 0,
    store_id: null,
    notes: null
  };
}

function ledgerColor(kind: MlkLedgerKind) {
  if (kind.endsWith("_refund")) return "green";
  if (kind === "advance_repay") return "blue";
  if (kind === "platform_fee") return "yellow";
  return "gray";
}

function calcBalances(ledger: MlkLedgerEntry[]) {
  const sum = (kind: MlkLedgerKind) => ledger.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.amount, 0);
  const advanceRepaid = sum("advance_repay");
  const advanceRemaining = Math.max(50000 - advanceRepaid, 0);
  const retention = sum("retention_hold") - sum("retention_refund");
  const bond = sum("bond_paid") - sum("bond_refund");
  return { advanceRepaid, advanceRemaining, retention, bond };
}

export function MlkCoupleDetailPage() {
  const { t } = useTranslation();
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [form, setForm] = useState<MlkCoupleInput>(mlkCoupleDefaults());
  const [toast, setToast] = useState<{ color: "green" | "red"; message: string } | null>(null);
  const [ledgerModal, setLedgerModal] = useState<LedgerForm | null>(null);

  const detailQuery = useQuery({
    queryKey: mlkKeys.couple(id),
    queryFn: () => getMlkCouple(id),
    enabled: !isNew
  });
  const couplesQuery = useQuery({
    queryKey: mlkKeys.couples(),
    queryFn: listMlkCouples
  });
  const storesQuery = useQuery({
    queryKey: mlkKeys.stores(),
    queryFn: listMlkStores,
    enabled: !isNew
  });
  const ledgerQuery = useQuery({
    queryKey: mlkKeys.coupleLedger(id),
    queryFn: () => listMlkCoupleLedger(id),
    enabled: !isNew
  });

  useEffect(() => {
    if (detailQuery.data?.couple) setForm(normalizeCouple(detailQuery.data.couple));
  }, [detailQuery.data?.couple]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createMutation = useMutation({
    mutationFn: createMlkCouple,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      setToast({ color: "green", message: t("mlk.messages.saved") });
      navigate(`/franchise/mlk/couples/${data.couple.id}`, { replace: true });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const updateMutation = useMutation({
    mutationFn: (body: MlkCoupleInput) => updateMlkCouple(id, body),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.couple(id) });
      setForm(normalizeCouple(data.couple));
      setToast({ color: "green", message: t("mlk.messages.saved") });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMlkCouple,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      navigate("/franchise/mlk?tab=couples");
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const ledgerMutation = useMutation({
    mutationFn: (body: LedgerForm) => {
      const input: MlkLedgerInput = {
        couple_id: id,
        store_id: body.store_id,
        month: monthStart(body.month),
        kind: body.kind,
        amount: body.amount,
        notes: cleanText(body.notes)
      };
      return body.id ? updateMlkLedgerEntry(body.id, input) : createMlkLedgerEntry(input);
    },
    onSuccess: async () => {
      setLedgerModal(null);
      await queryClient.invalidateQueries({ queryKey: mlkKeys.coupleLedger(id) });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const deleteLedgerMutation = useMutation({
    mutationFn: deleteMlkLedgerEntry,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: mlkKeys.coupleLedger(id) })
  });

  function setField<K extends keyof MlkCoupleInput>(key: K, value: MlkCoupleInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!canManage) return;
    if (!form.husband_name.trim() || !form.wife_name.trim()) {
      setToast({ color: "red", message: t("mlk.messages.coupleNameRequired") });
      return;
    }
    if (isNew) createMutation.mutate(toCoupleBody(form));
    else updateMutation.mutate(toCoupleBody(form));
  }

  function remove() {
    if (!canManage || isNew) return;
    if (!window.confirm(t("mlk.messages.confirmDelete"))) return;
    deleteMutation.mutate(id);
  }

  function openLedger(entry?: MlkLedgerEntry) {
    setLedgerModal(
      entry
        ? {
            id: entry.id,
            month: normalizeMonth(entry.month),
            kind: entry.kind,
            amount: entry.amount,
            store_id: entry.store_id ?? null,
            notes: entry.notes ?? null
          }
        : defaultLedgerForm()
    );
  }

  const disabled = !canManage;
  const saving = createMutation.isPending || updateMutation.isPending;
  const couples = couplesQuery.data?.couples ?? [];
  const stores = (storesQuery.data?.stores ?? []).filter((store) => store.couple_id === id);
  const allStores = storesQuery.data?.stores ?? [];
  const ledger = ledgerQuery.data?.ledger ?? [];
  const balances = calcBalances(ledger);
  const mentor = couples.find((couple) => couple.id === form.mentor_id);
  const apprentices = couples.filter((couple) => couple.mentor_id === id);
  const mentorOptions = couples.filter((couple) => couple.id !== id).map((couple) => ({ value: couple.id, label: `${couple.husband_name} / ${couple.wife_name}` }));
  const storeOptions = allStores.map((store) => ({ value: store.id, label: store.name }));
  const storeNameById = useMemo(() => new Map(allStores.map((store) => [store.id, store.name] as const)), [allStores]);

  return (
    <Box mt={-16}>
      <Paper px="sm" py={6} mb="sm" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="sm">
            <Button variant="subtle" size="xs" onClick={() => navigate("/franchise/mlk?tab=couples")}>
              {t("common.back")}
            </Button>
            <Text size="md" fw={500}>
              {isNew ? t("mlk.actions.newCouple") : `${form.husband_name || "-"} / ${form.wife_name || "-"}`}
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
      <ErrorAlert error={detailQuery.error ?? couplesQuery.error ?? storesQuery.error ?? ledgerQuery.error} />

      <Modal opened={Boolean(ledgerModal)} onClose={() => setLedgerModal(null)} title={ledgerModal?.id ? t("mlk.ledger.edit") : t("mlk.ledger.add")}>
        {ledgerModal ? (
          <Stack gap="md">
            <TextInput type="month" label={t("mlk.fields.month")} value={ledgerModal.month} onChange={(event) => setLedgerModal({ ...ledgerModal, month: event.currentTarget.value })} />
            <Select label={t("mlk.fields.kind")} data={ledgerKinds.map((kind) => ({ value: kind, label: t(`mlk.ledger.kind.${kind}`) }))} value={ledgerModal.kind} onChange={(value) => setLedgerModal({ ...ledgerModal, kind: (value ?? "advance_repay") as MlkLedgerKind })} />
            <NumberInput label={t("mlk.fields.amount")} value={ledgerModal.amount} thousandSeparator="," onChange={(value) => setLedgerModal({ ...ledgerModal, amount: typeof value === "number" ? value : 0 })} />
            <Select label={t("mlk.fields.store")} data={storeOptions} value={ledgerModal.store_id} onChange={(value) => setLedgerModal({ ...ledgerModal, store_id: value })} clearable searchable />
            <Textarea label={t("mlk.fields.notes")} value={ledgerModal.notes ?? ""} onChange={(event) => setLedgerModal({ ...ledgerModal, notes: event.currentTarget.value || null })} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setLedgerModal(null)}>{t("common.cancel")}</Button>
              <Button loading={ledgerMutation.isPending} onClick={() => ledgerMutation.mutate(ledgerModal)}>{t("common.save")}</Button>
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
              <Stack gap="md">
                <Card withBorder shadow="xs" p="sm">
                  <Text fw={600} mb="sm">{t("mlk.cards.coupleProfile")}</Text>
                  <Grid gutter="sm">
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.husband_name")} value={form.husband_name} disabled={disabled} onChange={(event) => setField("husband_name", event.currentTarget.value)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.wife_name")} value={form.wife_name} disabled={disabled} onChange={(event) => setField("wife_name", event.currentTarget.value)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.husband_id_no")} value={form.husband_id_no ?? ""} disabled={disabled} onChange={(event) => setField("husband_id_no", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.wife_id_no")} value={form.wife_id_no ?? ""} disabled={disabled} onChange={(event) => setField("wife_id_no", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.husband_passport")} value={form.husband_passport ?? ""} disabled={disabled} onChange={(event) => setField("husband_passport", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.wife_passport")} value={form.wife_passport ?? ""} disabled={disabled} onChange={(event) => setField("wife_passport", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><Select label={t("mlk.fields.husband_ep")} data={epStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.husband_ep} disabled={disabled} onChange={(value) => setField("husband_ep", (value ?? "none") as MlkEpStatus)} /></Grid.Col>
                    <Grid.Col span={6}><Select label={t("mlk.fields.wife_ep")} data={epStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.wife_ep} disabled={disabled} onChange={(value) => setField("wife_ep", (value ?? "none") as MlkEpStatus)} /></Grid.Col>
                  </Grid>
                </Card>

                <Card withBorder shadow="xs" p="sm">
                  <Text fw={600} mb="sm">{t("mlk.cards.operator")}</Text>
                  <Grid gutter="sm">
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.operator_company")} value={form.operator_company ?? ""} disabled={disabled} onChange={(event) => setField("operator_company", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.operator_uen")} value={form.operator_uen ?? ""} disabled={disabled} onChange={(event) => setField("operator_uen", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.phone")} value={form.phone ?? ""} disabled={disabled} onChange={(event) => setField("phone", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput label={t("mlk.fields.wechat")} value={form.wechat ?? ""} disabled={disabled} onChange={(event) => setField("wechat", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={4}><Select label={t("mlk.fields.pr_status")} data={prStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.pr_status} disabled={disabled} onChange={(value) => setField("pr_status", (value ?? "none") as MlkPrStatus)} /></Grid.Col>
                    <Grid.Col span={4}><Select label={t("mlk.fields.status")} data={coupleStatuses.map((value) => ({ value, label: t(`mlk.status.couple.${value}`) }))} value={form.status} disabled={disabled} onChange={(value) => setField("status", (value ?? "candidate") as MlkCoupleStatus)} /></Grid.Col>
                    <Grid.Col span={4}><Select label={t("mlk.fields.mentor_id")} data={mentorOptions} value={form.mentor_id ?? null} disabled={disabled} onChange={(value) => setField("mentor_id", value)} clearable searchable /></Grid.Col>
                    <Grid.Col span={6}><TextInput type="date" label={t("mlk.fields.joined_at")} value={dateInputValue(form.joined_at)} disabled={disabled} onChange={(event) => setField("joined_at", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={6}><TextInput type="date" label={t("mlk.fields.exited_at")} value={dateInputValue(form.exited_at)} disabled={disabled} onChange={(event) => setField("exited_at", event.currentTarget.value || null)} /></Grid.Col>
                    <Grid.Col span={12}><Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} disabled={disabled} minRows={2} onChange={(event) => setField("notes", event.currentTarget.value || null)} /></Grid.Col>
                  </Grid>
                </Card>

                <Card withBorder shadow="xs" p="sm">
                  <Text fw={600} mb="sm">{t("mlk.cards.mentor")}</Text>
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Text c="dimmed">{t("mlk.fields.mentor_id")}:</Text>
                      {mentor ? <Anchor onClick={() => navigate(`/franchise/mlk/couples/${mentor.id}`)}>{mentor.husband_name} / {mentor.wife_name}</Anchor> : <Text>-</Text>}
                    </Group>
                    <Text c="dimmed" size="sm">{t("mlk.mentor.apprentices")}</Text>
                    {apprentices.length === 0 ? <Text size="sm">-</Text> : apprentices.map((couple) => (
                      <Anchor key={couple.id} onClick={() => navigate(`/franchise/mlk/couples/${couple.id}`)}>{couple.husband_name} / {couple.wife_name}</Anchor>
                    ))}
                  </Stack>
                </Card>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Stack gap="md">
                <Grid gutter="sm">
                  <Grid.Col span={{ base: 12, md: 4 }}><Card withBorder p="sm"><Text c="dimmed" size="sm">{t("mlk.balances.advanceRemaining")}</Text><Text fw={700}>{formatSgd(balances.advanceRemaining)}</Text>{balances.advanceRemaining <= 0 ? <Badge color="green">{t("mlk.balances.paidOff")}</Badge> : null}</Card></Grid.Col>
                  <Grid.Col span={{ base: 12, md: 4 }}><Card withBorder p="sm"><Text c="dimmed" size="sm">{t("mlk.balances.retention")}</Text><Text fw={700}>{formatSgd(balances.retention)}</Text></Card></Grid.Col>
                  <Grid.Col span={{ base: 12, md: 4 }}><Card withBorder p="sm"><Text c="dimmed" size="sm">{t("mlk.balances.bond")}</Text><Text fw={700}>{formatSgd(balances.bond)}</Text></Card></Grid.Col>
                </Grid>

                <Card withBorder shadow="xs" p="sm">
                  <Group justify="space-between" mb="sm">
                    <Text fw={600}>{t("mlk.cards.ledger")}</Text>
                    {canManage && !isNew ? <Button size="xs" onClick={() => openLedger()}>{t("mlk.ledger.add")}</Button> : null}
                  </Group>
                  <Table withTableBorder withColumnBorders highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("mlk.fields.month")}</Table.Th>
                        <Table.Th>{t("mlk.fields.kind")}</Table.Th>
                        <Table.Th>{t("mlk.fields.amount")}</Table.Th>
                        <Table.Th>{t("mlk.fields.store")}</Table.Th>
                        <Table.Th>{t("mlk.fields.notes")}</Table.Th>
                        <Table.Th>{t("common.actions")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {ledger.map((entry) => (
                        <Table.Tr key={entry.id}>
                          <Table.Td>{entry.month}</Table.Td>
                          <Table.Td><Badge color={ledgerColor(entry.kind)} variant="light">{t(`mlk.ledger.kind.${entry.kind}`)}</Badge></Table.Td>
                          <Table.Td>{formatSgd(entry.amount)}</Table.Td>
                          <Table.Td>{entry.store_id ? storeNameById.get(entry.store_id) ?? "-" : "-"}</Table.Td>
                          <Table.Td>{entry.notes || "-"}</Table.Td>
                          <Table.Td>
                            {canManage ? (
                              <Group gap={4}>
                                <Button size="xs" variant="subtle" onClick={() => openLedger(entry)}>{t("common.edit")}</Button>
                                <Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("mlk.messages.confirmDelete")) && deleteLedgerMutation.mutate(entry.id)}>{t("common.delete")}</Button>
                              </Group>
                            ) : null}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>

                <Card withBorder shadow="xs" p="sm">
                  <Text fw={600} mb="sm">{t("mlk.cards.coupleStores")}</Text>
                  <Grid gutter="sm">
                    {stores.map((store) => (
                      <Grid.Col key={store.id} span={{ base: 12, md: 6 }}>
                        <Card withBorder p="sm">
                          <Group justify="space-between">
                            <Anchor onClick={() => navigate(`/franchise/mlk/stores/${store.id}`)}>{store.name}</Anchor>
                            <Badge color={storeStatusColor(store.status)}>{t(`mlk.status.store.${store.status}`)}</Badge>
                          </Group>
                        </Card>
                      </Grid.Col>
                    ))}
                    {stores.length === 0 ? <Grid.Col span={12}><Text c="dimmed">{t("mlk.messages.empty")}</Text></Grid.Col> : null}
                  </Grid>
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
