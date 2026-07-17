import { Checkbox, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { updateCaseStep, type CaseStep } from "../../api/cases";

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function EpStepsPanel({
  steps,
  caseId,
  canManageCases
}: {
  steps: CaseStep[];
  caseId: string;
  canManageCases: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const sortedSteps = useMemo(() => [...steps].sort((a, b) => a.step_order - b.step_order), [steps]);
  const updateMutation = useMutation({
    mutationFn: ({ stepId, checked }: { stepId: string; checked: boolean }) =>
      updateCaseStep(stepId, checked ? { status: "done", force: true } : { status: "pending" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
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
