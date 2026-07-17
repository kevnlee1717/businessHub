import { Button, Checkbox, Collapse, Group, Loader, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getStepDateLogs, updateCaseStep, type CaseStep, type CaseStepDateLog } from "../../api/cases";
import { type Employee } from "../../api/hr";

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toDateInputValue(value?: string | null) {
  if (!value) {
    return todayDateInputValue();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return todayDateInputValue();
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function resolveLogActor(log: CaseStepDateLog, employeeById: Map<string, Employee>) {
  if (log.actor_name) {
    return displayName(log.actor_name, log.actor_name_en);
  }

  const employee = log.actor_id ? employeeById.get(log.actor_id) : undefined;
  return employee ? displayName(employee.name, employee.name_en) : "-";
}

function StepDateHistory({
  step,
  opened,
  employeeById,
  onToggle
}: {
  step: CaseStep;
  opened: boolean;
  employeeById: Map<string, Employee>;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const logsQuery = useQuery({
    queryKey: ["business", "case-step-date-logs", step.id],
    queryFn: () => getStepDateLogs(step.id),
    enabled: opened
  });
  const logs = logsQuery.data?.dateLogs ?? [];

  return (
    <Stack gap={4} align="flex-start">
      <Button variant="subtle" size="xs" onClick={onToggle}>
        {logsQuery.data ? t("caseStep.date.historyCount", { n: logs.length }) : t("caseStep.date.history")}
      </Button>
      <Collapse in={opened}>
        <Stack gap={6} mt="xs">
          {logsQuery.isLoading ? (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                {t("common.loading")}
              </Text>
            </Group>
          ) : logs.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("caseStep.date.noHistory")}
            </Text>
          ) : (
            logs.map((log) => (
              <Group key={log.id} gap="xs" align="baseline" wrap="wrap">
                <Text size="sm" fw={500}>
                  {t(`caseStep.date.action.${log.action}`)}
                </Text>
                <Text size="sm" c="dimmed">
                  {resolveLogActor(log, employeeById)}
                </Text>
                <Text size="sm">
                  {formatDate(log.old_completed_at)} → {formatDate(log.new_completed_at)}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDateTime(log.created_at)}
                </Text>
              </Group>
            ))
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}

export function EpStepsPanel({
  steps,
  caseId,
  canManageCases,
  employeeById
}: {
  steps: CaseStep[];
  caseId: string;
  canManageCases: boolean;
  employeeById: Map<string, Employee>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [historyOpenByStepId, setHistoryOpenByStepId] = useState<Record<string, boolean>>({});
  const sortedSteps = useMemo(() => [...steps].sort((a, b) => a.step_order - b.step_order), [steps]);
  const updateMutation = useMutation({
    mutationFn: ({ stepId, checked }: { stepId: string; checked: boolean }) =>
      updateCaseStep(
        stepId,
        checked ? { status: "done", force: true, completed_at: toIsoDate(todayDateInputValue()) } : { status: "pending" }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });
  const dateMutation = useMutation({
    mutationFn: ({ stepId, completedAt }: { stepId: string; completedAt: string }) =>
      updateCaseStep(stepId, { completed_at: toIsoDate(completedAt) }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] }),
        queryClient.invalidateQueries({ queryKey: ["business", "case-step-date-logs", variables.stepId] })
      ]);
    }
  });

  if (sortedSteps.length === 0) {
    return (
      <Paper withBorder radius="md" p="md">
        <Text c="dimmed">{t("case.steps.empty")}</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="sm">
      {sortedSteps.map((step, index) => {
        const checked = step.status === "done";
        const checker = step.completed_by ? employeeById.get(step.completed_by) : undefined;
        const historyOpened = historyOpenByStepId[step.id] ?? false;
        return (
          <Paper
            key={step.id}
            withBorder
            radius="md"
            p="md"
            style={{
              borderColor: checked ? "var(--mantine-color-green-4)" : undefined,
              backgroundColor: checked ? "var(--mantine-color-green-0)" : undefined
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={4}>
                <Title order={4}>
                  {index + 1}. {displayName(step.name, step.name_en)}
                </Title>
                {step.description ? (
                  <Text size="sm" c="dimmed">
                    {step.description}
                  </Text>
                ) : null}
                {checked ? (
                  <Stack gap={6} mt={4}>
                    <Group gap="xs" align="center" wrap="wrap">
                      <Text size="sm" c="dimmed">
                        {t("caseStep.date.completedAt")}: {formatDate(step.completed_at)}
                      </Text>
                      {canManageCases ? (
                        <TextInput
                          type="date"
                          size="xs"
                          aria-label={t("caseStep.date.editDate")}
                          value={toDateInputValue(step.completed_at)}
                          disabled={dateMutation.isPending}
                          onChange={(event) =>
                            dateMutation.mutate({ stepId: step.id, completedAt: event.currentTarget.value })
                          }
                        />
                      ) : null}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {t("caseStep.date.checkedBy")}:{" "}
                      {checker ? displayName(checker.name, checker.name_en) : t("common.not_available")}
                    </Text>
                    <StepDateHistory
                      step={step}
                      opened={historyOpened}
                      employeeById={employeeById}
                      onToggle={() =>
                        setHistoryOpenByStepId((current) => ({ ...current, [step.id]: !(current[step.id] ?? false) }))
                      }
                    />
                  </Stack>
                ) : null}
              </Stack>
              <Checkbox
                size="lg"
                checked={checked}
                disabled={!canManageCases || updateMutation.isPending}
                aria-label={t("case.steps.markDone")}
                onChange={(event) => updateMutation.mutate({ stepId: step.id, checked: event.currentTarget.checked })}
              />
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
