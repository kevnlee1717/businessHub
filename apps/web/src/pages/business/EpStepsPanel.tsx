import { Box, Button, Checkbox, Collapse, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
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

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
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

// 完成日期:平时只用大字文本显示;点击(可管理时)才弹出原生日期选择器。选了即存。
function StepCompletedDate({
  step,
  canManage,
  saving,
  onPick
}: {
  step: CaseStep;
  canManage: boolean;
  saving: boolean;
  onPick: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const savedValue = toDateInputValue(step.completed_at);

  function openPicker() {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // 某些环境 showPicker 不可用时兜底 focus,让用户点一下原生控件
      }
    }
    el.focus();
  }

  return (
    <Box pos="relative" style={{ display: "inline-flex" }}>
      <Text
        size="xl"
        fw={700}
        onClick={canManage ? openPicker : undefined}
        style={{ cursor: canManage ? "pointer" : "default", lineHeight: 1.1 }}
      >
        {formatDate(step.completed_at)}
      </Text>
      {canManage ? (
        <input
          ref={inputRef}
          type="date"
          value={savedValue}
          disabled={saving}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value) {
              onPick(value);
            }
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            pointerEvents: "none",
            border: 0,
            padding: 0
          }}
        />
      ) : null}
    </Box>
  );
}

function StepDateHistoryButton({
  step,
  opened,
  onToggle
}: {
  step: CaseStep;
  opened: boolean;
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
    <Button variant="subtle" size="xs" onClick={onToggle}>
      {logsQuery.data ? t("caseStep.date.historyCount", { n: logs.length }) : t("caseStep.date.history")}
    </Button>
  );
}

function StepDateHistoryCollapse({
  step,
  opened,
  employeeById
}: {
  step: CaseStep;
  opened: boolean;
  employeeById: Map<string, Employee>;
}) {
  const { t } = useTranslation();
  const logsQuery = useQuery({
    queryKey: ["business", "case-step-date-logs", step.id],
    queryFn: () => getStepDateLogs(step.id),
    enabled: opened
  });
  const logs = logsQuery.data?.dateLogs ?? [];

  return (
    <Collapse in={opened}>
      <Stack gap={6} mt="xs" pl="xs">
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
        const previousCompletedAt = index > 0 ? parseDate(sortedSteps[index - 1]?.completed_at) : null;
        const currentCompletedAt = parseDate(step.completed_at) ?? Date.now();
        const stepGapDays =
          previousCompletedAt === null ? null : Math.max(0, Math.round((currentCompletedAt - previousCompletedAt) / 86_400_000));
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
            <Stack gap={6}>
              <Group justify="space-between" align="center" wrap="nowrap">
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Title order={5} lineClamp={1}>
                    {index + 1}. {displayName(step.name, step.name_en)}
                    {stepGapDays !== null ? (
                      <Text span size="xl" fw={700} c="blue" ml="sm">
                        {t("caseStep.duration.stepGap", { days: stepGapDays })}
                      </Text>
                    ) : null}
                  </Title>
                  {step.description ? (
                    <Text size="xs" c="dimmed" truncate>
                      {step.description}
                    </Text>
                  ) : null}
                </Stack>

                <Group gap="md" justify="flex-end" align="center" wrap="wrap" style={{ flex: "0 1 auto" }}>
                  {checked ? (
                    <>
                      <StepCompletedDate
                        step={step}
                        canManage={canManageCases}
                        saving={dateMutation.isPending}
                        onPick={(value) => dateMutation.mutate({ stepId: step.id, completedAt: value })}
                      />
                      {checker ? (
                        <Text size="sm" c="dimmed">
                          {displayName(checker.name, checker.name_en)}
                        </Text>
                      ) : null}
                      <StepDateHistoryButton
                        step={step}
                        opened={historyOpened}
                        onToggle={() =>
                          setHistoryOpenByStepId((current) => ({ ...current, [step.id]: !(current[step.id] ?? false) }))
                        }
                      />
                    </>
                  ) : null}
                  <Checkbox
                    size="lg"
                    checked={checked}
                    disabled={!canManageCases || updateMutation.isPending}
                    aria-label={t("case.steps.markDone")}
                    onChange={(event) => updateMutation.mutate({ stepId: step.id, checked: event.currentTarget.checked })}
                  />
                </Group>
              </Group>
              {checked ? (
                <StepDateHistoryCollapse step={step} opened={historyOpened} employeeById={employeeById} />
              ) : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
