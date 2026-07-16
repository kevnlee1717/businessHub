import { Alert, Box, Button, Card, Grid, Group, Loader, Paper, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  createMlkInvestor,
  deleteMlkInvestor,
  getMlkInvestor,
  mlkInvestorDefaults,
  mlkKeys,
  updateMlkInvestor,
  type MlkInvestor,
  type MlkInvestorInput,
  type MlkKycStatus,
  type MlkPrStatus,
  type MlkServiceTier
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { ErrorAlert } from "./shared";

const serviceTiers: MlkServiceTier[] = ["tier1", "tier2"];
const prStatuses: MlkPrStatus[] = ["none", "applied", "granted"];
const kycStatuses: MlkKycStatus[] = ["pending", "done"];

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

  const detailQuery = useQuery({
    queryKey: mlkKeys.investor(id),
    queryFn: () => getMlkInvestor(id),
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      await queryClient.invalidateQueries({ queryKey: mlkKeys.investor(id) });
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

  function setField<K extends keyof MlkInvestorInput>(key: K, value: MlkInvestorInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!canManage) return;
    if (!form.name.trim()) {
      setToast({ color: "red", message: t("mlk.messages.nameRequired") });
      return;
    }
    const body: MlkInvestorInput = {
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
                <TextInput label={t("mlk.fields.name")} value={form.name} disabled={disabled} onChange={(event) => setField("name", event.currentTarget.value)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.company_name")} value={form.company_name ?? ""} disabled={disabled} onChange={(event) => setField("company_name", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.uen")} value={form.uen ?? ""} disabled={disabled} onChange={(event) => setField("uen", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.id_no")} value={form.id_no ?? ""} disabled={disabled} onChange={(event) => setField("id_no", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.phone")} value={form.phone ?? ""} disabled={disabled} onChange={(event) => setField("phone", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.wechat")} value={form.wechat ?? ""} disabled={disabled} onChange={(event) => setField("wechat", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Select label={t("mlk.fields.service_tier")} data={serviceTiers.map((value) => ({ value, label: t(`mlk.status.service_tier.${value}`) }))} value={form.service_tier} disabled={disabled} onChange={(value) => setField("service_tier", (value ?? "tier1") as MlkServiceTier)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Select label={t("mlk.fields.pr_status")} data={prStatuses.map((value) => ({ value, label: t(`mlk.status.pr.${value}`) }))} value={form.pr_status} disabled={disabled} onChange={(value) => setField("pr_status", (value ?? "none") as MlkPrStatus)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Select label={t("mlk.fields.kyc_status")} data={kycStatuses.map((value) => ({ value, label: t(`mlk.status.kyc.${value}`) }))} value={form.kyc_status} disabled={disabled} onChange={(value) => setField("kyc_status", (value ?? "pending") as MlkKycStatus)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 8 }}>
                <TextInput label={t("mlk.fields.address")} value={form.address ?? ""} disabled={disabled} onChange={(event) => setField("address", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput label={t("mlk.fields.drive_folder_id")} value={form.drive_folder_id ?? ""} disabled onChange={(event) => setField("drive_folder_id", event.currentTarget.value || null)} />
              </Grid.Col>
              <Grid.Col span={12}>
                <Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} disabled={disabled} minRows={3} onChange={(event) => setField("notes", event.currentTarget.value || null)} />
              </Grid.Col>
            </Grid>
          </Card>
          {/* TODO: B2 add service payments, owned stores and scoped files panels. */}
        </Stack>
      )}
    </Box>
  );
}
