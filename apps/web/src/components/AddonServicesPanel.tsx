import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError } from "../api/client";
import { addCaseService, listCaseServices, removeCaseService, type CaseService } from "../api/caseServices";
import { listServiceItems, type ServiceItem } from "../api/epPackages";

type Props = {
  caseId: string;
  caseStepsInfo?: { id: string; step_order: number; name: string }[];
  onGoToCharges?: () => void;
};

type AddForm = {
  service_item_id: string | null;
  price_sgd: number | null;
  note: string;
};

const defaultAddForm: AddForm = {
  service_item_id: null,
  price_sgd: null,
  note: ""
};

function formatMoney(amount?: string | number | null) {
  return `SGD ${Number(amount ?? 0).toFixed(2)}`;
}

function serviceName(service: Pick<ServiceItem, "name" | "name_en">) {
  return service.name_en ? `${service.name} / ${service.name_en}` : service.name;
}

function chargeStatusColor(status?: NonNullable<CaseService["charge"]>["status"]) {
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

function serviceBadge(service: CaseService) {
  if (service.source === "package" && !service.is_billable) {
    return <Badge color="green" variant="light">套餐内 · 免费</Badge>;
  }

  if (service.source === "extra" && service.is_billable) {
    return <Badge color="orange" variant="light">额外</Badge>;
  }

  return <Badge color="gray" variant="light">客户自付</Badge>;
}

export function AddonServicesPanel({ caseId, onGoToCharges }: Props) {
  const queryClient = useQueryClient();
  const [addOpened, setAddOpened] = useState(false);
  const [form, setForm] = useState<AddForm>(defaultAddForm);
  const [formError, setFormError] = useState<string | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["cases", caseId, "services"],
    queryFn: () => listCaseServices(caseId)
  });
  const serviceItemsQuery = useQuery({
    queryKey: ["ep-packages", "service-items"],
    queryFn: () => listServiceItems(),
    enabled: addOpened
  });

  const services = servicesQuery.data?.services ?? [];
  const existingServiceItemIds = useMemo(
    () => new Set(services.map((service) => service.service_item_id)),
    [services]
  );
  const addableServiceItems = (serviceItemsQuery.data?.service_items ?? []).filter(
    (item) => item.active && !existingServiceItemIds.has(item.id)
  );
  const selectedServiceItem = addableServiceItems.find((item) => item.id === form.service_item_id) ?? null;
  const serviceOptions = addableServiceItems.map((item) => ({
    value: item.id,
    label: `${serviceName(item)} · ${formatMoney(item.default_price_sgd)}`
  }));

  const addMutation = useMutation({
    mutationFn: () => {
      if (!form.service_item_id) {
        throw new Error("请选择加购服务");
      }

      const body: { service_item_id: string; note?: string } = { service_item_id: form.service_item_id };
      const note = form.note.trim();
      if (note) {
        body.note = note;
      }

      return addCaseService(
        caseId,
        selectedServiceItem?.billable && form.price_sgd !== null ? { ...body, price_sgd: form.price_sgd } : body
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cases", caseId, "services"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "charges"] })
      ]);
      closeAddModal();
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "加购服务失败")
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeCaseService(caseId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cases", caseId, "services"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "charges"] })
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setFormError("请先处理该服务已收款记录");
        return;
      }
      setFormError(error instanceof Error ? error.message : "移除服务失败");
    }
  });

  function openAddModal() {
    setForm(defaultAddForm);
    setFormError(null);
    setAddOpened(true);
  }

  function closeAddModal() {
    setAddOpened(false);
    setForm(defaultAddForm);
    setFormError(null);
  }

  function selectServiceItem(value: string | null) {
    const item = addableServiceItems.find((serviceItem) => serviceItem.id === value);
    setForm((current) => ({
      ...current,
      service_item_id: value,
      price_sgd: item ? Number(item.default_price_sgd) : null
    }));
  }

  function goToChargeSchedule() {
    window.alert("请在「收款计划」中找到对应服务行并记录收款。");
    onGoToCharges?.();
  }

  function removeService(service: CaseService) {
    if (!window.confirm(`确认移除「${service.name_snapshot}」吗？`)) {
      return;
    }

    setFormError(null);
    removeMutation.mutate(service.id);
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={3}>增加服务</Title>
            {servicesQuery.isFetching ? <Loader size="sm" /> : null}
          </Stack>
          <Button onClick={openAddModal}>+ 加购服务</Button>
        </Group>

        {formError ? <Alert color="red" variant="light">{formError}</Alert> : null}
        {servicesQuery.error ? (
          <Alert color="red" variant="light">
            {servicesQuery.error instanceof Error ? servicesQuery.error.message : "加载服务失败"}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {services.length === 0 ? (
            <Text c="dimmed">暂无服务</Text>
          ) : (
            services.map((service) => (
              <Card key={service.id} withBorder radius="sm" p="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4}>
                      <Text fw={600}>{service.name_snapshot}</Text>
                      <Text size="sm" c="dimmed">{service.service.code}</Text>
                    </Stack>
                    {service.source === "extra" ? (
                      <Button
                        size="compact-xs"
                        color="red"
                        variant="subtle"
                        loading={removeMutation.isPending}
                        onClick={() => removeService(service)}
                      >
                        移除
                      </Button>
                    ) : null}
                  </Group>

                  <Group gap="xs">
                    {serviceBadge(service)}
                    {service.source === "extra" && service.is_billable && service.charge ? (
                      <Badge color={chargeStatusColor(service.charge.status)} variant="light">
                        {service.charge.status === "paid"
                          ? "已收清"
                          : service.charge.status === "partial"
                            ? "部分收款"
                            : service.charge.status === "waived"
                              ? "已豁免"
                              : "待收"}
                      </Badge>
                    ) : null}
                  </Group>

                  {service.source === "extra" && service.is_billable ? (
                    <Group justify="space-between" align="center">
                      <Text fw={700}>{formatMoney(service.price_sgd)}</Text>
                      {service.charge?.status === "pending" || service.charge?.status === "partial" ? (
                        <Button size="xs" variant="light" onClick={goToChargeSchedule}>
                          记录收款
                        </Button>
                      ) : null}
                    </Group>
                  ) : null}

                  {service.note ? <Text size="sm" c="dimmed">{service.note}</Text> : null}
                </Stack>
              </Card>
            ))
          )}
        </SimpleGrid>
      </Stack>

      <Modal opened={addOpened} onClose={closeAddModal} title="加购服务" size="lg">
        <Stack gap="md">
          {formError ? <Alert color="red" variant="light">{formError}</Alert> : null}
          <Select
            label="服务"
            data={serviceOptions}
            value={form.service_item_id}
            onChange={selectServiceItem}
            searchable
            required
          />
          {selectedServiceItem?.billable ? (
            <NumberInput
              label="成交价"
              value={form.price_sgd ?? ""}
              onChange={(value) =>
                setForm((current) => ({ ...current, price_sgd: typeof value === "number" ? value : null }))
              }
              min={0}
              decimalScale={2}
              required
            />
          ) : null}
          <Textarea
            label="备注"
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAddModal}>
              取消
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              loading={addMutation.isPending}
              disabled={!form.service_item_id || Boolean(selectedServiceItem?.billable && form.price_sgd === null)}
            >
              保存
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
