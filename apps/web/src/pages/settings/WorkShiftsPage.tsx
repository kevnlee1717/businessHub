import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  workShiftCreateSchema,
  workShiftUpdateSchema,
  type WorkShiftCreateInput,
  type WorkShiftUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createWorkShift, listWorkShifts, updateWorkShift, type WorkShift } from "../../api/hr";

type WorkShiftFormValues = {
  name?: string | undefined;
  start_min?: number | undefined;
  end_min?: number | undefined;
  allowed_late_count?: number | undefined;
  is_default?: boolean | undefined;
};

const workShiftQueryKey = ["hr", "work-shifts"] as const;

function getDefaultValues(workShift?: WorkShift): WorkShiftFormValues {
  return {
    name: workShift?.name ?? "",
    start_min: workShift?.start_min ?? undefined,
    end_min: workShift?.end_min ?? undefined,
    allowed_late_count: workShift?.allowed_late_count ?? 0,
    is_default: workShift?.is_default ?? false
  };
}

function toNumberOrUndefined(value: string | number) {
  return typeof value === "number" ? value : undefined;
}

const minToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const timeToMin = (time: string) => {
  const parts = time.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  return hours * 60 + minutes;
};

function toMinuteOrUndefined(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return undefined;
  }

  const minutes = timeToMin(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1439 ? minutes : undefined;
}

export function WorkShiftsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingWorkShift, setEditingWorkShift] = useState<WorkShift | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const workShiftsQuery = useQuery({
    queryKey: workShiftQueryKey,
    queryFn: listWorkShifts
  });

  const form = useForm<WorkShiftFormValues>({
    resolver: zodResolver(
      editingWorkShift ? workShiftUpdateSchema : workShiftCreateSchema
    ) as Resolver<WorkShiftFormValues>,
    defaultValues: getDefaultValues(editingWorkShift ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createWorkShift,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workShiftQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WorkShiftUpdateInput }) => updateWorkShift(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workShiftQueryKey });
      closeModal();
    }
  });

  const workShifts = workShiftsQuery.data?.work_shifts ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const errors = form.formState.errors;

  function openCreateModal() {
    setEditingWorkShift(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(workShift: WorkShift) {
    setEditingWorkShift(workShift);
    setFormError(null);
    form.reset(getDefaultValues(workShift));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingWorkShift(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingWorkShift) {
        await updateMutation.mutateAsync({ id: editingWorkShift.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as WorkShiftCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("workShift.title")}</Title>
        <Button onClick={openCreateModal}>{t("workShift.add")}</Button>
      </Group>

      {workShiftsQuery.error ? (
        <Alert color="red" variant="light">
          {workShiftsQuery.error instanceof Error ? workShiftsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("workShift.fields.name")}</Table.Th>
                <Table.Th>{t("workShift.fields.startMin")}</Table.Th>
                <Table.Th>{t("workShift.fields.endMin")}</Table.Th>
                <Table.Th>{t("workShift.fields.allowedLateCount")}</Table.Th>
                <Table.Th>{t("workShift.fields.isDefault")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {workShiftsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : workShifts.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("workShift.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                workShifts.map((workShift) => (
                  <Table.Tr key={workShift.id}>
                    <Table.Td>{workShift.name}</Table.Td>
                    <Table.Td>{minToTime(workShift.start_min)}</Table.Td>
                    <Table.Td>{minToTime(workShift.end_min)}</Table.Td>
                    <Table.Td>{workShift.allowed_late_count}</Table.Td>
                    <Table.Td>{workShift.is_default ? t("common.yes") : t("common.no")}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openEditModal(workShift)}>
                        {t("common.edit")}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingWorkShift ? t("workShift.edit") : t("workShift.add")}
        size="lg"
      >
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <TextInput
              label={t("workShift.fields.name")}
              error={errors.name?.message}
              {...form.register("name")}
            />
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="start_min"
                render={({ field }) => (
                  <TextInput
                    type="time"
                    label={t("workShift.fields.startMin")}
                    value={typeof field.value === "number" ? minToTime(field.value) : ""}
                    onChange={(event) => field.onChange(toMinuteOrUndefined(event.currentTarget.value))}
                    error={errors.start_min?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="end_min"
                render={({ field }) => (
                  <TextInput
                    type="time"
                    label={t("workShift.fields.endMin")}
                    value={typeof field.value === "number" ? minToTime(field.value) : ""}
                    onChange={(event) => field.onChange(toMinuteOrUndefined(event.currentTarget.value))}
                    error={errors.end_min?.message}
                  />
                )}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="allowed_late_count"
                render={({ field }) => (
                  <NumberInput
                    label={t("workShift.fields.allowedLateCount")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                    error={errors.allowed_late_count?.message}
                    min={0}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="is_default"
                render={({ field }) => (
                  <Checkbox
                    label={t("workShift.fields.isDefault")}
                    checked={field.value ?? false}
                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                    error={errors.is_default?.message}
                    mt="xl"
                  />
                )}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSaving}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
