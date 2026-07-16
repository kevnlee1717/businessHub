import { Alert, Box, Button, Card, Grid, Group, Loader, Paper, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  createMlkCouple,
  deleteMlkCouple,
  getMlkCouple,
  listMlkCouples,
  mlkCoupleDefaults,
  mlkKeys,
  updateMlkCouple,
  type MlkCouple,
  type MlkCoupleInput,
  type MlkCoupleStatus,
  type MlkEpStatus,
  type MlkPrStatus
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { dateInputValue, ErrorAlert } from "./shared";

const epStatuses: MlkEpStatus[] = ["none", "applied", "granted"];
const prStatuses: MlkPrStatus[] = ["none", "applied", "granted"];
const coupleStatuses: MlkCoupleStatus[] = ["candidate", "active", "exited"];

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

  const detailQuery = useQuery({
    queryKey: mlkKeys.couple(id),
    queryFn: () => getMlkCouple(id),
    enabled: !isNew
  });
  const couplesQuery = useQuery({
    queryKey: mlkKeys.couples(),
    queryFn: listMlkCouples
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.couple(id) });
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

  function setField<K extends keyof MlkCoupleInput>(key: K, value: MlkCoupleInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!canManage) return;
    if (!form.husband_name.trim() || !form.wife_name.trim()) {
      setToast({ color: "red", message: t("mlk.messages.coupleNameRequired") });
      return;
    }
    const body: MlkCoupleInput = {
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
  const mentorOptions = (couplesQuery.data?.couples ?? [])
    .filter((couple) => couple.id !== id)
    .map((couple) => ({ value: couple.id, label: `${couple.husband_name} / ${couple.wife_name}` }));

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
      <ErrorAlert error={detailQuery.error} />

      {detailQuery.isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Stack gap="md">
          <Card withBorder shadow="xs" p="sm">
            <Grid gutter="sm">
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.operator_company")} value={form.operator_company ?? ""} disabled={disabled} onChange={(event) => setField("operator_company", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.operator_uen")} value={form.operator_uen ?? ""} disabled={disabled} onChange={(event) => setField("operator_uen", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Select label={t("mlk.fields.status")} data={coupleStatuses.map((value) => ({ value, label: t(`mlk.status.couple.${value}`) }))} value={form.status} disabled={disabled} onChange={(value) => setField("status", (value ?? "candidate") as MlkCoupleStatus)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.husband_name")} value={form.husband_name} disabled={disabled} onChange={(event) => setField("husband_name", event.currentTarget.value)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.husband_id_no")} value={form.husband_id_no ?? ""} disabled={disabled} onChange={(event) => setField("husband_id_no", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.husband_passport")} value={form.husband_passport ?? ""} disabled={disabled} onChange={(event) => setField("husband_passport", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.wife_name")} value={form.wife_name} disabled={disabled} onChange={(event) => setField("wife_name", event.currentTarget.value)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.wife_id_no")} value={form.wife_id_no ?? ""} disabled={disabled} onChange={(event) => setField("wife_id_no", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.wife_passport")} value={form.wife_passport ?? ""} disabled={disabled} onChange={(event) => setField("wife_passport", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label={t("mlk.fields.husband_ep")} data={epStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.husband_ep} disabled={disabled} onChange={(value) => setField("husband_ep", (value ?? "none") as MlkEpStatus)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label={t("mlk.fields.wife_ep")} data={epStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.wife_ep} disabled={disabled} onChange={(value) => setField("wife_ep", (value ?? "none") as MlkEpStatus)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label={t("mlk.fields.pr_status")} data={prStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.pr_status} disabled={disabled} onChange={(value) => setField("pr_status", (value ?? "none") as MlkPrStatus)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label={t("mlk.fields.mentor_id")} data={mentorOptions} value={form.mentor_id ?? null} disabled={disabled} onChange={(value) => setField("mentor_id", value)} clearable searchable />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput label={t("mlk.fields.phone")} value={form.phone ?? ""} disabled={disabled} onChange={(event) => setField("phone", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput label={t("mlk.fields.wechat")} value={form.wechat ?? ""} disabled={disabled} onChange={(event) => setField("wechat", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput type="date" label={t("mlk.fields.joined_at")} value={dateInputValue(form.joined_at)} disabled={disabled} onChange={(event) => setField("joined_at", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput type="date" label={t("mlk.fields.exited_at")} value={dateInputValue(form.exited_at)} disabled={disabled} onChange={(event) => setField("exited_at", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput label={t("mlk.fields.drive_folder_id")} value={form.drive_folder_id ?? ""} disabled onChange={(event) => setField("drive_folder_id", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={12}>
                <Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} disabled={disabled} minRows={3} onChange={(event) => setField("notes", event.currentTarget.value || null)} />
              </Grid.Col>
            </Grid>
          </Card>
          {/* TODO: B2 add ledger, stores, mentor tree and scoped files panels. */}
        </Stack>
      )}
    </Box>
  );
}
