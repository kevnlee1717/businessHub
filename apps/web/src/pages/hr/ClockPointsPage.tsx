import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  clockPointCreateSchema,
  clockPointUpdateSchema,
  type ClockPointCreateInput,
  type ClockPointUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  assignEmployeeClockPoints,
  createClockPoint,
  deleteClockPoint,
  getEmployeeClockPoints,
  listClockPoints,
  listCompanies,
  listEmployees,
  updateClockPoint,
  type ClockPoint
} from "../../api/hr";

type ClockPointFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  radius_m?: number | undefined;
  company_id?: string | undefined;
  active?: boolean | undefined;
};

const clockPointQueryKey = ["hr", "clock-points"] as const;
const companyQueryKey = ["hr", "companies"] as const;
const employeeQueryKey = ["hr", "employees"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function getDefaultValues(clockPoint?: ClockPoint): ClockPointFormValues {
  return {
    name: clockPoint?.name ?? "",
    name_en: clockPoint?.name_en ?? undefined,
    lat: clockPoint ? Number(clockPoint.lat) : undefined,
    lng: clockPoint ? Number(clockPoint.lng) : undefined,
    radius_m: clockPoint?.radius_m ?? 200,
    company_id: clockPoint?.company_id ?? undefined,
    active: clockPoint?.active ?? true
  };
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function toNumberOrUndefined(value: string | number) {
  return typeof value === "number" ? value : undefined;
}

export function ClockPointsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingClockPoint, setEditingClockPoint] = useState<ClockPoint | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [assignedClockPointIds, setAssignedClockPointIds] = useState<string[]>([]);
  const [assignError, setAssignError] = useState<string | null>(null);

  const clockPointsQuery = useQuery({
    queryKey: clockPointQueryKey,
    queryFn: listClockPoints
  });
  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: listCompanies
  });
  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: listEmployees
  });
  const employeeClockPointsQuery = useQuery({
    queryKey: ["hr", "employee-clock-points", selectedEmployeeId],
    queryFn: () => getEmployeeClockPoints(selectedEmployeeId ?? ""),
    enabled: Boolean(selectedEmployeeId)
  });

  const form = useForm<ClockPointFormValues>({
    resolver: zodResolver(
      editingClockPoint ? clockPointUpdateSchema : clockPointCreateSchema
    ) as Resolver<ClockPointFormValues>,
    defaultValues: getDefaultValues(editingClockPoint ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createClockPoint,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clockPointQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClockPointUpdateInput }) => updateClockPoint(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clockPointQueryKey });
      if (selectedEmployeeId) {
        await queryClient.invalidateQueries({ queryKey: ["hr", "employee-clock-points", selectedEmployeeId] });
      }
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteClockPoint,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clockPointQueryKey });
      if (selectedEmployeeId) {
        await queryClient.invalidateQueries({ queryKey: ["hr", "employee-clock-points", selectedEmployeeId] });
      }
    }
  });

  const assignMutation = useMutation({
    mutationFn: ({ employeeId, clockPointIds }: { employeeId: string; clockPointIds: string[] }) =>
      assignEmployeeClockPoints(employeeId, clockPointIds),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "employee-clock-points", variables.employeeId] });
    }
  });

  useEffect(() => {
    setAssignedClockPointIds(employeeClockPointsQuery.data?.clockPoints.map((clockPoint) => clockPoint.id) ?? []);
  }, [employeeClockPointsQuery.data, selectedEmployeeId]);

  const clockPoints = clockPointsQuery.data?.clockPoints ?? [];
  const companies = companiesQuery.data?.companies ?? [];
  const employees = employeesQuery.data?.employees ?? [];

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: displayName(company.name, company.name_en)
  }));
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const activeClockPointOptions = clockPoints
    .filter((clockPoint) => clockPoint.active)
    .map((clockPoint) => ({
      value: clockPoint.id,
      label: displayName(clockPoint.name, clockPoint.name_en)
    }));
  const selectedAssignedClockPoints = employeeClockPointsQuery.data?.clockPoints ?? [];
  const isLoading = clockPointsQuery.isLoading || companiesQuery.isLoading || employeesQuery.isLoading;
  const loadError = clockPointsQuery.error ?? companiesQuery.error ?? employeesQuery.error;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const errors = form.formState.errors;

  function openCreateModal() {
    setEditingClockPoint(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(clockPoint: ClockPoint) {
    setEditingClockPoint(clockPoint);
    setFormError(null);
    form.reset(getDefaultValues(clockPoint));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingClockPoint(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  async function handleDelete(clockPoint: ClockPoint) {
    if (!window.confirm(t("clockPoint.confirmDelete", { name: clockPoint.name }))) {
      return;
    }

    await deleteMutation.mutateAsync(clockPoint.id);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingClockPoint) {
        await updateMutation.mutateAsync({ id: editingClockPoint.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as ClockPointCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function saveAssignments() {
    if (!selectedEmployeeId) {
      return;
    }

    setAssignError(null);
    try {
      await assignMutation.mutateAsync({
        employeeId: selectedEmployeeId,
        clockPointIds: assignedClockPointIds
      });
    } catch (error) {
      setAssignError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("clockPoint.title")}</Title>
        <Button onClick={openCreateModal}>{t("clockPoint.add")}</Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={820} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("clockPoint.fields.name")}</Table.Th>
                <Table.Th>{t("clockPoint.fields.nameEn")}</Table.Th>
                <Table.Th>{t("clockPoint.fields.lat")}</Table.Th>
                <Table.Th>{t("clockPoint.fields.lng")}</Table.Th>
                <Table.Th>{t("clockPoint.fields.radiusM")}</Table.Th>
                <Table.Th>{t("clockPoint.fields.company")}</Table.Th>
                <Table.Th>{t("clockPoint.fields.active")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : clockPoints.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("clockPoint.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                clockPoints.map((clockPoint) => (
                  <Table.Tr key={clockPoint.id}>
                    <Table.Td>{clockPoint.name}</Table.Td>
                    <Table.Td>{clockPoint.name_en ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{clockPoint.lat}</Table.Td>
                    <Table.Td>{clockPoint.lng}</Table.Td>
                    <Table.Td>{clockPoint.radius_m}</Table.Td>
                    <Table.Td>
                      {clockPoint.company_id
                        ? companyById.get(clockPoint.company_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>{clockPoint.active ? t("common.yes") : t("common.no")}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button size="xs" variant="light" onClick={() => openEditModal(clockPoint)}>
                          {t("common.edit")}
                        </Button>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          loading={deleteMutation.isPending}
                          onClick={() => void handleDelete(clockPoint)}
                        >
                          {t("common.delete")}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Stack gap="md">
        <Title order={3}>{t("clockPoint.assignment.title")}</Title>
        {assignError ? (
          <Alert color="red" variant="light">
            {assignError}
          </Alert>
        ) : null}
        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Select
              label={t("clockPoint.assignment.employee")}
              data={employeeOptions}
              value={selectedEmployeeId}
              onChange={(value) => {
                setSelectedEmployeeId(value);
                setAssignError(null);
              }}
              searchable
              clearable
            />
            {selectedEmployeeId ? (
              <>
                {employeeClockPointsQuery.isLoading ? (
                  <Group justify="center" py="md">
                    <Loader size="sm" />
                  </Group>
                ) : employeeClockPointsQuery.error ? (
                  <Alert color="red" variant="light">
                    {employeeClockPointsQuery.error instanceof Error
                      ? employeeClockPointsQuery.error.message
                      : t("common.unknown_error")}
                  </Alert>
                ) : (
                  <Text c="dimmed">
                    {t("clockPoint.assignment.current")}{" "}
                    {selectedAssignedClockPoints.length > 0
                      ? selectedAssignedClockPoints
                          .map((clockPoint) => displayName(clockPoint.name, clockPoint.name_en))
                          .join(", ")
                      : t("common.not_available")}
                  </Text>
                )}
                <MultiSelect
                  label={t("clockPoint.assignment.clockPoints")}
                  data={activeClockPointOptions}
                  value={assignedClockPointIds}
                  onChange={setAssignedClockPointIds}
                  searchable
                  clearable
                />
                <Group justify="flex-end">
                  <Button onClick={() => void saveAssignments()} loading={assignMutation.isPending}>
                    {t("clockPoint.assignment.save")}
                  </Button>
                </Group>
              </>
            ) : null}
          </Stack>
        </Paper>
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingClockPoint ? t("clockPoint.edit") : t("clockPoint.add")}
        size="lg"
      >
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("clockPoint.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("clockPoint.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="lat"
                render={({ field }) => (
                  <NumberInput
                    label={t("clockPoint.fields.lat")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                    error={errors.lat?.message}
                    decimalScale={7}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="lng"
                render={({ field }) => (
                  <NumberInput
                    label={t("clockPoint.fields.lng")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                    error={errors.lng?.message}
                    decimalScale={7}
                  />
                )}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="radius_m"
                render={({ field }) => (
                  <NumberInput
                    label={t("clockPoint.fields.radiusM")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                    error={errors.radius_m?.message}
                    min={1}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="company_id"
                render={({ field }) => (
                  <Select
                    label={t("clockPoint.fields.company")}
                    data={companyOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value ?? undefined)}
                    error={errors.company_id?.message}
                    clearable
                  />
                )}
              />
            </Group>
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Checkbox
                  label={t("clockPoint.fields.active")}
                  checked={field.value ?? false}
                  onChange={(event) => field.onChange(event.currentTarget.checked)}
                  error={errors.active?.message}
                />
              )}
            />
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
