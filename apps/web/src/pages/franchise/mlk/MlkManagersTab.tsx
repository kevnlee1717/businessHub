import { Alert, Anchor, Badge, Button, Grid, Group, Loader, Modal, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Textarea } from "@mantine/core";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  createMlkManager,
  getMlkManager,
  listMlkManagers,
  mlkKeys,
  mlkManagerDefaults,
  type MlkManagerInput,
  type MlkManagerStatus
} from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { ErrorAlert, managerStatusColor } from "./shared";

const managerStatuses: MlkManagerStatus[] = ["candidate", "active", "exited"];

function cleanText(value?: string | null) {
  return value?.trim() || null;
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

export function MlkManagersTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<MlkManagerStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MlkManagerInput>(mlkManagerDefaults());
  const [toast, setToast] = useState<{ color: "green" | "red"; message: string } | null>(null);

  const managersQuery = useQuery({
    queryKey: mlkKeys.managers(),
    queryFn: listMlkManagers
  });
  const managers = managersQuery.data?.managers ?? [];
  const managerDetails = useQueries({
    queries: managers.map((manager) => ({
      queryKey: mlkKeys.manager(manager.id),
      queryFn: () => getMlkManager(manager.id),
      enabled: managers.length > 0
    }))
  });

  const cuisinesByManager = useMemo(() => {
    const map = new Map<string, string[]>();
    managerDetails.forEach((query) => {
      const manager = query.data?.manager;
      if (!manager) return;
      map.set(manager.id, (manager.cuisines ?? []).map((cuisine) => cuisine.name));
    });
    return map;
  }, [managerDetails]);

  const filteredManagers = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return managers.filter((manager) => {
      const matchesKeyword =
        term.length === 0 ||
        manager.name.toLowerCase().includes(term) ||
        (manager.phone ?? "").toLowerCase().includes(term);
      return matchesKeyword && (!status || manager.status === status);
    });
  }, [keyword, managers, status]);

  const createMutation = useMutation({
    mutationFn: createMlkManager,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: mlkKeys.all });
      setModalOpen(false);
      setForm(mlkManagerDefaults());
      navigate(`/franchise/mlk/managers/${data.manager.id}`);
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });

  function setField<K extends keyof MlkManagerInput>(key: K, value: MlkManagerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm(mlkManagerDefaults());
    setToast(null);
    setModalOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      setToast({ color: "red", message: t("mlk.messages.nameRequired") });
      return;
    }
    createMutation.mutate(toManagerBody(form));
  }

  return (
    <Stack gap="md">
      <Group gap="sm" mb={0} wrap="wrap" align="flex-end">
        <TextInput w={200} label={t("mlk.actions.searchName")} value={keyword} onChange={(event) => setKeyword(event.currentTarget.value)} />
        <Select
          w={140}
          label={t("mlk.fields.status")}
          data={managerStatuses.map((value) => ({ value, label: t(`mlk.status.manager.${value}`) }))}
          value={status}
          onChange={(value) => setStatus(value as MlkManagerStatus | null)}
          clearable
        />
        {canManage ? <Button onClick={openCreate}>{t("mlk.actions.newManager")}</Button> : null}
      </Group>
      <ErrorAlert error={managersQuery.error} />
      <Paper p={0}>
        {managersQuery.isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : filteredManagers.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("mlk.messages.empty")}
          </Text>
        ) : (
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
                <Table.Tr>
                <Table.Th>{t("mlk.fields.name")}</Table.Th>
                <Table.Th>{t("mlk.fields.cuisines")}</Table.Th>
                <Table.Th>{t("mlk.fields.store_count")}</Table.Th>
                <Table.Th>{t("mlk.fields.status")}</Table.Th>
                <Table.Th>{t("mlk.fields.phone")}</Table.Th>
                <Table.Th w={120} ta="center">
                  {t("mlk.fields.actions")}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredManagers.map((manager) => (
                <Table.Tr key={manager.id}>
                  <Table.Td>
                    <Anchor onClick={() => navigate(`/franchise/mlk/managers/${manager.id}`)}>{manager.name}</Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {(cuisinesByManager.get(manager.id) ?? []).slice(0, 4).map((name) => (
                        <Badge key={name} variant="light" color="blue">
                          {name}
                        </Badge>
                      ))}
                      {(cuisinesByManager.get(manager.id) ?? []).length > 4 ? <Badge variant="light">+{(cuisinesByManager.get(manager.id) ?? []).length - 4}</Badge> : null}
                      {(cuisinesByManager.get(manager.id) ?? []).length === 0 ? <Text c="dimmed">-</Text> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{manager.store_count ?? 0}</Table.Td>
                  <Table.Td>
                    <Badge color={managerStatusColor(manager.status)} variant="light">
                      {t(`mlk.status.manager.${manager.status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{manager.phone || "-"}</Table.Td>
                  <Table.Td ta="center">
                    <Button size="xs" variant="subtle" onClick={() => navigate(`/franchise/mlk/managers/${manager.id}`)}>
                      {canManage ? t("mlk.actions.edit") : t("mlk.actions.view")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={t("mlk.actions.newManager")} size="lg">
        <Stack gap="md">
          {toast ? <Alert color={toast.color} variant="light">{toast.message}</Alert> : null}
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.name")} value={form.name} onChange={(event) => setField("name", event.currentTarget.value)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.phone")} value={form.phone ?? ""} onChange={(event) => setField("phone", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.wechat")} value={form.wechat ?? ""} onChange={(event) => setField("wechat", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput label={t("mlk.fields.id_no")} value={form.id_no ?? ""} onChange={(event) => setField("id_no", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><Select label={t("mlk.fields.status")} data={managerStatuses.map((value) => ({ value, label: t(`mlk.status.manager.${value}`) }))} value={form.status} onChange={(value) => setField("status", (value ?? "candidate") as MlkManagerStatus)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}><TextInput type="date" label={t("mlk.fields.joined_at")} value={form.joined_at ?? ""} onChange={(event) => setField("joined_at", event.currentTarget.value || null)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><NumberInput label={t("mlk.fields.mgmt_fee_rate")} value={form.mgmt_fee_rate} min={0} decimalScale={2} onChange={(value) => setField("mgmt_fee_rate", typeof value === "number" ? value : 0)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><NumberInput label={t("mlk.fields.excess_bonus_rate")} value={form.excess_bonus_rate} min={0} decimalScale={2} onChange={(value) => setField("excess_bonus_rate", typeof value === "number" ? value : 0)} /></Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}><NumberInput label={t("mlk.fields.profit_threshold")} value={form.profit_threshold} min={0} thousandSeparator="," onChange={(value) => setField("profit_threshold", typeof value === "number" ? value : 0)} /></Grid.Col>
            <Grid.Col span={12}><Textarea label={t("mlk.fields.notes")} value={form.notes ?? ""} minRows={3} onChange={(event) => setField("notes", event.currentTarget.value || null)} /></Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button>
            <Button loading={createMutation.isPending} onClick={submit}>{t("common.save")}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
