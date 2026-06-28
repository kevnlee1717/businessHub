import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title
} from "@mantine/core";
import {
  siteVisitOverrideSchema,
  siteVisitStatuses,
  type SiteVisitOverrideInput,
  type SiteVisitStatus
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  listEmployees,
  listSiteVisits,
  overrideSiteVisit,
  type Employee,
  type SiteVisit
} from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";

type SiteVisitOverrideFormValues = {
  status?: SiteVisitStatus | undefined;
  reject_reason?: string | undefined;
};

const employeeQueryKey = ["hr", "employees"] as const;
const siteVisitsQueryKey = ["hr", "site-visits"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function employeeName(employeeById: Map<string, Employee>, employeeId?: string | null) {
  if (!employeeId) {
    return "-";
  }

  const employee = employeeById.get(employeeId);
  return employee ? displayName(employee.name, employee.name_en) : employeeId;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function statusColor(status: SiteVisitStatus) {
  if (status === "verified") {
    return "green";
  }

  if (status === "rejected_distance" || status === "rejected_face") {
    return "red";
  }

  if (status === "manual_override") {
    return "blue";
  }

  return "gray";
}

function getDefaultValues(siteVisit?: SiteVisit | null): SiteVisitOverrideFormValues {
  return {
    status: siteVisit?.status ?? "manual_override",
    reject_reason: siteVisit?.reject_reason ?? undefined
  };
}

export function SiteVisitsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<SiteVisitStatus | null>(null);
  const [reviewingSiteVisit, setReviewingSiteVisit] = useState<SiteVisit | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const canOverride = user?.role === "owner" || user?.role === "admin";

  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: listEmployees
  });
  const siteVisitsQuery = useQuery({
    queryKey: [...siteVisitsQueryKey, selectedEmployeeId, selectedStatus],
    queryFn: () =>
      listSiteVisits({
        employee_id: selectedEmployeeId ?? undefined,
        status: selectedStatus ?? undefined
      })
  });

  const overrideForm = useForm<SiteVisitOverrideFormValues>({
    resolver: zodResolver(siteVisitOverrideSchema) as Resolver<SiteVisitOverrideFormValues>,
    defaultValues: getDefaultValues()
  });

  const overrideMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SiteVisitOverrideInput }) => overrideSiteVisit(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: siteVisitsQueryKey });
      closeModal();
    }
  });

  const employees = employeesQuery.data?.employees ?? [];
  const siteVisits = siteVisitsQuery.data?.siteVisits ?? [];
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const statusOptions = siteVisitStatuses.map((status) => ({
    value: status,
    label: t(`siteVisitStatus.${status}`)
  }));
  const loadError = employeesQuery.error ?? siteVisitsQuery.error;
  const errors = overrideForm.formState.errors;

  function openModal(siteVisit: SiteVisit) {
    setReviewingSiteVisit(siteVisit);
    setFormError(null);
    overrideForm.reset(getDefaultValues(siteVisit));
  }

  function closeModal() {
    setReviewingSiteVisit(null);
    setFormError(null);
    overrideForm.reset(getDefaultValues());
  }

  const onSubmit = overrideForm.handleSubmit(async (values) => {
    if (!reviewingSiteVisit) {
      return;
    }

    setFormError(null);
    try {
      await overrideMutation.mutateAsync({
        id: reviewingSiteVisit.id,
        body: values as SiteVisitOverrideInput
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="lg">

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md" p="md">
        <Group align="flex-end">
          <Select
            label={t("siteVisit.filters.employee")}
            data={employeeOptions}
            value={selectedEmployeeId}
            onChange={setSelectedEmployeeId}
            searchable
            clearable
          />
          <Select
            label={t("siteVisit.filters.status")}
            data={statusOptions}
            value={selectedStatus}
            onChange={(value) => setSelectedStatus(value as SiteVisitStatus | null)}
            clearable
          />
        </Group>
      </Paper>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={980} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("siteVisit.fields.employee")}</Table.Th>
                <Table.Th>{t("siteVisit.fields.capturedAt")}</Table.Th>
                <Table.Th>{t("siteVisit.fields.status")}</Table.Th>
                <Table.Th>{t("siteVisit.fields.distanceToLeadM")}</Table.Th>
                <Table.Th>{t("siteVisit.fields.faceStatus")}</Table.Th>
                <Table.Th>{t("siteVisit.fields.note")}</Table.Th>
                {canOverride ? <Table.Th>{t("common.actions")}</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {siteVisitsQuery.isLoading || employeesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={canOverride ? 7 : 6}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : siteVisits.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={canOverride ? 7 : 6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("siteVisit.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                siteVisits.map((siteVisit) => (
                  <Table.Tr key={siteVisit.id}>
                    <Table.Td>{employeeName(employeeById, siteVisit.employee_id)}</Table.Td>
                    <Table.Td>{formatDateTime(siteVisit.captured_at)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(siteVisit.status)} variant="light">
                        {t(`siteVisitStatus.${siteVisit.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{siteVisit.distance_to_lead_m ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      {siteVisit.face_status ? t(`siteVisitFaceStatus.${siteVisit.face_status}`) : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>{siteVisit.note ?? t("common.not_available")}</Table.Td>
                    {canOverride ? (
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => openModal(siteVisit)}>
                          {t("siteVisit.review")}
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal
        opened={Boolean(reviewingSiteVisit)}
        onClose={closeModal}
        title={t("siteVisit.review")}
        size="lg"
      >
        {reviewingSiteVisit ? (
          <form onSubmit={onSubmit}>
            <Stack gap="md">
              {formError ? (
                <Alert color="red" variant="light">
                  {formError}
                </Alert>
              ) : null}

              <Paper withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text c="dimmed">{t("siteVisit.fields.employee")}</Text>
                    <Text>{employeeName(employeeById, reviewingSiteVisit.employee_id)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text c="dimmed">{t("siteVisit.fields.capturedAt")}</Text>
                    <Text>{formatDateTime(reviewingSiteVisit.captured_at)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text c="dimmed">{t("siteVisit.fields.latLng")}</Text>
                    <Text>
                      {reviewingSiteVisit.lat ?? t("common.not_available")},{" "}
                      {reviewingSiteVisit.lng ?? t("common.not_available")}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text c="dimmed">{t("siteVisit.fields.distanceToLeadM")}</Text>
                    <Text>{reviewingSiteVisit.distance_to_lead_m ?? t("common.not_available")}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text c="dimmed">{t("siteVisit.fields.note")}</Text>
                    <Text>{reviewingSiteVisit.note ?? t("common.not_available")}</Text>
                  </Group>
                </Stack>
              </Paper>

              <Controller
                control={overrideForm.control}
                name="status"
                render={({ field }) => (
                  <Select
                    label={t("siteVisit.fields.status")}
                    data={statusOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as SiteVisitStatus)}
                    error={errors.status?.message}
                  />
                )}
              />
              <Textarea
                label={t("siteVisit.fields.rejectReason")}
                error={errors.reject_reason?.message}
                {...overrideForm.register("reject_reason", { setValueAs: emptyToUndefined })}
              />
              <Group justify="flex-end">
                <Button variant="subtle" onClick={closeModal}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" loading={overrideMutation.isPending}>
                  {t("common.save")}
                </Button>
              </Group>
            </Stack>
          </form>
        ) : null}
      </Modal>
    </Stack>
  );
}
