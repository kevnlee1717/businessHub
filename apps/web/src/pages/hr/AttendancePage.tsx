import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
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
  TextInput,
  Title
} from "@mantine/core";
import {
  attendanceClockSchema,
  attendanceKinds,
  type AttendanceClockInput,
  type AttendanceKind
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  clockAttendance,
  getEmployeeAttendanceDays,
  listAttendance,
  listEmployees
} from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type AttendanceClockFormValues = {
  kind?: AttendanceKind | undefined;
  work_date?: string | undefined;
  clocked_at?: string | undefined;
  reason?: string | undefined;
  employee_id?: string | undefined;
};

const employeeQueryKey = ["hr", "employees"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toDateTimeLocalValue(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getDefaultValues(): AttendanceClockFormValues {
  return {
    kind: "clock_in",
    work_date: undefined,
    clocked_at: undefined,
    reason: undefined
  };
}

export function AttendancePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState("");
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const canManageAttendance = can("attendance.manage");

  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: () => listEmployees()
  });
  const daysQuery = useQuery({
    queryKey: ["hr", "attendance-days", selectedEmployeeId],
    queryFn: () => getEmployeeAttendanceDays(selectedEmployeeId ?? ""),
    enabled: Boolean(selectedEmployeeId)
  });
  const recordsQuery = useQuery({
    queryKey: ["hr", "attendance-records", selectedEmployeeId, workDate, page, pageSize],
    queryFn: () =>
      listAttendance({
        employee_id: selectedEmployeeId ?? undefined,
        work_date: workDate.trim() || undefined,
        page,
        page_size: pageSize
      }),
    enabled: Boolean(selectedEmployeeId),
    placeholderData: keepPreviousData
  });

  const form = useForm<AttendanceClockFormValues>({
    resolver: zodResolver(attendanceClockSchema) as Resolver<AttendanceClockFormValues>,
    defaultValues: getDefaultValues()
  });

  const clockMutation = useMutation({
    mutationFn: clockAttendance,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "attendance-days", selectedEmployeeId] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "attendance-records", selectedEmployeeId] });
      closeModal();
    }
  });

  const employees = employeesQuery.data?.employees ?? [];
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const attendanceKindOptions = attendanceKinds.map((kind) => ({
    value: kind,
    label: t(`attendanceKind.${kind}`)
  }));
  const days = daysQuery.data?.days ?? [];
  const records = recordsQuery.data?.records ?? [];
  const totalRecords = recordsQuery.data?.total ?? records.length;
  const errors = form.formState.errors;

  function openModal() {
    setFormError(null);
    form.reset(
      selectedEmployeeId
        ? { ...getDefaultValues(), employee_id: selectedEmployeeId }
        : getDefaultValues()
    );
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!selectedEmployeeId) {
      return;
    }

    setFormError(null);

    try {
      await clockMutation.mutateAsync({
        ...values,
        employee_id: selectedEmployeeId
      } as AttendanceClockInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        {canManageAttendance && selectedEmployeeId ? (
          <Button onClick={openModal}>{t("attendance.manualClock")}</Button>
        ) : null}
      </Group>

      {employeesQuery.error ? (
        <Alert color="red" variant="light">
          {employeesQuery.error instanceof Error ? employeesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md" p="md">
        <Group grow align="flex-end">
          <Select
            label={t("attendance.filters.employee")}
            data={employeeOptions}
            value={selectedEmployeeId}
            onChange={(value) => {
              setSelectedEmployeeId(value);
              setPage(1);
            }}
            searchable
            clearable
          />
          <TextInput
            label={t("attendance.filters.workDate")}
            placeholder="YYYY-MM-DD"
            value={workDate}
            onChange={(event) => {
              setWorkDate(event.currentTarget.value);
              setPage(1);
            }}
          />
        </Group>
      </Paper>

      {selectedEmployeeId ? (
        <>
          <Stack gap="md">
            <Title order={3}>{t("attendance.daysTitle")}</Title>
            {daysQuery.error ? (
              <Alert color="red" variant="light">
                {daysQuery.error instanceof Error ? daysQuery.error.message : t("common.unknown_error")}
              </Alert>
            ) : null}
            <Paper withBorder radius="md">
              <ScrollArea>
                <Table miw={720} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("attendance.fields.workDate")}</Table.Th>
                      <Table.Th>{t("attendance.fields.status")}</Table.Th>
                      <Table.Th>{t("attendance.fields.clockIn")}</Table.Th>
                      <Table.Th>{t("attendance.fields.clockOut")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {daysQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : days.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("attendance.emptyDays")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      days.map((day) => (
                        <Table.Tr key={day.id}>
                          <Table.Td>{day.workDate}</Table.Td>
                          <Table.Td>
                            {day.status ? t(`attendanceDayStatus.${day.status}`) : t("common.not_available")}
                          </Table.Td>
                          <Table.Td>{day.clockInId ? t("common.yes") : t("common.no")}</Table.Td>
                          <Table.Td>{day.clockOutId ? t("common.yes") : t("common.no")}</Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          </Stack>

          <Stack gap="md">
            <Title order={3}>{t("attendance.recordsTitle")}</Title>
            {recordsQuery.error ? (
              <Alert color="red" variant="light">
                {recordsQuery.error instanceof Error ? recordsQuery.error.message : t("common.unknown_error")}
              </Alert>
            ) : null}
            <Paper withBorder radius="md">
              <ScrollArea>
                <Table miw={920} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("attendance.fields.workDate")}</Table.Th>
                      <Table.Th>{t("attendance.fields.kind")}</Table.Th>
                      <Table.Th>{t("attendance.fields.clockedAt")}</Table.Th>
                      <Table.Th>{t("attendance.fields.deviationMinutes")}</Table.Th>
                      <Table.Th>{t("attendance.fields.method")}</Table.Th>
                      <Table.Th>{t("attendance.fields.inGeofence")}</Table.Th>
                      <Table.Th>{t("attendance.fields.onBehalf")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {recordsQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : records.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("attendance.emptyRecords")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      records.map((record) => (
                        <Table.Tr key={record.id}>
                          <Table.Td>{record.workDate}</Table.Td>
                          <Table.Td>{t(`attendanceKind.${record.kind}`)}</Table.Td>
                          <Table.Td>{formatDateTime(record.clockedAt)}</Table.Td>
                          <Table.Td>{record.deviationMinutes ?? t("common.not_available")}</Table.Td>
                          <Table.Td>{record.method ?? t("common.not_available")}</Table.Td>
                          <Table.Td>
                            {record.inGeofence === null || record.inGeofence === undefined
                              ? t("common.not_available")
                              : record.inGeofence
                                ? t("common.yes")
                                : t("common.no")}
                          </Table.Td>
                          <Table.Td>{record.onBehalfUserId ? t("common.yes") : t("common.no")}</Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
            <TablePagination
              total={totalRecords}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </Stack>
        </>
      ) : (
        <Text c="dimmed">{t("attendance.selectEmployeeHint")}</Text>
      )}

      <Modal opened={modalOpened} onClose={closeModal} title={t("attendance.manualClock")} size="md">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select
                  label={t("attendance.fields.kind")}
                  data={attendanceKindOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value as AttendanceKind)}
                  error={errors.kind?.message}
                />
              )}
            />
            <TextInput
              label={t("attendance.fields.workDate")}
              placeholder="YYYY-MM-DD"
              error={errors.work_date?.message}
              {...form.register("work_date", { setValueAs: emptyToUndefined })}
            />
            <Controller
              control={form.control}
              name="clocked_at"
              render={({ field }) => (
                <TextInput
                  label={t("attendance.fields.clockedAt")}
                  type="datetime-local"
                  value={toDateTimeLocalValue(field.value)}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    field.onChange(value ? new Date(value).toISOString() : undefined);
                  }}
                  error={errors.clocked_at?.message}
                />
              )}
            />
            <TextInput
              label={t("attendance.fields.reason")}
              error={errors.reason?.message}
              {...form.register("reason", { setValueAs: emptyToUndefined })}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={clockMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
