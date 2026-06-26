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
  clockPointUpdateSchema,
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
  name?: string | undefined;
  name_en?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  radius_m?: number | undefined;
  company_id?: string | undefined;
  active?: boolean | undefined;
};

const companyQueryKey = ["hr", "companies"] as const;
const industryQueryKey = ["hr", "industries"] as const;
const workShiftQueryKey = ["hr", "work-shifts"] as const;
const companyClockPointQueryKey = (companyId: string | undefined) => ["hr", "clock-points", companyId] as const;

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

function getClockPointDefaultValues(companyId: string | undefined, clockPoint?: ClockPoint): ClockPointFormValues {
  return {
    name: clockPoint?.name ?? "",
    name_en: clockPoint?.name_en ?? undefined,
    lat: clockPoint ? Number(clockPoint.lat) : undefined,
    lng: clockPoint ? Number(clockPoint.lng) : undefined,
    radius_m: clockPoint?.radius_m ?? 200,
    company_id: companyId,
    active: clockPoint?.active ?? true
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
  const [createdCompanyNotice, setCreatedCompanyNotice] = useState(false);
  const [editingClockPoint, setEditingClockPoint] = useState<ClockPoint | null>(null);
  const [clockPointFormError, setClockPointFormError] = useState<string | null>(null);

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

  const clockPointForm = useForm<ClockPointFormValues>({
    resolver: zodResolver(
      editingClockPoint ? clockPointUpdateSchema : clockPointCreateSchema
    ) as Resolver<ClockPointFormValues>,
    defaultValues: getClockPointDefaultValues(editingCompany?.id, editingClockPoint ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      setEditingCompany(data.company);
      setCreatedCompanyNotice(true);
      form.reset(getCompanyDefaultValues(data.company));
      clockPointForm.reset(getClockPointDefaultValues(data.company.id));
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CompanyUpdateInput }) => updateCompany(id, body),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      setEditingCompany(data.company);
      form.reset(getCompanyDefaultValues(data.company));
    }
  });

  const createClockPointMutation = useMutation({
    mutationFn: createClockPoint,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyClockPointQueryKey(editingCompany?.id) });
      resetClockPointForm();
    }
  });

  const updateClockPointMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClockPointUpdateInput }) => updateClockPoint(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyClockPointQueryKey(editingCompany?.id) });
      resetClockPointForm();
    }
  });

  const deleteClockPointMutation = useMutation({
    mutationFn: deleteClockPoint,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyClockPointQueryKey(editingCompany?.id) });
    }
  });

  const companies = companiesQuery.data?.companies ?? [];
  const industries = industriesQuery.data?.industries ?? [];
  const workShifts = workShiftsQuery.data?.work_shifts ?? [];
  const clockPoints =
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
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const errors = form.formState.errors;
  const clockPointErrors = clockPointForm.formState.errors;
  const isClockPointSaving = createClockPointMutation.isPending || updateClockPointMutation.isPending;
  const selectedLat = clockPointForm.watch("lat");
  const selectedLng = clockPointForm.watch("lng");
  const selectedRadius = clockPointForm.watch("radius_m");

  useEffect(() => {
    if (!modalOpened || editingCompany || form.getValues("shift_id") || !defaultShiftId) {
      return;
    }

    form.setValue("shift_id", defaultShiftId, { shouldValidate: true });
  }, [defaultShiftId, editingCompany, form, modalOpened]);

  function openCreateModal() {
    setEditingCompany(null);
    setFormError(null);
    setCreatedCompanyNotice(false);
    setEditingClockPoint(null);
    setClockPointFormError(null);
    form.reset(getCompanyDefaultValues(undefined, defaultShiftId));
    clockPointForm.reset(getClockPointDefaultValues(undefined));
    setModalOpened(true);
  }

  function openEditModal(company: Company) {
    setEditingCompany(company);
    setFormError(null);
    setCreatedCompanyNotice(false);
    setEditingClockPoint(null);
    setClockPointFormError(null);
    form.reset(getCompanyDefaultValues(company));
    clockPointForm.reset(getClockPointDefaultValues(company.id));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingCompany(null);
    setFormError(null);
    setCreatedCompanyNotice(false);
    setEditingClockPoint(null);
    setClockPointFormError(null);
    form.reset(getCompanyDefaultValues(undefined, defaultShiftId));
    clockPointForm.reset(getClockPointDefaultValues(undefined));
  }

  function resetClockPointForm() {
    setEditingClockPoint(null);
    setClockPointFormError(null);
    clockPointForm.reset(getClockPointDefaultValues(editingCompany?.id));
  }

  function editClockPoint(clockPoint: ClockPoint) {
    setEditingClockPoint(clockPoint);
    setClockPointFormError(null);
    clockPointForm.reset(getClockPointDefaultValues(editingCompany?.id, clockPoint));
  }

  async function handleDeleteClockPoint(clockPoint: ClockPoint) {
    if (!window.confirm(t("clockPoint.confirmDelete", { name: clockPoint.name }))) {
      return;
    }

    await deleteClockPointMutation.mutateAsync(clockPoint.id);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    if (!values.shift_id) {
      form.setError("shift_id", { type: "required", message: t("company.shiftRequired") });
      return;
    }

    try {
      if (editingCompany) {
        await updateMutation.mutateAsync({ id: editingCompany.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as CompanyCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onClockPointSubmit = clockPointForm.handleSubmit(async (values) => {
    if (!editingCompany) {
      return;
    }

    setClockPointFormError(null);
    const body = {
      ...values,
      company_id: editingCompany.id
    };

    try {
      if (editingClockPoint) {
        await updateClockPointMutation.mutateAsync({ id: editingClockPoint.id, body });
        return;
      }

      await createClockPointMutation.mutateAsync(body as ClockPointCreateInput);
    } catch (error) {
      setClockPointFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("company.title")}</Title>
        <Button onClick={openCreateModal}>{t("company.add")}</Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
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
              {createdCompanyNotice ? (
                <Alert color="green" variant="light">
                  {t("company.createdClockPointPrompt")}
                </Alert>
              ) : null}
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

          {editingCompany ? (
            <>
              <Divider />
              <Stack gap="md">
                <Title order={4}>{t("hr.tabs.clockPoints")}</Title>
                {clockPointsQuery.error ? (
                  <Alert color="red" variant="light">
                    {clockPointsQuery.error instanceof Error ? clockPointsQuery.error.message : t("common.unknown_error")}
                  </Alert>
                ) : null}

                <Paper withBorder radius="md">
                  <ScrollArea>
                    <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
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
                        {clockPointsQuery.isLoading ? (
                          <Table.Tr>
                            <Table.Td colSpan={7}>
                              <Group justify="center" py="lg">
                                <Loader size="sm" />
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ) : clockPoints.length === 0 ? (
                          <Table.Tr>
                            <Table.Td colSpan={7}>
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
                              <Table.Td>{clockPoint.active ? t("common.yes") : t("common.no")}</Table.Td>
                              <Table.Td>
                                <Group gap="xs">
                                  <Button size="xs" variant="light" onClick={() => editClockPoint(clockPoint)}>
                                    {t("common.edit")}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="red"
                                    loading={deleteClockPointMutation.isPending}
                                    onClick={() => void handleDeleteClockPoint(clockPoint)}
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

                <form onSubmit={onClockPointSubmit}>
                  <Stack gap="md">
                    <Group justify="space-between" align="center">
                      <Title order={5}>{editingClockPoint ? t("clockPoint.edit") : t("clockPoint.add")}</Title>
                      {editingClockPoint ? (
                        <Button size="xs" variant="subtle" onClick={resetClockPointForm}>
                          {t("clockPoint.add")}
                        </Button>
                      ) : null}
                    </Group>
                    {clockPointFormError ? (
                      <Alert color="red" variant="light">
                        {clockPointFormError}
                      </Alert>
                    ) : null}
                    <Group grow align="flex-start">
                      <TextInput
                        label={t("clockPoint.fields.name")}
                        error={clockPointErrors.name?.message}
                        {...clockPointForm.register("name")}
                      />
                      <TextInput
                        label={t("clockPoint.fields.nameEn")}
                        error={clockPointErrors.name_en?.message}
                        {...clockPointForm.register("name_en", { setValueAs: emptyToUndefined })}
                      />
                    </Group>
                    <Group grow align="flex-start">
                      <Controller
                        control={clockPointForm.control}
                        name="lat"
                        render={({ field }) => (
                          <NumberInput
                            label={t("clockPoint.fields.lat")}
                            value={field.value ?? ""}
                            onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                            error={clockPointErrors.lat?.message}
                            decimalScale={7}
                          />
                        )}
                      />
                      <Controller
                        control={clockPointForm.control}
                        name="lng"
                        render={({ field }) => (
                          <NumberInput
                            label={t("clockPoint.fields.lng")}
                            value={field.value ?? ""}
                            onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                            error={clockPointErrors.lng?.message}
                            decimalScale={7}
                          />
                        )}
                      />
                      <Controller
                        control={clockPointForm.control}
                        name="radius_m"
                        render={({ field }) => (
                          <NumberInput
                            label={t("clockPoint.fields.radiusM")}
                            value={field.value ?? ""}
                            onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                            error={clockPointErrors.radius_m?.message}
                            min={1}
                          />
                        )}
                      />
                    </Group>
                    <MapPicker
                      lat={typeof selectedLat === "number" ? selectedLat : null}
                      lng={typeof selectedLng === "number" ? selectedLng : null}
                      radius={typeof selectedRadius === "number" ? selectedRadius : 0}
                      onChange={(lat, lng) => {
                        clockPointForm.setValue("lat", lat, { shouldValidate: true, shouldDirty: true });
                        clockPointForm.setValue("lng", lng, { shouldValidate: true, shouldDirty: true });
                      }}
                    />
                    <Controller
                      control={clockPointForm.control}
                      name="active"
                      render={({ field }) => (
                        <Checkbox
                          label={t("clockPoint.fields.active")}
                          checked={field.value ?? false}
                          onChange={(event) => field.onChange(event.currentTarget.checked)}
                          error={clockPointErrors.active?.message}
                        />
                      )}
                    />
                    <Group justify="flex-end">
                      <Button variant="subtle" onClick={resetClockPointForm}>
                        {t("common.cancel")}
                      </Button>
                      <Button type="submit" loading={isClockPointSaving}>
                        {t("common.save")}
                      </Button>
                    </Group>
                  </Stack>
                </form>
              </Stack>
            </>
          ) : null}
        </Stack>
      </Modal>
    </Stack>
  );
}
