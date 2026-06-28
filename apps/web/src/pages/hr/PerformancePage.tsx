import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  kpiTargetSchema,
  performanceOverrideSchema,
  type KpiTargetInput,
  type PerformanceOverrideInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  listEmployees,
  listKpiTargets,
  listPerformance,
  putKpiTarget,
  putPerformanceOverride,
  type PerformanceScore
} from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";

type KpiTargetFormValues = {
  period?: string | undefined;
  metric?: string | undefined;
  target?: number | undefined;
  actual?: number | undefined;
};

type PerformanceOverrideFormValues = {
  period?: string | undefined;
  attendance_qualified?: boolean | null | undefined;
  task_completion_pct?: number | null | undefined;
  task_satisfaction_pct?: number | null | undefined;
  kpi_pct?: number | null | undefined;
};

const employeeQueryKey = ["hr", "employees"] as const;
const performanceMetrics = [
  "attendance_qualified",
  "task_completion_pct",
  "task_satisfaction_pct",
  "kpi_pct"
] as const;

type PerformanceMetric = (typeof performanceMetrics)[number];

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function toNumberOrUndefined(value: string | number) {
  return typeof value === "number" ? value : undefined;
}

function toNumberOrNull(value: string | number) {
  return typeof value === "number" ? value : null;
}

function formatValue(value?: string | null) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function getScoreValue(score: PerformanceScore, metric: PerformanceMetric, source: "auto" | "override" | "effective") {
  if (metric === "attendance_qualified") {
    if (source === "auto") {
      return score.attendanceQualifiedAuto;
    }
    if (source === "override") {
      return score.attendanceQualifiedOverride;
    }
    return score.effective.attendance_qualified;
  }

  if (metric === "task_completion_pct") {
    if (source === "auto") {
      return score.taskCompletionPctAuto;
    }
    if (source === "override") {
      return score.taskCompletionPctOverride;
    }
    return score.effective.task_completion_pct;
  }

  if (metric === "task_satisfaction_pct") {
    if (source === "auto") {
      return score.taskSatisfactionPctAuto;
    }
    if (source === "override") {
      return score.taskSatisfactionPctOverride;
    }
    return score.effective.task_satisfaction_pct;
  }

  if (source === "auto") {
    return score.kpiPctAuto;
  }
  if (source === "override") {
    return score.kpiPctOverride;
  }
  return score.effective.kpi_pct;
}

export function PerformancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [kpiModalOpened, setKpiModalOpened] = useState(false);
  const [overrideModalOpened, setOverrideModalOpened] = useState(false);
  const [kpiFormError, setKpiFormError] = useState<string | null>(null);
  const [overrideFormError, setOverrideFormError] = useState<string | null>(null);
  const [editingScore, setEditingScore] = useState<PerformanceScore | null>(null);

  const canManagePerformance = user?.role === "owner" || user?.role === "admin";
  const queryPeriod = period.trim() || undefined;

  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: listEmployees
  });
  const kpiQuery = useQuery({
    queryKey: ["hr", "kpi-targets", selectedEmployeeId, queryPeriod],
    queryFn: () => listKpiTargets(selectedEmployeeId ?? "", queryPeriod),
    enabled: Boolean(selectedEmployeeId)
  });
  const performanceQuery = useQuery({
    queryKey: ["hr", "performance", selectedEmployeeId, queryPeriod],
    queryFn: () => listPerformance(selectedEmployeeId ?? "", queryPeriod),
    enabled: Boolean(selectedEmployeeId)
  });

  const kpiForm = useForm<KpiTargetFormValues>({
    resolver: zodResolver(kpiTargetSchema) as Resolver<KpiTargetFormValues>,
    defaultValues: getKpiDefaultValues()
  });
  const overrideForm = useForm<PerformanceOverrideFormValues>({
    resolver: zodResolver(performanceOverrideSchema) as Resolver<PerformanceOverrideFormValues>,
    defaultValues: getOverrideDefaultValues()
  });

  const putKpiMutation = useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: string; body: KpiTargetInput }) =>
      putKpiTarget(employeeId, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "kpi-targets", variables.employeeId] });
      closeKpiModal();
    }
  });
  const putOverrideMutation = useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: string; body: PerformanceOverrideInput }) =>
      putPerformanceOverride(employeeId, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "performance", variables.employeeId] });
      closeOverrideModal();
    }
  });

  const employees = employeesQuery.data?.employees ?? [];
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const targets = kpiQuery.data?.targets ?? [];
  const scores = performanceQuery.data?.scores ?? [];
  const kpiErrors = kpiForm.formState.errors;
  const overrideErrors = overrideForm.formState.errors;

  function getKpiDefaultValues(): KpiTargetFormValues {
    return {
      period: queryPeriod ?? currentPeriod(),
      metric: undefined,
      target: undefined,
      actual: undefined
    };
  }

  function getOverrideDefaultValues(score?: PerformanceScore | null): PerformanceOverrideFormValues {
    return {
      period: score?.period ?? queryPeriod ?? currentPeriod(),
      attendance_qualified: score?.attendanceQualifiedOverride ?? null,
      task_completion_pct: stringToNumberOrNull(score?.taskCompletionPctOverride),
      task_satisfaction_pct: stringToNumberOrNull(score?.taskSatisfactionPctOverride),
      kpi_pct: stringToNumberOrNull(score?.kpiPctOverride)
    };
  }

  function openKpiModal() {
    setKpiFormError(null);
    kpiForm.reset(getKpiDefaultValues());
    setKpiModalOpened(true);
  }

  function closeKpiModal() {
    setKpiModalOpened(false);
    setKpiFormError(null);
    kpiForm.reset(getKpiDefaultValues());
  }

  function openOverrideModal(score?: PerformanceScore) {
    setEditingScore(score ?? null);
    setOverrideFormError(null);
    overrideForm.reset(getOverrideDefaultValues(score));
    setOverrideModalOpened(true);
  }

  function closeOverrideModal() {
    setOverrideModalOpened(false);
    setEditingScore(null);
    setOverrideFormError(null);
    overrideForm.reset(getOverrideDefaultValues());
  }

  const onKpiSubmit = kpiForm.handleSubmit(async (values) => {
    if (!selectedEmployeeId) {
      return;
    }

    setKpiFormError(null);

    try {
      await putKpiMutation.mutateAsync({
        employeeId: selectedEmployeeId,
        body: values as KpiTargetInput
      });
    } catch (error) {
      setKpiFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onOverrideSubmit = overrideForm.handleSubmit(async (values) => {
    if (!selectedEmployeeId) {
      return;
    }

    setOverrideFormError(null);

    try {
      await putOverrideMutation.mutateAsync({
        employeeId: selectedEmployeeId,
        body: values as PerformanceOverrideInput
      });
    } catch (error) {
      setOverrideFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
      </Group>

      {employeesQuery.error ? (
        <Alert color="red" variant="light">
          {employeesQuery.error instanceof Error ? employeesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md" p="md">
        <Group grow align="flex-end">
          <Select
            label={t("performance.filters.employee")}
            data={employeeOptions}
            value={selectedEmployeeId}
            onChange={setSelectedEmployeeId}
            searchable
            clearable
          />
          <TextInput
            label={t("performance.filters.period")}
            placeholder="YYYY-MM"
            value={period}
            onChange={(event) => setPeriod(event.currentTarget.value)}
          />
        </Group>
      </Paper>

      {selectedEmployeeId ? (
        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Title order={3}>{t("performance.kpi.title")}</Title>
                {canManagePerformance ? (
                  <Button onClick={openKpiModal}>{t("performance.kpi.upsert")}</Button>
                ) : null}
              </Group>
              {kpiQuery.error ? (
                <Alert color="red" variant="light">
                  {kpiQuery.error instanceof Error ? kpiQuery.error.message : t("common.unknown_error")}
                </Alert>
              ) : null}
              <ScrollArea>
                <Table miw={680} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("performance.fields.period")}</Table.Th>
                      <Table.Th>{t("performance.fields.metric")}</Table.Th>
                      <Table.Th>{t("performance.fields.target")}</Table.Th>
                      <Table.Th>{t("performance.fields.actual")}</Table.Th>
                      <Table.Th>{t("performance.fields.achievementPct")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {kpiQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={5}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : targets.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={5}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("performance.kpi.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      targets.map((target) => (
                        <Table.Tr key={target.id}>
                          <Table.Td>{target.period}</Table.Td>
                          <Table.Td>{target.metric}</Table.Td>
                          <Table.Td>{target.target}</Table.Td>
                          <Table.Td>{formatValue(target.actual)}</Table.Td>
                          <Table.Td>{formatValue(target.achievementPct)}</Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Title order={3}>{t("performance.scores.title")}</Title>
                {canManagePerformance ? (
                  <Button onClick={() => openOverrideModal()}>{t("performance.scores.adjust")}</Button>
                ) : null}
              </Group>
              <Text size="sm" c="dimmed">
                {t("performance.overrideHint")}
              </Text>
              {performanceQuery.error ? (
                <Alert color="red" variant="light">
                  {performanceQuery.error instanceof Error
                    ? performanceQuery.error.message
                    : t("common.unknown_error")}
                </Alert>
              ) : null}
              {performanceQuery.isLoading ? (
                <Group justify="center" py="lg">
                  <Loader size="sm" />
                </Group>
              ) : scores.length === 0 ? (
                <Text ta="center" c="dimmed" py="lg">
                  {t("performance.scores.empty")}
                </Text>
              ) : (
                <Stack gap="md">
                  {scores.map((score) => (
                    <Paper key={score.id} withBorder radius="md" p="md">
                      <Stack gap="sm">
                        <Group justify="space-between" align="center">
                          <Group gap="xs">
                            <Text fw={600}>{score.period}</Text>
                            <Badge variant="light">{t("performance.scores.periodScore")}</Badge>
                          </Group>
                          {canManagePerformance ? (
                            <Button size="xs" variant="light" onClick={() => openOverrideModal(score)}>
                              {t("performance.scores.adjust")}
                            </Button>
                          ) : null}
                        </Group>
                        <ScrollArea>
                          <Table miw={620} verticalSpacing="xs">
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>{t("performance.fields.metric")}</Table.Th>
                                <Table.Th>{t("performance.fields.auto")}</Table.Th>
                                <Table.Th>{t("performance.fields.override")}</Table.Th>
                                <Table.Th>{t("performance.fields.effective")}</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {performanceMetrics.map((metric) => (
                                <Table.Tr key={metric}>
                                  <Table.Td>{t(`performance.metrics.${metric}`)}</Table.Td>
                                  <Table.Td>{formatScoreValue(metric, getScoreValue(score, metric, "auto"), t)}</Table.Td>
                                  <Table.Td>
                                    {formatScoreValue(metric, getScoreValue(score, metric, "override"), t)}
                                  </Table.Td>
                                  <Table.Td>
                                    <Text fw={600}>
                                      {formatScoreValue(metric, getScoreValue(score, metric, "effective"), t)}
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </ScrollArea>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>
      ) : (
        <Text c="dimmed">{t("performance.selectEmployeeHint")}</Text>
      )}

      <Modal opened={kpiModalOpened} onClose={closeKpiModal} title={t("performance.kpi.upsert")} size="lg">
        <form onSubmit={onKpiSubmit}>
          <Stack gap="md">
            {kpiFormError ? (
              <Alert color="red" variant="light">
                {kpiFormError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("performance.fields.period")}
                placeholder="YYYY-MM"
                error={kpiErrors.period?.message}
                {...kpiForm.register("period", { setValueAs: emptyToUndefined })}
              />
              <TextInput
                label={t("performance.fields.metric")}
                error={kpiErrors.metric?.message}
                {...kpiForm.register("metric", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={kpiForm.control}
                name="target"
                render={({ field }) => (
                  <NumberInput
                    label={t("performance.fields.target")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                    error={kpiErrors.target?.message}
                    min={0}
                    decimalScale={2}
                  />
                )}
              />
              <Controller
                control={kpiForm.control}
                name="actual"
                render={({ field }) => (
                  <NumberInput
                    label={t("performance.fields.actual")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                    error={kpiErrors.actual?.message}
                    min={0}
                    decimalScale={2}
                  />
                )}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeKpiModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={putKpiMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={overrideModalOpened}
        onClose={closeOverrideModal}
        title={t("performance.scores.adjust")}
        size="lg"
      >
        <form onSubmit={onOverrideSubmit}>
          <Stack gap="md">
            {overrideFormError ? (
              <Alert color="red" variant="light">
                {overrideFormError}
              </Alert>
            ) : null}
            <Text size="sm" c="dimmed">
              {t("performance.overrideHint")}
            </Text>
            <TextInput
              label={t("performance.fields.period")}
              placeholder="YYYY-MM"
              error={overrideErrors.period?.message}
              {...overrideForm.register("period", { setValueAs: emptyToUndefined })}
            />
            <Controller
              control={overrideForm.control}
              name="attendance_qualified"
              render={({ field }) => (
                <Select
                  label={t("performance.metrics.attendance_qualified")}
                  data={[
                    { value: "null", label: t("performance.values.noAdjust") },
                    { value: "true", label: t("performance.values.qualified") },
                    { value: "false", label: t("performance.values.unqualified") }
                  ]}
                  value={field.value === true ? "true" : field.value === false ? "false" : "null"}
                  onChange={(value) => {
                    if (value === "true") {
                      field.onChange(true);
                    } else if (value === "false") {
                      field.onChange(false);
                    } else {
                      field.onChange(null);
                    }
                  }}
                  error={overrideErrors.attendance_qualified?.message}
                />
              )}
            />
            <Group grow align="flex-start">
              <OverrideNumberInput
                control={overrideForm.control}
                name="task_completion_pct"
                label={t("performance.metrics.task_completion_pct")}
                error={overrideErrors.task_completion_pct?.message}
              />
              <OverrideNumberInput
                control={overrideForm.control}
                name="task_satisfaction_pct"
                label={t("performance.metrics.task_satisfaction_pct")}
                error={overrideErrors.task_satisfaction_pct?.message}
              />
            </Group>
            <OverrideNumberInput
              control={overrideForm.control}
              name="kpi_pct"
              label={t("performance.metrics.kpi_pct")}
              error={overrideErrors.kpi_pct?.message}
            />
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {editingScore ? t("performance.scores.editingPeriod", { period: editingScore.period }) : ""}
              </Text>
              <Group>
                <Button variant="subtle" onClick={closeOverrideModal}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" loading={putOverrideMutation.isPending}>
                  {t("common.save")}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

function stringToNumberOrNull(value?: string | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function formatScoreValue(
  metric: PerformanceMetric,
  value: string | boolean | null | undefined,
  t: (key: string) => string
) {
  if (metric === "attendance_qualified") {
    if (value === true) {
      return t("performance.values.qualified");
    }
    if (value === false) {
      return t("performance.values.unqualified");
    }
    return "-";
  }

  return typeof value === "string" ? value : "-";
}

function OverrideNumberInput({
  control,
  name,
  label,
  error
}: {
  control: ReturnType<typeof useForm<PerformanceOverrideFormValues>>["control"];
  name: "task_completion_pct" | "task_satisfaction_pct" | "kpi_pct";
  label: string;
  error?: string | undefined;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <NumberInput
          label={label}
          value={field.value ?? ""}
          onChange={(value) => field.onChange(toNumberOrNull(value))}
          error={error}
          min={0}
          decimalScale={2}
        />
      )}
    />
  );
}
