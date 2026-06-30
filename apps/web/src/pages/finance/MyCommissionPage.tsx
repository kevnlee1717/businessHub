import { Alert, Badge, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getMyCommission, type MyCommissionStatus } from "../../api/myCommission";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

function displayName(name?: string | null, nameEn?: string | null) {
  if (!name && !nameEn) {
    return "-";
  }

  return nameEn && name ? `${name} / ${nameEn}` : (name ?? nameEn ?? "-");
}

function businessLabel(business?: { code?: string | null; name?: string | null; name_en?: string | null } | null) {
  if (!business) {
    return "-";
  }

  const name = displayName(business.name, business.name_en);
  return business.code ? `${business.code} · ${name}` : name;
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? String(value) : numberValue.toFixed(2);
}

function statusColor(status: MyCommissionStatus) {
  switch (status) {
    case "settled":
      return "green";
    case "pending":
      return "yellow";
    default:
      return "gray";
  }
}

export function MyCommissionPage() {
  const { t } = useTranslation();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const commissionQuery = useQuery({
    queryKey: ["finance", "my-commission"],
    queryFn: () => getMyCommission()
  });

  const entries = commissionQuery.data?.entries ?? [];
  // Totals are derived from the full personal commission list, so pagination is applied after fetching.
  const visibleEntries = entries.slice((page - 1) * pageSize, page * pageSize);
  const totals = entries.reduce(
    (acc, entry) => {
      const amount = Number(entry.amount_sgd);
      if (Number.isNaN(amount)) {
        return acc;
      }

      if (entry.status !== "void") {
        acc.total += amount;
      }
      if (entry.status === "settled") {
        acc.settled += amount;
      }
      if (entry.status === "pending") {
        acc.pending += amount;
      }
      return acc;
    },
    { total: 0, settled: 0, pending: 0 }
  );

  return (
    <Stack gap="lg">

      {commissionQuery.error ? (
        <Alert color="red" variant="light">
          {commissionQuery.error instanceof Error ? commissionQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <TotalCard label={t("myCommission.totals.total")} value={formatMoney(totals.total)} />
        <TotalCard label={t("myCommission.totals.settled")} value={formatMoney(totals.settled)} />
        <TotalCard label={t("myCommission.totals.pending")} value={formatMoney(totals.pending)} />
      </SimpleGrid>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={920} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("myCommission.fields.order")}</Table.Th>
                <Table.Th>{t("myCommission.fields.period")}</Table.Th>
                <Table.Th>{t("myCommission.fields.amount")}</Table.Th>
                <Table.Th>{t("myCommission.fields.status")}</Table.Th>
                <Table.Th>{t("myCommission.fields.inPayslip")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {commissionQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : visibleEntries.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("myCommission.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                visibleEntries.map((entry) => (
                  <Table.Tr key={`${entry.billing_id}-${entry.period}-${entry.created_at}`}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text>{businessLabel(entry.business)}</Text>
                        <Text size="xs" c="dimmed">
                          {entry.billing_id}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{entry.period}</Table.Td>
                    <Table.Td>{formatMoney(entry.amount_sgd)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(entry.status)} variant="light">
                        {t(`myCommission.status.${entry.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{entry.payslip_id ? t("common.yes") : t("common.no")}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <TablePagination
          total={entries.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Paper>
    </Stack>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text c="dimmed" size="sm">
        {label}
      </Text>
      <Text fw={700} size="xl">
        {value}
      </Text>
    </Paper>
  );
}
