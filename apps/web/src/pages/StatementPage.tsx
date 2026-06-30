import { Alert, Badge, Box, Button, Container, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { getStatement, type StatementStatus } from "../api/statement";
import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";

function displayName(name?: string | null, nameEn?: string | null) {
  if (!name && !nameEn) {
    return "-";
  }

  return nameEn && name ? `${name} / ${nameEn}` : (name ?? nameEn ?? "-");
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? String(value) : numberValue.toFixed(2);
}

function statusColor(status: StatementStatus) {
  switch (status) {
    case "settled":
      return "green";
    case "partial":
      return "yellow";
    case "pending":
      return "gray";
    default:
      return "gray";
  }
}

function settlementStatus(entry: { amount_sgd: string; amount_settled?: string | null; status: StatementStatus }) {
  if (entry.status === "void") {
    return "void";
  }

  const payable = Number(entry.amount_sgd);
  const settled = Number(entry.amount_settled ?? 0);
  if (settled <= 0) {
    return "pending";
  }
  if (settled < payable) {
    return "partial";
  }
  return "settled";
}

function businessLabel(entry: { business?: { code?: string | null; name?: string | null; name_en?: string | null } | null }) {
  if (!entry.business) {
    return "-";
  }

  const name = displayName(entry.business.name, entry.business.name_en);
  return entry.business.code ? `${entry.business.code} · ${name}` : name;
}

export function StatementPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const statementQuery = useQuery({
    queryKey: ["statement", token],
    queryFn: () => getStatement(token),
    retry: false
  });
  const { page, pageSize, setPage, setPageSize } = usePagination(10);

  useEffect(() => {
    setPage(1);
  }, [token, setPage]);

  if (statementQuery.isLoading) {
    return (
      <Box className="app-section" data-section="finance">
        <Container py="xl">
          <Group justify="center">
            <Loader />
          </Group>
        </Container>
      </Box>
    );
  }

  if (statementQuery.error) {
    const message =
      statementQuery.error instanceof ApiError && statementQuery.error.status === 404
        ? t("statement.notFound")
        : statementQuery.error instanceof Error
          ? statementQuery.error.message
          : t("common.unknown_error");

    return (
      <Box className="app-section" data-section="finance">
        <Container py="xl">
          <Alert color="red" variant="light">
            {message}
          </Alert>
        </Container>
      </Box>
    );
  }

  const statement = statementQuery.data;
  if (!statement) {
    return null;
  }

  const visibleEntries = statement.entries.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Box className="app-section" data-section="finance">
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Title order={2}>{displayName(statement.payee.name, statement.payee.name_en)}</Title>
              <Text c="dimmed">
                {displayName(statement.payee.role?.name, statement.payee.role?.name_en)}
                {statement.payee.contact ? ` · ${statement.payee.contact}` : ""}
              </Text>
            </Stack>
            <Button variant="light" onClick={() => window.print()}>
              {t("statement.print")}
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TotalCard label={t("statement.totals.total")} value={formatMoney(statement.totals.total)} />
            <TotalCard label={t("statement.totals.settled")} value={formatMoney(statement.totals.settled)} />
            <TotalCard label={t("statement.totals.outstanding")} value={formatMoney(statement.totals.outstanding)} />
          </SimpleGrid>

          <Paper withBorder radius="md">
            <ScrollArea>
              <Table miw={860} verticalSpacing="sm" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("statement.fields.business")}</Table.Th>
                    <Table.Th>{t("statement.fields.customer")}</Table.Th>
                    <Table.Th>{t("statement.fields.dealAt")}</Table.Th>
                    <Table.Th>{t("statement.fields.period")}</Table.Th>
                    <Table.Th>{t("statement.fields.stage")}</Table.Th>
                    <Table.Th>{t("statement.fields.payable")}</Table.Th>
                    <Table.Th>{t("statement.fields.settled")}</Table.Th>
                    <Table.Th>{t("statement.fields.outstanding")}</Table.Th>
                    <Table.Th>{t("statement.fields.status")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {statement.entries.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={9}>
                        <Text ta="center" c="dimmed" py="lg">
                          {t("statement.empty")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    visibleEntries.map((entry, index) => {
                      const status = settlementStatus(entry);

                      return (
                        <Table.Tr key={entry.id ?? `${entry.billing_id ?? "entry"}-${index}`}>
                          <Table.Td>{businessLabel(entry)}</Table.Td>
                          <Table.Td>{displayName(entry.customer?.name, entry.customer?.name_en)}</Table.Td>
                          <Table.Td>{formatDate(entry.billing?.deal_at)}</Table.Td>
                          <Table.Td>{entry.period ?? "-"}</Table.Td>
                          <Table.Td>{entry.note ?? "-"}</Table.Td>
                          <Table.Td>{formatMoney(entry.amount_sgd)}</Table.Td>
                          <Table.Td>{formatMoney(entry.amount_settled)}</Table.Td>
                          <Table.Td>{formatMoney(entry.outstanding)}</Table.Td>
                          <Table.Td>
                            <Badge color={statusColor(status)} variant="light">
                              {t(`statement.status.${status}`)}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <TablePagination total={statement.entries.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl">
        {value}
      </Text>
    </Paper>
  );
}
