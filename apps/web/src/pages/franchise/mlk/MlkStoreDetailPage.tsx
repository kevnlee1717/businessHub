import { Alert, Box, Button, Card, Grid, Group, Loader, NumberInput, Paper, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { fnbFoodCourtKeys, listFoodCourts } from "../../../api/fnbFoodCourts";
import {
  createMlkStore,
  deleteMlkStore,
  getMlkStore,
  listMlkCouples,
  listMlkInvestors,
  mlkKeys,
  mlkStoreDefaults,
  updateMlkStore,
  type MlkStatus,
  type MlkStore,
  type MlkStoreInput
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { dateInputValue, ErrorAlert } from "./shared";

const storeStatuses: MlkStatus[] = ["intent", "selected", "incorporated", "lease_signed", "renovation", "open", "closed"];

function normalizeStore(store: MlkStore): MlkStoreInput {
  return {
    name: store.name ?? "",
    stall: store.stall ?? null,
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

  const detailQuery = useQuery({
    queryKey: mlkKeys.store(id),
    queryFn: () => getMlkStore(id),
    enabled: !isNew
  });
  const investorsQuery = useQuery({ queryKey: mlkKeys.investors(), queryFn: listMlkInvestors });
  const couplesQuery = useQuery({ queryKey: mlkKeys.couples(), queryFn: listMlkCouples });
  const foodCourtsQuery = useQuery({ queryKey: fnbFoodCourtKeys.list(), queryFn: listFoodCourts });

  useEffect(() => {
    if (detailQuery.data?.store) setForm(normalizeStore(detailQuery.data.store));
  }, [detailQuery.data?.store]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createMutation = useMutation({
    mutationFn: createMlkStore,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      setToast({ color: "green", message: t("mlk.messages.saved") });
      navigate(`/franchise/mlk/stores/${data.store.id}`, { replace: true });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const updateMutation = useMutation({
    mutationFn: (body: MlkStoreInput) => updateMlkStore(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.store(id) });
      setToast({ color: "green", message: t("mlk.messages.saved") });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMlkStore,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      navigate("/franchise/mlk");
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
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
    const body: MlkStoreInput = {
      ...form,
      name: form.name.trim(),
      stall: cleanText(form.stall),
      address: cleanText(form.address),
      spv_name: cleanText(form.spv_name),
      spv_uen: cleanText(form.spv_uen),
      kitchen_store_id: cleanText(form.kitchen_store_id),
      notes: cleanText(form.notes)
    };
    if (isNew) createMutation.mutate(body);
    else updateMutation.mutate(body);
  }

  function remove() {
    if (!canManage || isNew) return;
    if (!window.confirm(t("mlk.messages.confirmDelete"))) return;
    deleteMutation.mutate(id);
  }

  const disabled = !canManage;
  const saving = createMutation.isPending || updateMutation.isPending;
  const investorOptions = (investorsQuery.data?.investors ?? []).map((investor) => ({ value: investor.id, label: investor.name }));
  const coupleOptions = (couplesQuery.data?.couples ?? []).map((couple) => ({ value: couple.id, label: `${couple.husband_name} / ${couple.wife_name}` }));
  const foodCourtOptions = (foodCourtsQuery.data?.food_courts ?? []).map((court) => ({ value: court.id, label: court.name }));

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

      {detailQuery.isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Stack gap="md">
          <Card withBorder shadow="xs" p="sm">
            <Grid gutter="sm">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t("mlk.fields.name")} value={form.name} disabled={disabled} onChange={(event) => setField("name", event.currentTarget.value)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput label={t("mlk.fields.stall")} value={form.stall ?? ""} disabled={disabled} onChange={(event) => setField("stall", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label={t("mlk.fields.status")} data={storeStatuses.map((value) => ({ value, label: t(`mlk.status.store.${value}`) }))} value={form.status} disabled={disabled} onChange={(value) => setField("status", (value ?? "intent") as MlkStatus)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label={t("mlk.fields.address")} value={form.address ?? ""} disabled={disabled} onChange={(event) => setField("address", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput label={t("mlk.fields.spv_name")} value={form.spv_name ?? ""} disabled={disabled} onChange={(event) => setField("spv_name", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput label={t("mlk.fields.spv_uen")} value={form.spv_uen ?? ""} disabled={disabled} onChange={(event) => setField("spv_uen", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Select label={t("mlk.fields.investor")} data={investorOptions} value={form.investor_id ?? null} disabled={disabled} onChange={(value) => setField("investor_id", value)} clearable searchable />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Select label={t("mlk.fields.couple")} data={coupleOptions} value={form.couple_id ?? null} disabled={disabled} onChange={(value) => setField("couple_id", value)} clearable searchable />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Select label={t("mlk.fields.food_court")} data={foodCourtOptions} value={form.food_court_id ?? null} disabled={disabled} onChange={(value) => setField("food_court_id", value)} clearable searchable />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.kitchen_store_id")} value={form.kitchen_store_id ?? ""} disabled={disabled} onChange={(event) => setField("kitchen_store_id", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <NumberInput label={t("mlk.fields.fc_deposit_amount")} value={form.fc_deposit_amount ?? ""} min={0} thousandSeparator="," disabled={disabled} onChange={(value) => setField("fc_deposit_amount", typeof value === "number" ? value : null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.drive_folder_id")} value={form.drive_folder_id ?? ""} disabled onChange={(event) => setField("drive_folder_id", event.currentTarget.value || null)} />
              </Grid.Col>
              {(["intent_signed_at", "selected_at", "incorporated_at", "lease_signed_at", "renovation_at", "opened_at", "closed_at"] as const).map((key) => (
                <Grid.Col key={key} span={{ base: 12, md: 3 }}>
                  <TextInput type="date" label={t(`mlk.fields.${key}`)} value={dateInputValue(form[key])} disabled={disabled} onChange={(event) => setField(key, event.currentTarget.value || null)} />
                </Grid.Col>
              ))}
              <Grid.Col span={12}>
                <Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} disabled={disabled} minRows={3} onChange={(event) => setField("notes", event.currentTarget.value || null)} />
              </Grid.Col>
            </Grid>
          </Card>
          {/* TODO: B2 add payments, revenue, settlements and scoped files panels. */}
        </Stack>
      )}
    </Box>
  );
}
