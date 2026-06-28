import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCan } from "../../auth/permissions";
import {
  getAcademyCollection,
  getAcademyHealth,
  getAcademyOverdue,
  markDiplomaPaymentPaid,
  type AcademyCollectionRow,
  type AcademyOverdueRow
} from "../../api/education";

const academyQueryKey = ["education", "academy"] as const;

function formatPeriod(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function currentPeriod() {
  return formatPeriod(new Date());
}

function shiftPeriod(period: string, offsetMonths: number) {
  const [year = new Date().getFullYear(), month = new Date().getMonth() + 1] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + offsetMonths, 1);
  return formatPeriod(date);
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number | string | null | undefined) {
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(rate: number | string | null | undefined) {
  return Math.round(toNumber(rate) * 100);
}

type MarkPaidButtonProps = {
  paymentId: string;
  disabled?: boolean;
};

function MarkPaidButton({ paymentId, disabled }: MarkPaidButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => markDiplomaPaymentPaid(paymentId, true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: academyQueryKey });
    }
  });

  return (
    <Button
      size="xs"
      variant="light"
      disabled={disabled ?? false}
      loading={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {t("academyCollection.actions.markPaid")}
    </Button>
  );
}

type OverdueTableProps = {
  rows: AcademyOverdueRow[];
  canManage: boolean;
};

function OverdueTable({ rows, canManage }: OverdueTableProps) {
  const { t } = useTranslation();

  return (
    <ScrollArea>
      <Table withTableBorder withColumnBorders highlightOnHover miw={760}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("academyCollection.fields.student")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.program")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.period")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.amount")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.overdueMonths")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.phone")}</Table.Th>
            <Table.Th>{t("common.actions")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7}>
                <Text c="dimmed">{t("academyCollection.emptyOverdue")}</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((row) => (
              <Table.Tr key={row.payment_id}>
                <Table.Td>{row.student_name}</Table.Td>
                <Table.Td>{row.program}</Table.Td>
                <Table.Td>{row.period}</Table.Td>
                <Table.Td>{formatMoney(row.amount)}</Table.Td>
                <Table.Td>
                  <Badge color={row.overdue_months > 0 ? "red" : "gray"} variant="light">
                    {row.overdue_months}
                  </Badge>
                </Table.Td>
                <Table.Td>{row.phone ?? t("common.not_available")}</Table.Td>
                <Table.Td>
                  <MarkPaidButton paymentId={row.payment_id} disabled={!canManage} />
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

type CollectionRowsTableProps = {
  rows: AcademyCollectionRow[];
  canManage: boolean;
};

function CollectionRowsTable({ rows, canManage }: CollectionRowsTableProps) {
  const { t } = useTranslation();

  return (
    <ScrollArea>
      <Table withTableBorder withColumnBorders highlightOnHover miw={860}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("academyCollection.fields.student")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.program")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.period")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.amount")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.status")}</Table.Th>
            <Table.Th>{t("academyCollection.fields.paidAt")}</Table.Th>
            <Table.Th>{t("common.actions")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={7}>
                <Text c="dimmed">{t("academyCollection.emptyCollectionRows")}</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((row) => (
              <Table.Tr key={row.payment_id}>
                <Table.Td>{row.student_name}</Table.Td>
                <Table.Td>{row.program}</Table.Td>
                <Table.Td>{row.period}</Table.Td>
                <Table.Td>{formatMoney(row.amount)}</Table.Td>
                <Table.Td>
                  <Badge color={row.paid ? "green" : "yellow"} variant="light">
                    {row.paid ? t("academyCollection.status.paid") : t("academyCollection.status.unpaid")}
                  </Badge>
                </Table.Td>
                <Table.Td>{row.paid_at ? new Date(row.paid_at).toLocaleString() : t("common.not_available")}</Table.Td>
                <Table.Td>
                  {row.paid ? null : <MarkPaidButton paymentId={row.payment_id} disabled={!canManage} />}
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

export function AcademyCollectionPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(currentPeriod());
  const canManageEducation = useCan("education.manage");

  const trendPeriods = useMemo(() => Array.from({ length: 6 }, (_, index) => shiftPeriod(period, index - 5)), [period]);

  const collectionQuery = useQuery({
    queryKey: [...academyQueryKey, "collection", period],
    queryFn: () => getAcademyCollection(period)
  });
  const overdueQuery = useQuery({
    queryKey: [...academyQueryKey, "overdue", period],
    queryFn: () => getAcademyOverdue(period)
  });
  const healthQuery = useQuery({
    queryKey: [...academyQueryKey, "health", period],
    queryFn: () => getAcademyHealth(period)
  });
  const trendQueries = useQueries({
    queries: trendPeriods.map((trendPeriod) => ({
      queryKey: [...academyQueryKey, "collection", trendPeriod],
      queryFn: () => getAcademyCollection(trendPeriod)
    }))
  });

  const loadError = collectionQuery.error ?? overdueQuery.error ?? healthQuery.error;
  const summary = collectionQuery.data?.summary;
  const collectionRate = formatPercent(summary?.collection_rate);
  const progressValue = Math.max(0, Math.min(100, collectionRate));
  const health = healthQuery.data;
  const healthHasGap = health?.breakeven_students != null && health?.gap != null;
  const breakevenStudents = health?.breakeven_students ?? 0;
  const gap = health?.gap ?? 0;

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <TextInput
          type="month"
          label={t("academyCollection.fields.month")}
          value={period}
          onChange={(event) => setPeriod(event.currentTarget.value || currentPeriod())}
        />
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={600}>{t("academyCollection.cards.progress")}</Text>
            {collectionQuery.isLoading ? (
              <Loader size="sm" />
            ) : (
              <>
                <Text size="xl" fw={700}>
                  {t("academyCollection.progressAmount", {
                    collected: formatMoney(summary?.collected_total),
                    expected: formatMoney(summary?.expected_total)
                  })}
                </Text>
                <Progress value={progressValue} />
                <Group gap="lg">
                  <Text size="sm" c="dimmed">
                    {t("academyCollection.fields.collectionRate")}: {collectionRate}%
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t("academyCollection.counts", {
                      due: summary?.due_count ?? 0,
                      paid: summary?.paid_count ?? 0,
                      unpaid: summary?.unpaid_count ?? 0
                    })}
                  </Text>
                </Group>
              </>
            )}
          </Stack>
        </Card>

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={600}>{t("academyCollection.cards.health")}</Text>
            {healthQuery.isLoading ? (
              <Loader size="sm" />
            ) : (
              <>
                <SimpleGrid cols={2}>
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {t("academyCollection.fields.activeStudents")}
                    </Text>
                    <Text fw={700}>{health?.active_students ?? 0}</Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {t("academyCollection.fields.monthlyFixedCost")}
                    </Text>
                    <Text fw={700}>{formatMoney(health?.monthly_fixed_cost)}</Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {t("academyCollection.fields.avgMonthlyTuition")}
                    </Text>
                    <Text fw={700}>{formatMoney(health?.avg_monthly_tuition_per_student)}</Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {t("academyCollection.fields.breakeven")}
                    </Text>
                    <Text fw={700}>
                      {healthHasGap
                        ? t("academyCollection.breakevenValue", { count: breakevenStudents })
                        : t("academyCollection.status.insufficientData")}
                    </Text>
                  </Stack>
                </SimpleGrid>
                <Badge color={healthHasGap && gap === 0 ? "green" : healthHasGap ? "red" : "gray"} variant="light">
                  {healthHasGap
                    ? gap === 0
                      ? t("academyCollection.status.costCovered")
                      : t("academyCollection.status.needMoreStudents", { count: gap })
                    : t("academyCollection.status.insufficientData")}
                </Badge>
              </>
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Stack>
          <Group justify="space-between">
            <Title order={3}>{t("academyCollection.sections.trend")}</Title>
            {trendQueries.some((query) => query.isLoading) ? <Loader size="sm" /> : null}
          </Group>
          <ScrollArea>
            <Table miw={640}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("academyCollection.fields.month")}</Table.Th>
                  <Table.Th>{t("academyCollection.fields.expected")}</Table.Th>
                  <Table.Th>{t("academyCollection.fields.collected")}</Table.Th>
                  <Table.Th>{t("academyCollection.fields.collectionRate")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {trendQueries.map((query, index) => {
                  const rowSummary = query.data?.summary;
                  const rate = formatPercent(rowSummary?.collection_rate);

                  return (
                    <Table.Tr key={trendPeriods[index]}>
                      <Table.Td>{trendPeriods[index]}</Table.Td>
                      <Table.Td>{query.isLoading ? t("academyCollection.loading") : formatMoney(rowSummary?.expected_total)}</Table.Td>
                      <Table.Td>{query.isLoading ? t("academyCollection.loading") : formatMoney(rowSummary?.collected_total)}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Progress value={Math.max(0, Math.min(100, rate))} w={140} />
                          <Text size="sm">{rate}%</Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Card>

      <Paper withBorder radius="md" p="md">
        <Tabs defaultValue="overdue">
          <Tabs.List>
            <Tabs.Tab value="overdue">{t("academyCollection.sections.overdue")}</Tabs.Tab>
            <Tabs.Tab value="current">{t("academyCollection.sections.currentRows")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overdue" pt="md">
            <Stack>
              <Group justify="space-between">
                <Title order={3}>{t("academyCollection.sections.overdue")}</Title>
                <Text size="sm" c="dimmed">
                  {t("academyCollection.totalOutstanding", {
                    amount: formatMoney(overdueQuery.data?.total_outstanding)
                  })}
                </Text>
              </Group>
              {overdueQuery.isLoading ? (
                <Loader size="sm" />
              ) : (
                <OverdueTable rows={overdueQuery.data?.rows ?? []} canManage={canManageEducation} />
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="current" pt="md">
            <Stack>
              <Title order={3}>{t("academyCollection.sections.currentRows")}</Title>
              {collectionQuery.isLoading ? (
                <Loader size="sm" />
              ) : (
                <CollectionRowsTable rows={collectionQuery.data?.rows ?? []} canManage={canManageEducation} />
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}
