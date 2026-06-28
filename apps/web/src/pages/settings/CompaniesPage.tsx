import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import {
  clockPointCreateSchema,
  companyCreateSchema,
  companyUpdateSchema,
  companyStatuses,
  type ClockPointCreateInput,
  type ClockPointUpdateInput,
  type CompanyStatus,
  type CompanyCreateInput,
  type CompanyUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import { useEffect } from "react";
import { useMemo } from "react";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createClockPoint,
  createCompany,
  deleteClockPoint,
  listClockPoints,
  listCompanies,
  listIndustries,
  listWorkShifts,
  updateClockPoint,
  updateCompany,
  type ClockPoint,
  type Company
} from "../../api/hr";
import { MapPicker } from "../../components/MapPicker";

type CompanyFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  uen?: string | undefined;
  industry_id?: string | null | undefined;
  shift_id?: string | null | undefined;
  status?: CompanyStatus | undefined;
  note?: string | null | undefined;
};

type ClockPointFormValues = {
  key: string;
  id?: string | undefined;
  name?: string | undefined;
  name_en?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  radius_m?: number | undefined;
  active?: boolean | undefined;
};

const companyQueryKey = ["hr", "companies"] as const;
const industryQueryKey = ["hr", "industries"] as const;
const workShiftQueryKey = ["hr", "work-shifts"] as const;
const companyClockPointQueryKey = (companyId: string | undefined) => ["hr", "clock-points", companyId] as const;
const clockPointFormSchema = clockPointCreateSchema.omit({ company_id: true });

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

function createClockPointKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
}

function getCompanyDefaultValues(company?: Company, defaultShiftId?: string): CompanyFormValues {
  return {
    name: company?.name ?? "",
    name_en: company?.name_en ?? undefined,
    uen: company?.uen ?? undefined,
    industry_id: company?.industry_id ?? null,
    shift_id: company ? company.shift_id ?? null : defaultShiftId ?? null,
    status: isCompanyStatus(company?.status) ? company.status : undefined,
    note: company?.note ?? null
  };
}

function toClockPointFormValues(clockPoint: ClockPoint): ClockPointFormValues {
  return {
    key: clockPoint.id,
    id: clockPoint.id,
    name: clockPoint.name,
    name_en: clockPoint.name_en ?? undefined,
    lat: Number(clockPoint.lat),
    lng: Number(clockPoint.lng),
    radius_m: clockPoint.radius_m,
    active: clockPoint.active
  };
}

function getNewClockPointValues(): ClockPointFormValues {
  return {
    key: createClockPointKey(),
    name: "",
    name_en: undefined,
    lat: undefined,
    lng: undefined,
    radius_m: 200,
    active: true
  };
}

function isCompanyStatus(value: string | null | undefined): value is CompanyStatus {
  return companyStatuses.includes(value as CompanyStatus);
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function toNumberOrUndefined(value: string | number) {
  return typeof value === "number" ? value : undefined;
}

export function CompaniesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [points, setPoints] = useState<ClockPointFormValues[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [pointsLoadedForCompanyId, setPointsLoadedForCompanyId] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: listCompanies
  });

  const industriesQuery = useQuery({
    queryKey: industryQueryKey,
    queryFn: listIndustries
  });
  const workShiftsQuery = useQuery({
    queryKey: workShiftQueryKey,
    queryFn: listWorkShifts
  });
  const clockPointsQuery = useQuery({
    queryKey: companyClockPointQueryKey(editingCompany?.id),
    queryFn: listClockPoints,
    enabled: modalOpened && Boolean(editingCompany?.id)
  });

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(
      editingCompany ? companyUpdateSchema : companyCreateSchema
    ) as Resolver<CompanyFormValues>,
    defaultValues: getCompanyDefaultValues(editingCompany ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createCompany
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CompanyUpdateInput }) => updateCompany(id, body)
  });

  const createClockPointMutation = useMutation({
    mutationFn: createClockPoint
  });

  const updateClockPointMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClockPointUpdateInput }) => updateClockPoint(id, body)
  });

  const deleteClockPointMutation = useMutation({
    mutationFn: deleteClockPoint
  });

  const companies = companiesQuery.data?.companies ?? [];
  const industries = industriesQuery.data?.industries ?? [];
  const workShifts = workShiftsQuery.data?.work_shifts ?? [];
  const loadedClockPoints =
    clockPointsQuery.data?.clockPoints.filter((clockPoint) => clockPoint.company_id === editingCompany?.id) ?? [];
  const industryById = useMemo(
    () => new Map(industries.map((industry) => [industry.id, industry])),
    [industries]
  );
  const workShiftById = useMemo(
    () => new Map(workShifts.map((shift) => [shift.id, shift])),
    [workShifts]
  );
  const defaultShiftId = workShifts.find((shift) => shift.is_default)?.id ?? workShifts[0]?.id;
  const industryOptions = industries.map((industry) => ({
    value: industry.id,
    label: displayName(industry.name, industry.name_en)
  }));
  const shiftOptions = workShifts.map((shift) => ({
    value: shift.id,
    label: shift.name
  }));
  const statusOptions = companyStatuses.map((status) => ({
    value: status,
    label: t(`companyStatus.${status}`)
  }));
  const loadError = companiesQuery.error ?? industriesQuery.error ?? workShiftsQuery.error;
  const isLoading = companiesQuery.isLoading || industriesQuery.isLoading || workShiftsQuery.isLoading;
  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    createClockPointMutation.isPending ||
    updateClockPointMutation.isPending ||
    deleteClockPointMutation.isPending;
  const errors = form.formState.errors;

  useEffect(() => {
    if (!modalOpened || editingCompany || form.getValues("shift_id") || !defaultShiftId) {
      return;
    }

    form.setValue("shift_id", defaultShiftId, { shouldValidate: true });
  }, [defaultShiftId, editingCompany, form, modalOpened]);

  useEffect(() => {
    if (!modalOpened || !editingCompany || clockPointsQuery.isLoading || pointsLoadedForCompanyId === editingCompany.id) {
      return;
    }

    setPoints(loadedClockPoints.map(toClockPointFormValues));
    setDeletedIds([]);
    setEditingKey(null);
    setPointsLoadedForCompanyId(editingCompany.id);
  }, [
    clockPointsQuery.isLoading,
    editingCompany,
    loadedClockPoints,
    modalOpened,
    pointsLoadedForCompanyId
  ]);

  function openCreateModal() {
    setEditingCompany(null);
    setFormError(null);
    setPoints([]);
    setDeletedIds([]);
    setEditingKey(null);
    setPointsLoadedForCompanyId(null);
    form.reset(getCompanyDefaultValues(undefined, defaultShiftId));
    setModalOpened(true);
  }

  function openEditModal(company: Company) {
    setEditingCompany(company);
    setFormError(null);
    setPoints([]);
    setDeletedIds([]);
    setEditingKey(null);
    setPointsLoadedForCompanyId(null);
    form.reset(getCompanyDefaultValues(company));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingCompany(null);
    setFormError(null);
    setPoints([]);
    setDeletedIds([]);
    setEditingKey(null);
    setPointsLoadedForCompanyId(null);
    form.reset(getCompanyDefaultValues(undefined, defaultShiftId));
  }

  function updatePoint(key: string, patch: Partial<ClockPointFormValues>) {
    setPoints((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addClockPoint() {
    const point = getNewClockPointValues();
    setPoints((items) => [...items, point]);
    setEditingKey(point.key);
  }

  function removeClockPoint(point: ClockPointFormValues) {
    if (point.id) {
      setDeletedIds((ids) => (ids.includes(point.id!) ? ids : [...ids, point.id!]));
    }

    setPoints((items) => items.filter((item) => item.key !== point.key));
    setEditingKey((key) => (key === point.key ? null : key));
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    if (!values.shift_id) {
      form.setError("shift_id", { type: "required", message: t("company.shiftRequired") });
      return;
    }

    try {
      const parsedPoints = points.map((point) => ({
        id: point.id,
        body: clockPointFormSchema.parse({
          name: point.name,
          name_en: point.name_en,
          lat: point.lat,
          lng: point.lng,
          radius_m: point.radius_m,
          active: point.active
        })
      }));

      const savedCompany = editingCompany
        ? (await updateMutation.mutateAsync({ id: editingCompany.id, body: values })).company
        : (await createMutation.mutateAsync(values as CompanyCreateInput)).company;

      await Promise.all(deletedIds.map((id) => deleteClockPointMutation.mutateAsync(id)));

      for (const point of parsedPoints) {
        const body = { ...point.body, company_id: savedCompany.id };
        if (point.id) {
          await updateClockPointMutation.mutateAsync({ id: point.id, body });
        } else {
          await createClockPointMutation.mutateAsync(body as ClockPointCreateInput);
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: companyQueryKey }),
        queryClient.invalidateQueries({ queryKey: companyClockPointQueryKey(savedCompany.id) }),
        queryClient.invalidateQueries({ queryKey: ["hr", "clock-points"] })
      ]);
      closeModal();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Button onClick={openCreateModal}>{t("company.add")}</Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("company.fields.name")}</Table.Th>
                <Table.Th>{t("company.fields.uen")}</Table.Th>
                <Table.Th>{t("company.fields.industry")}</Table.Th>
                <Table.Th>{t("company.fields.shift")}</Table.Th>
                <Table.Th>{t("company.fields.status")}</Table.Th>
                <Table.Th>{t("company.fields.note")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : companies.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("company.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                companies.map((company) => (
                  <Table.Tr key={company.id}>
                    <Table.Td>{displayName(company.name, company.name_en)}</Table.Td>
                    <Table.Td>{company.uen ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      {company.industry_id
                        ? industryById.get(company.industry_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>
                      {company.shift_id
                        ? workShiftById.get(company.shift_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>
                      {isCompanyStatus(company.status)
                        ? t(`companyStatus.${company.status}`)
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>{company.note ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button size="xs" variant="light" onClick={() => openEditModal(company)}>
                          {t("common.edit")}
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

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingCompany ? t("company.edit") : t("company.add")}
        size="xl"
      >
        <Stack gap="md">
          <form onSubmit={onSubmit}>
            <Stack gap="md">
              <Title order={4}>{t("company.basicInfo")}</Title>
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("company.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("company.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <TextInput
                label={t("company.fields.uen")}
                error={errors.uen?.message}
                {...form.register("uen", { setValueAs: emptyToUndefined })}
              />
              <Controller
                control={form.control}
                name="industry_id"
                render={({ field }) => (
                  <Select
                    label={t("company.fields.industry")}
                    data={industryOptions}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    error={errors.industry_id?.message}
                    clearable
                    searchable
                  />
                )}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="shift_id"
                render={({ field }) => (
                  <Select
                    label={t("company.fields.shift")}
                    data={shiftOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value)}
                    error={errors.shift_id?.message}
                    searchable
                    required
                  />
                )}
              />
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select
                    label={t("company.fields.status")}
                    data={statusOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(isCompanyStatus(value) ? value : undefined)}
                    error={errors.status?.message}
                    clearable
                  />
                )}
              />
            </Group>
            <Textarea
              label={t("company.fields.note")}
              error={errors.note?.message}
              {...form.register("note", { setValueAs: emptyToNull })}
            />

            <Divider />
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Title order={4}>{t("hr.tabs.clockPoints")}</Title>
                <Button type="button" size="xs" variant="light" onClick={addClockPoint}>
                  {t("clockPoint.add")}
                </Button>
              </Group>
              {editingCompany && clockPointsQuery.error ? (
                <Alert color="red" variant="light">
                  {clockPointsQuery.error instanceof Error ? clockPointsQuery.error.message : t("common.unknown_error")}
                </Alert>
              ) : null}

              <Paper withBorder radius="md">
                <ScrollArea>
                  <Table miw={860} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("clockPoint.fields.name")}</Table.Th>
                        <Table.Th>{t("clockPoint.fields.nameEn")}</Table.Th>
                        <Table.Th>{t("clockPoint.fields.lat")}</Table.Th>
                        <Table.Th>{t("clockPoint.fields.lng")}</Table.Th>
                        <Table.Th>{t("clockPoint.fields.radiusM")}</Table.Th>
                        <Table.Th>{t("clockPoint.fields.active")}</Table.Th>
                        <Table.Th>{t("common.actions")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {editingCompany && clockPointsQuery.isLoading && !pointsLoadedForCompanyId ? (
                        <Table.Tr>
                          <Table.Td colSpan={7}>
                            <Group justify="center" py="lg">
                              <Loader size="sm" />
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ) : points.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={7}>
                            <Text ta="center" c="dimmed" py="lg">
                              {t("clockPoint.empty")}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        points.map((point) => (
                          <Fragment key={point.key}>
                            <Table.Tr>
                              <Table.Td>{point.name || t("common.not_available")}</Table.Td>
                              <Table.Td>{point.name_en || t("common.not_available")}</Table.Td>
                              <Table.Td>{typeof point.lat === "number" ? point.lat : t("common.not_available")}</Table.Td>
                              <Table.Td>{typeof point.lng === "number" ? point.lng : t("common.not_available")}</Table.Td>
                              <Table.Td>{point.radius_m ?? t("common.not_available")}</Table.Td>
                              <Table.Td>{point.active ? t("common.yes") : t("common.no")}</Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="light"
                                    onClick={() => setEditingKey((key) => (key === point.key ? null : point.key))}
                                  >
                                    {editingKey === point.key ? t("common.collapse") : t("common.edit")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="light"
                                    color="red"
                                    onClick={() => removeClockPoint(point)}
                                  >
                                    {t("common.delete")}
                                  </Button>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                            {editingKey === point.key ? (
                              <Table.Tr>
                                <Table.Td colSpan={7}>
                                  <Stack gap="md" py="sm">
                                    <Group grow align="flex-start">
                                      <TextInput
                                        label={t("clockPoint.fields.name")}
                                        value={point.name ?? ""}
                                        onChange={(event) => updatePoint(point.key, { name: event.currentTarget.value })}
                                      />
                                      <TextInput
                                        label={t("clockPoint.fields.nameEn")}
                                        value={point.name_en ?? ""}
                                        onChange={(event) =>
                                          updatePoint(point.key, { name_en: emptyToUndefined(event.currentTarget.value) as string | undefined })
                                        }
                                      />
                                    </Group>
                                    <Group grow align="flex-start">
                                      <NumberInput
                                        label={t("clockPoint.fields.lat")}
                                        value={point.lat ?? ""}
                                        onChange={(value) => updatePoint(point.key, { lat: toNumberOrUndefined(value) })}
                                        decimalScale={7}
                                      />
                                      <NumberInput
                                        label={t("clockPoint.fields.lng")}
                                        value={point.lng ?? ""}
                                        onChange={(value) => updatePoint(point.key, { lng: toNumberOrUndefined(value) })}
                                        decimalScale={7}
                                      />
                                      <NumberInput
                                        label={t("clockPoint.fields.radiusM")}
                                        value={point.radius_m ?? ""}
                                        onChange={(value) => updatePoint(point.key, { radius_m: toNumberOrUndefined(value) })}
                                        min={1}
                                      />
                                    </Group>
                                    <MapPicker
                                      lat={typeof point.lat === "number" ? point.lat : null}
                                      lng={typeof point.lng === "number" ? point.lng : null}
                                      radius={typeof point.radius_m === "number" ? point.radius_m : 0}
                                      onChange={(lat, lng) => updatePoint(point.key, { lat, lng })}
                                    />
                                    <Group justify="space-between" align="center">
                                      <Checkbox
                                        label={t("clockPoint.fields.active")}
                                        checked={point.active ?? false}
                                        onChange={(event) => updatePoint(point.key, { active: event.currentTarget.checked })}
                                      />
                                      <Button type="button" size="xs" variant="subtle" onClick={() => setEditingKey(null)}>
                                        {t("common.collapse")}
                                      </Button>
                                    </Group>
                                  </Stack>
                                </Table.Td>
                              </Table.Tr>
                            ) : null}
                          </Fragment>
                        ))
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>
            </Stack>
            <Group justify="flex-end">
              <Button type="button" variant="subtle" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSaving}>
                {t("common.save")}
              </Button>
            </Group>
            </Stack>
          </form>
        </Stack>
      </Modal>
    </Stack>
  );
}
