import { Alert, Anchor, Badge, Box, Button, Card, Grid, Group, Loader, Modal, NumberInput, Paper, Popover, Select, Stack, Table, Tabs, Text, TextInput, Textarea } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  createMlkCuisine,
  createMlkManagerSettlement,
  deleteMlkCuisine,
  deleteMlkManager,
  deleteMlkManagerSettlement,
  getMlkManager,
  listMlkStores,
  listMlkManagers,
  listMlkManagerSettlements,
  mlkKeys,
  mlkManagerDefaults,
  mlkManagerSettlementDefaults,
  previewMlkManagerSettlement,
  updateMlkCuisine,
  updateMlkManager,
  updateMlkManagerSettlement,
  type MlkCuisine,
  type MlkCuisineInput,
  type MlkManager,
  type MlkManagerInput,
  type MlkManagerSettlement,
  type MlkManagerSettlementInput,
  type MlkManagerStatus
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { MlkFilePanel } from "./MlkFilePanel";
import { formatSgd, MlkMoneyText } from "./MlkMoneyText";
import { dateInputValue, ErrorAlert, formatDate, managerStatusColor, storeStatusColor } from "./shared";

const managerStatuses: MlkManagerStatus[] = ["candidate", "active", "exited"];

type CuisineForm = MlkCuisineInput & { id?: string };
type SettlementForm = MlkManagerSettlementInput & { id?: string };

function currentMonthStart() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function cleanText(value?: string | null) {
  return value?.trim() || null;
}

function normalizeManager(manager: MlkManager): MlkManagerInput {
  return {
    name: manager.name ?? "",
    phone: manager.phone ?? null,
    wechat: manager.wechat ?? null,
    id_no: manager.id_no ?? null,
    status: manager.status ?? "candidate",
    joined_at: dateInputValue(manager.joined_at) || null,
    exited_at: dateInputValue(manager.exited_at) || null,
    mgmt_fee_rate: manager.mgmt_fee_rate ?? 3,
    excess_bonus_rate: manager.excess_bonus_rate ?? 10,
    profit_threshold: manager.profit_threshold ?? 5600,
    drive_folder_id: manager.drive_folder_id ?? null,
    notes: manager.notes ?? null
  };
}

function toManagerBody(form: MlkManagerInput): MlkManagerInput {
  const values = { ...form };
  delete values.brand_name;
  delete values.branding;
  return {
    ...values,
    name: values.name.trim(),
    phone: cleanText(values.phone),
    wechat: cleanText(values.wechat),
    id_no: cleanText(values.id_no),
    notes: cleanText(values.notes)
  };
}

function toCuisineBody(form: CuisineForm): MlkCuisineInput {
  return {
    name: form.name.trim(),
    manager_id: form.manager_id ?? null,
    notes: cleanText(form.notes)
  };
}

function settlementFromRow(row: MlkManagerSettlement): SettlementForm {
  return {
    id: row.id,
    manager_id: row.manager_id,
    month: row.month,
    mgmt_fee: row.mgmt_fee,
    material_share: row.material_share,
    training_fee: row.training_fee,
    opening_surplus: row.opening_surplus,
    excess_bonus: row.excess_bonus,
    central_kitchen: row.central_kitchen,
    other: row.other,
    detail: row.detail ?? null,
    notes: row.notes ?? null
  };
}

function settlementTotal(form: SettlementForm) {
  return form.mgmt_fee + form.material_share + form.training_fee + form.opening_surplus + form.excess_bonus + form.central_kitchen + form.other;
}

function errorText(error: unknown, t: (key: string) => string) {
  if (error instanceof ApiError) {
    if (error.message === "manager_has_cuisines") return t("mlk.messages.managerHasCuisines");
    if (error.message === "manager_has_settlements") return t("mlk.messages.managerHasSettlements");
    if (error.message === "cuisine_has_stores") return t("mlk.messages.cuisineHasStores");
    if (error.message === "manager_settlement_exists") return t("mlk.messages.managerSettlementExists");
  }
  return error instanceof Error ? error.message : t("common.unknown_error");
}

export function MlkManagerDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [form, setForm] = useState<MlkManagerInput>(mlkManagerDefaults());
  const [toast, setToast] = useState<{ color: "green" | "red"; message: string } | null>(null);
  const [cuisineModal, setCuisineModal] = useState<CuisineForm | null>(null);
  const [settlementModal, setSettlementModal] = useState<SettlementForm | null>(null);
  const [previewMonth, setPreviewMonth] = useState(currentMonthStart());

  const detailQuery = useQuery({
    queryKey: mlkKeys.manager(id),
    queryFn: () => getMlkManager(id),
    enabled: Boolean(id)
  });
  const managersQuery = useQuery({ queryKey: mlkKeys.managers(), queryFn: listMlkManagers });
  const settlementsQuery = useQuery({
    queryKey: mlkKeys.managerSettlements(id),
    queryFn: () => listMlkManagerSettlements(id),
    enabled: Boolean(id)
  });
  const storesQuery = useQuery({ queryKey: mlkKeys.stores(), queryFn: listMlkStores });
  const previewQuery = useQuery({
    queryKey: mlkKeys.managerSettlementPreview(id, previewMonth),
    queryFn: () => previewMlkManagerSettlement(id, previewMonth),
    enabled: Boolean(id) && Boolean(settlementModal) && !settlementModal?.id
  });

  useEffect(() => {
    if (detailQuery.data?.manager) setForm(normalizeManager(detailQuery.data.manager));
  }, [detailQuery.data?.manager]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!settlementModal || settlementModal.id || !previewQuery.data) return;
    setSettlementModal((current) =>
      current
        ? {
            ...current,
            month: previewQuery.data.month,
            mgmt_fee: previewQuery.data.mgmtFee,
            excess_bonus: previewQuery.data.excessBonus,
            detail: previewQuery.data.detail
          }
        : current
    );
  }, [previewQuery.data, settlementModal?.id]);

  const updateMutation = useMutation({
    mutationFn: (body: MlkManagerInput) => updateMlkManager(id, body),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      setForm(normalizeManager(data.manager));
      setToast({ color: "green", message: t("mlk.messages.saved") });
    },
    onError: (error) => setToast({ color: "red", message: errorText(error, t) })
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMlkManager,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      navigate("/franchise/mlk?tab=managers");
    },
    onError: (error) => setToast({ color: "red", message: errorText(error, t) })
  });
  const cuisineMutation = useMutation({
    mutationFn: (body: CuisineForm) => (body.id ? updateMlkCuisine(body.id, toCuisineBody(body)) : createMlkCuisine(toCuisineBody(body))),
    onSuccess: async () => {
      setCuisineModal(null);
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.manager(id) });
    },
    onError: (error) => setToast({ color: "red", message: errorText(error, t) })
  });
  const deleteCuisineMutation = useMutation({
    mutationFn: deleteMlkCuisine,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.manager(id) });
    },
    onError: (error) => setToast({ color: "red", message: errorText(error, t) })
  });
  const settlementMutation = useMutation({
    mutationFn: (body: SettlementForm) => (body.id ? updateMlkManagerSettlement(body.id, body) : createMlkManagerSettlement(body)),
    onSuccess: async () => {
      setSettlementModal(null);
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.managerSettlements(id) });
    },
    onError: (error) => setToast({ color: "red", message: errorText(error, t) })
  });
  const deleteSettlementMutation = useMutation({
    mutationFn: deleteMlkManagerSettlement,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: mlkKeys.managerSettlements(id) }),
    onError: (error) => setToast({ color: "red", message: errorText(error, t) })
  });

  function setField<K extends keyof MlkManagerInput>(key: K, value: MlkManagerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!canManage) return;
    if (!form.name.trim()) {
      setToast({ color: "red", message: t("mlk.messages.nameRequired") });
      return;
    }
    updateMutation.mutate(toManagerBody(form));
  }

  function remove() {
    if (!canManage) return;
    if (!window.confirm(t("mlk.messages.confirmDelete"))) return;
    deleteMutation.mutate(id);
  }

  function openCuisine(cuisine?: MlkCuisine) {
    setCuisineModal(
      cuisine
        ? { id: cuisine.id, name: cuisine.name, manager_id: cuisine.manager_id ?? null, notes: cuisine.notes ?? null }
        : { name: "", manager_id: id, notes: null }
    );
  }

  function openSettlement(row?: MlkManagerSettlement) {
    const month = row?.month ?? currentMonthStart();
    setPreviewMonth(month);
    setSettlementModal(row ? settlementFromRow(row) : mlkManagerSettlementDefaults(id, month));
  }

  const manager = detailQuery.data?.manager;
  const cuisines = manager?.cuisines ?? [];
  const settlements = settlementsQuery.data?.settlements ?? [];
  const managerOptions = (managersQuery.data?.managers ?? []).map((manager) => ({ value: manager.id, label: manager.name }));
  const storeById = useMemo(() => new Map((storesQuery.data?.stores ?? []).map((store) => [store.id, store])), [storesQuery.data?.stores]);
  const saving = updateMutation.isPending;
  const disabled = !canManage;
  const detailRows = Array.isArray(settlementModal?.detail) ? settlementModal.detail : [];

  const profileCard = (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <Card withBorder shadow="xs" p="sm" h="100%">
          <Text fw={600} mb="sm">{t("mlk.cards.profile")}</Text>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.name")} value={form.name} disabled={disabled} onChange={(event) => setField("name", event.currentTarget.value)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.phone")} value={form.phone ?? ""} disabled={disabled} onChange={(event) => setField("phone", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.wechat")} value={form.wechat ?? ""} disabled={disabled} onChange={(event) => setField("wechat", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.id_no")} value={form.id_no ?? ""} disabled={disabled} onChange={(event) => setField("id_no", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><Select label={t("mlk.fields.status")} data={managerStatuses.map((value) => ({ value, label: t(`mlk.status.manager.${value}`) }))} value={form.status} disabled={disabled} onChange={(value) => setField("status", (value ?? "candidate") as MlkManagerStatus)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><TextInput type="date" label={t("mlk.fields.joined_at")} value={form.joined_at ?? ""} disabled={disabled} onChange={(event) => setField("joined_at", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><TextInput type="date" label={t("mlk.fields.exited_at")} value={form.exited_at ?? ""} disabled={disabled} onChange={(event) => setField("exited_at", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={12}><Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} disabled={disabled} minRows={3} onChange={(event) => setField("notes", event.currentTarget.value || null)} /></Grid.Col>
          </Grid>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Card withBorder shadow="xs" p="sm" h="100%">
          <Text fw={600} mb="sm">{t("mlk.cards.shareParams")}</Text>
          <Stack gap="sm">
            <NumberInput label={t("mlk.fields.mgmt_fee_rate")} value={form.mgmt_fee_rate} min={0} decimalScale={2} disabled={disabled} onChange={(value) => setField("mgmt_fee_rate", typeof value === "number" ? value : 0)} />
            <NumberInput label={t("mlk.fields.excess_bonus_rate")} value={form.excess_bonus_rate} min={0} decimalScale={2} disabled={disabled} onChange={(value) => setField("excess_bonus_rate", typeof value === "number" ? value : 0)} />
            <NumberInput label={t("mlk.fields.profit_threshold")} value={form.profit_threshold} min={0} thousandSeparator="," disabled={disabled} onChange={(value) => setField("profit_threshold", typeof value === "number" ? value : 0)} />
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );

  const cuisineStoresCard = (
    <Stack gap="md">
      <Card withBorder shadow="xs" p="sm">
        <Group justify="space-between" mb="sm">
          <Text fw={600}>{t("mlk.fields.cuisines")}</Text>
          {canManage ? <Button size="xs" onClick={() => openCuisine()}>{t("mlk.cuisines.add")}</Button> : null}
        </Group>
        <Table withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr><Table.Th>{t("mlk.fields.name")}</Table.Th><Table.Th>{t("mlk.fields.store_count")}</Table.Th><Table.Th>{t("mlk.fields.notes")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cuisines.map((cuisine) => (
              <Table.Tr key={cuisine.id}>
                <Table.Td>{cuisine.name}</Table.Td>
                <Table.Td>{cuisine.stores.length}</Table.Td>
                <Table.Td>{cuisine.notes || "-"}</Table.Td>
                <Table.Td>
                  {canManage ? (
                    <Group gap={4}>
                      <Button size="xs" variant="subtle" onClick={() => openCuisine(cuisine)}>{t("common.edit")}</Button>
                      <Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("mlk.messages.confirmDelete")) && deleteCuisineMutation.mutate(cuisine.id)}>{t("common.delete")}</Button>
                    </Group>
                  ) : null}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      {cuisines.map((cuisine) => (
        <Card key={cuisine.id} withBorder shadow="xs" p="sm">
          <Text fw={600} mb="sm">{cuisine.name}</Text>
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>{t("mlk.fields.store")}</Table.Th><Table.Th>{t("mlk.fields.stall")}</Table.Th><Table.Th>{t("mlk.fields.status")}</Table.Th><Table.Th>{t("mlk.fields.month")}</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cuisine.stores.length === 0 ? (
                <Table.Tr><Table.Td colSpan={4}><Text c="dimmed">{t("mlk.messages.empty")}</Text></Table.Td></Table.Tr>
              ) : (
                cuisine.stores.map((store) => (
                  <Table.Tr key={store.id}>
                    <Table.Td><Anchor onClick={() => navigate(`/franchise/mlk/stores/${store.id}`)}>{store.name}</Anchor></Table.Td>
                    <Table.Td>{storeById.get(store.id)?.stall || "-"}</Table.Td>
                    <Table.Td><Badge color={storeStatusColor(store.status)} variant="light">{t(`mlk.status.store.${store.status}`)}</Badge></Table.Td>
                    <Table.Td>{formatDate(storeById.get(store.id)?.opened_at)}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Card>
      ))}
    </Stack>
  );

  const settlementsCard = (
    <Card withBorder shadow="xs" p="sm">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>{t("mlk.tabs.managerSettlements")}</Text>
        {canManage ? <Button size="xs" onClick={() => openSettlement()}>{t("mlk.managerSettlements.add")}</Button> : null}
      </Group>
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("mlk.fields.month")}</Table.Th>
            <Table.Th>{t("mlk.fields.mgmt_fee")}</Table.Th>
            <Table.Th>{t("mlk.fields.material_share")}</Table.Th>
            <Table.Th>{t("mlk.fields.training_fee")}</Table.Th>
            <Table.Th>{t("mlk.fields.opening_surplus")}</Table.Th>
            <Table.Th>{t("mlk.fields.excess_bonus")}</Table.Th>
            <Table.Th>{t("mlk.fields.central_kitchen")}</Table.Th>
            <Table.Th>{t("mlk.fields.other")}</Table.Th>
            <Table.Th>{t("mlk.fields.total")}</Table.Th>
            <Table.Th>{t("mlk.fields.notes")}</Table.Th>
            <Table.Th>{t("common.actions")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {settlements.map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>{row.month}</Table.Td>
              <Table.Td><MlkMoneyText value={row.mgmt_fee} /></Table.Td>
              <Table.Td><MlkMoneyText value={row.material_share} /></Table.Td>
              <Table.Td><MlkMoneyText value={row.training_fee} /></Table.Td>
              <Table.Td><MlkMoneyText value={row.opening_surplus} /></Table.Td>
              <Table.Td><MlkMoneyText value={row.excess_bonus} /></Table.Td>
              <Table.Td><MlkMoneyText value={row.central_kitchen} /></Table.Td>
              <Table.Td><MlkMoneyText value={row.other} /></Table.Td>
              <Table.Td><MlkMoneyText value={row.total} fw={600} /></Table.Td>
              <Table.Td>{row.notes || "-"}</Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <Popover width={520} withArrow shadow="md">
                    <Popover.Target><Button size="xs" variant="subtle">{t("mlk.settlements.detail")}</Button></Popover.Target>
                    <Popover.Dropdown>
                      <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(row.detail ?? [], null, 2)}</Text>
                    </Popover.Dropdown>
                  </Popover>
                  {canManage ? (
                    <>
                      <Button size="xs" variant="subtle" onClick={() => openSettlement(row)}>{t("common.edit")}</Button>
                      <Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("mlk.messages.confirmDelete")) && deleteSettlementMutation.mutate(row.id)}>{t("common.delete")}</Button>
                    </>
                  ) : null}
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
            <Button variant="subtle" size="xs" onClick={() => navigate("/franchise/mlk?tab=managers")}>{t("common.back")}</Button>
            <Text size="md" fw={500}>{form.name || t("mlk.detail.manager")}</Text>
            <Badge color={managerStatusColor(form.status)} variant={form.status === "exited" ? "filled" : "light"}>{t(`mlk.status.manager.${form.status}`)}</Badge>
          </Group>
          {canManage ? (
            <Group gap="xs">
              <Button color="red" variant="light" size="xs" loading={deleteMutation.isPending} onClick={remove}>{t("common.delete")}</Button>
              <Button size="xs" loading={saving} onClick={save}>{t("common.save")}</Button>
            </Group>
          ) : null}
        </Group>
      </Paper>

      {toast ? <Alert color={toast.color} mb="sm" variant="light">{toast.message}</Alert> : null}
      <ErrorAlert error={detailQuery.error ?? settlementsQuery.error} />

      <Modal opened={Boolean(cuisineModal)} onClose={() => setCuisineModal(null)} title={cuisineModal?.id ? t("mlk.cuisines.edit") : t("mlk.cuisines.add")}>
        {cuisineModal ? (
          <Stack gap="md">
            <TextInput label={t("mlk.fields.name")} value={cuisineModal.name} onChange={(event) => setCuisineModal({ ...cuisineModal, name: event.currentTarget.value })} />
            <Select label={t("mlk.fields.manager")} data={managerOptions} value={cuisineModal.manager_id ?? null} onChange={(value) => setCuisineModal({ ...cuisineModal, manager_id: value })} clearable searchable />
            <Textarea label={t("mlk.fields.notes")} value={cuisineModal.notes ?? ""} onChange={(event) => setCuisineModal({ ...cuisineModal, notes: event.currentTarget.value || null })} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setCuisineModal(null)}>{t("common.cancel")}</Button>
              <Button loading={cuisineMutation.isPending} disabled={!cuisineModal.name.trim()} onClick={() => cuisineMutation.mutate(cuisineModal)}>{t("common.save")}</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal opened={Boolean(settlementModal)} onClose={() => setSettlementModal(null)} title={settlementModal?.id ? t("mlk.managerSettlements.edit") : t("mlk.managerSettlements.add")} size="xl">
        {settlementModal ? (
          <Stack gap="md">
            <TextInput
              type="month"
              label={t("mlk.fields.month")}
              value={settlementModal.month.slice(0, 7)}
              onChange={(event) => {
                const month = `${event.currentTarget.value}-01`;
                setPreviewMonth(month);
                setSettlementModal({ ...settlementModal, month });
              }}
              disabled={Boolean(settlementModal.id)}
            />
            {previewQuery.isFetching && !settlementModal.id ? <Text c="dimmed" size="sm">{t("mlk.managerSettlements.previewing")}</Text> : null}
            <Grid gutter="sm">
              {(["mgmt_fee", "material_share", "training_fee", "opening_surplus", "excess_bonus", "central_kitchen", "other"] as const).map((key) => (
                <Grid.Col key={key} span={{ base: 12, md: 4 }}>
                  <NumberInput label={t(`mlk.fields.${key}`)} value={settlementModal[key]} thousandSeparator="," onChange={(value) => setSettlementModal({ ...settlementModal, [key]: typeof value === "number" ? value : 0 })} />
                </Grid.Col>
              ))}
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Text c="dimmed" size="sm">{t("mlk.fields.total")}</Text>
                <Text fw={700}>{formatSgd(settlementTotal(settlementModal))}</Text>
              </Grid.Col>
              <Grid.Col span={12}><Textarea label={t("mlk.fields.notes")} value={settlementModal.notes ?? ""} onChange={(event) => setSettlementModal({ ...settlementModal, notes: event.currentTarget.value || null })} /></Grid.Col>
            </Grid>
            <Table withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>{t("mlk.fields.store")}</Table.Th><Table.Th>{t("mlk.fields.cuisine")}</Table.Th><Table.Th>{t("mlk.fields.turnover")}</Table.Th><Table.Th>{t("mlk.fields.source")}</Table.Th><Table.Th>{t("mlk.fields.mgmt_fee")}</Table.Th><Table.Th>{t("mlk.fields.net_profit")}</Table.Th><Table.Th>{t("mlk.fields.excess_bonus")}</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {detailRows.map((row) => (
                  <Table.Tr key={`${row.storeId}-${row.cuisineName}`}>
                    <Table.Td>{row.storeName}</Table.Td>
                    <Table.Td>{row.cuisineName}</Table.Td>
                    <Table.Td>{formatSgd(row.turnover)}</Table.Td>
                    <Table.Td><Badge variant="light">{row.turnoverSource}</Badge></Table.Td>
                    <Table.Td>{formatSgd(row.mgmtFee)}</Table.Td>
                    <Table.Td>{formatSgd(row.netProfit)}</Table.Td>
                    <Table.Td>{formatSgd(row.excessBonus)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setSettlementModal(null)}>{t("common.cancel")}</Button>
              <Button loading={settlementMutation.isPending} onClick={() => settlementMutation.mutate(settlementModal)}>{t("common.save")}</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      {detailQuery.isLoading ? (
        <Group justify="center" py="xl"><Loader size="sm" /></Group>
      ) : (
        <Tabs defaultValue="profile" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="profile">{t("mlk.tabs.profile")}</Tabs.Tab>
            <Tabs.Tab value="cuisines">{t("mlk.tabs.cuisines")}</Tabs.Tab>
            <Tabs.Tab value="settlements">{t("mlk.tabs.managerSettlements")}</Tabs.Tab>
            <Tabs.Tab value="files">{t("mlk.tabs.files")}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="profile">{profileCard}</Tabs.Panel>
          <Tabs.Panel value="cuisines">{cuisineStoresCard}</Tabs.Panel>
          <Tabs.Panel value="settlements">{settlementsCard}</Tabs.Panel>
          <Tabs.Panel value="files"><MlkFilePanel folderId={form.drive_folder_id} canManage={canManage} /></Tabs.Panel>
        </Tabs>
      )}
    </Box>
  );
}
