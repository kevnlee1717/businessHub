import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { type Currency, type LedgerDirection } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listCompanies } from "../../api/hr";
import {
  getReconcile,
  importStatementLines,
  listBankAccounts,
  matchReconcile,
  unmatchReconcile,
  type BankStatementLine,
  type LedgerEntry,
  type ReconcileSuggestion
} from "../../api/ledger";

function companyLabel(company: { name: string; name_en?: string | null }) {
  return company.name_en ? `${company.name} / ${company.name_en}` : company.name;
}

function displayDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function displayMoney(amount?: string | null, currency?: string | null) {
  return `${Number(amount ?? 0).toFixed(2)} ${currency ?? ""}`.trim();
}

function parseDirection(value: string): LedgerDirection | null {
  const normalized = value.trim().toLowerCase();
  if (["in", "收入", "收", "入"].includes(normalized)) return "in";
  if (["out", "支出", "付", "付款", "出"].includes(normalized)) return "out";
  return null;
}

function parseStatementLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes(",") ? line.split(",") : line.split(/\s+/);
      const [date, directionText, amountText, ...descriptionParts] = parts.map((part) => part.trim());
      const direction = parseDirection(directionText ?? "");
      const amount = Number(amountText);
      if (!date || !direction || Number.isNaN(amount)) {
        throw new Error("statement_parse_failed");
      }
      return {
        occurred_at: new Date(date).toISOString(),
        direction,
        amount,
        currency: "SGD" as Currency,
        description: descriptionParts.join(line.includes(",") ? "," : " ") || null
      };
    });
}

function directionColor(direction: LedgerDirection) {
  return direction === "in" ? "green" : "red";
}

function isZero(value: number) {
  return Math.abs(value) < 0.005;
}

export function ReconcilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statementText, setStatementText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const companiesQuery = useQuery({ queryKey: ["hr", "companies"], queryFn: listCompanies });
  const accountsQuery = useQuery({
    queryKey: ["finance", "bank-accounts", companyId],
    queryFn: () => listBankAccounts({ company_id: companyId }),
    enabled: Boolean(companyId)
  });
  const reconcileQuery = useQuery({
    queryKey: ["finance", "reconcile", bankAccountId, from, to],
    queryFn: () => getReconcile(bankAccountId ?? "", { from, to }),
    enabled: Boolean(bankAccountId)
  });

  const companies = companiesQuery.data?.companies ?? [];
  const accounts = accountsQuery.data?.bank_accounts ?? [];
  const result = reconcileQuery.data;

  useEffect(() => {
    if (!companyId && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  useEffect(() => {
    setBankAccountId(accounts[0]?.id ?? null);
  }, [companyId, accounts]);

  const companyOptions = companies.map((company) => ({ value: company.id, label: companyLabel(company) }));
  const accountOptions = accounts.map((account) => ({ value: account.id, label: account.name }));
  const ledgerById = useMemo(
    () => new Map((result?.system_unreconciled ?? []).map((entry) => [entry.id, entry])),
    [result?.system_unreconciled]
  );
  const lineById = useMemo(
    () => new Map((result?.statement_unmatched ?? []).map((line) => [line.id, line])),
    [result?.statement_unmatched]
  );

  const importMutation = useMutation({
    mutationFn: () => {
      if (!bankAccountId) throw new Error("account_required");
      return importStatementLines(bankAccountId, { lines: parseStatementLines(statementText) });
    },
    onSuccess: async () => {
      setStatementText("");
      setImportError(null);
      await queryClient.invalidateQueries({ queryKey: ["finance", "reconcile"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "unknown_error";
      const key = `finance.errors.${message}`;
      const translated = t(key);
      setImportError(translated === key ? message : translated);
    }
  });

  const matchMutation = useMutation({
    mutationFn: matchReconcile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "reconcile"] })
  });

  const unmatchMutation = useMutation({
    mutationFn: unmatchReconcile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "reconcile"] })
  });

  const totals = result?.totals;
  const inDiff = Number(totals?.system_in ?? 0) - Number(totals?.statement_in ?? 0);
  const outDiff = Number(totals?.system_out ?? 0) - Number(totals?.statement_out ?? 0);
  const balanced = isZero(inDiff) && isZero(outDiff);

  function LedgerMiniTable({ rows }: { rows: LedgerEntry[] }) {
    return (
      <ScrollArea>
        <Table withTableBorder withColumnBorders highlightOnHover miw={560}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("finance.fields.date")}</Table.Th>
              <Table.Th>{t("finance.fields.direction")}</Table.Th>
              <Table.Th>{t("finance.fields.amount")}</Table.Th>
              <Table.Th>{t("finance.fields.counterparty")}</Table.Th>
              <Table.Th>{t("common.actions")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{displayDate(row.occurred_at)}</Table.Td>
                <Table.Td>
                  <Badge color={directionColor(row.direction)}>{t(`finance.direction.${row.direction}`)}</Badge>
                </Table.Td>
                <Table.Td>{displayMoney(row.amount, row.currency)}</Table.Td>
                <Table.Td>{row.counterparty || "-"}</Table.Td>
                <Table.Td>
                  {row.statement_line_id ? (
                    <Button size="xs" variant="light" onClick={() => unmatchMutation.mutate(row.id)}>
                      {t("finance.reconcile.unmatch")}
                    </Button>
                  ) : (
                    "-"
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="md">{t("finance.reconcile.empty")}</Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    );
  }

  function StatementMiniTable({ rows }: { rows: BankStatementLine[] }) {
    return (
      <ScrollArea>
        <Table withTableBorder withColumnBorders highlightOnHover miw={520}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("finance.fields.date")}</Table.Th>
              <Table.Th>{t("finance.fields.direction")}</Table.Th>
              <Table.Th>{t("finance.fields.amount")}</Table.Th>
              <Table.Th>{t("finance.fields.description")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{displayDate(row.occurred_at)}</Table.Td>
                <Table.Td>
                  <Badge color={directionColor(row.direction)}>{t(`finance.direction.${row.direction}`)}</Badge>
                </Table.Td>
                <Table.Td>{displayMoney(row.amount, row.currency)}</Table.Td>
                <Table.Td>{row.description || "-"}</Table.Td>
              </Table.Tr>
            ))}
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" ta="center" py="md">{t("finance.reconcile.empty")}</Text>
                </Table.Td>
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    );
  }

  function SuggestionRow({ suggestion }: { suggestion: ReconcileSuggestion }) {
    const ledger = ledgerById.get(suggestion.ledger_entry_id);
    const line = lineById.get(suggestion.statement_line_id);

    return (
      <Table.Tr>
        <Table.Td>{ledger ? `${displayDate(ledger.occurred_at)} ${displayMoney(ledger.amount, ledger.currency)}` : suggestion.ledger_entry_id}</Table.Td>
        <Table.Td>{line ? `${displayDate(line.occurred_at)} ${line.description ?? ""}` : suggestion.statement_line_id}</Table.Td>
        <Table.Td>{Number(suggestion.amount).toFixed(2)}</Table.Td>
        <Table.Td>{suggestion.day_diff}</Table.Td>
        <Table.Td>
          <Button size="xs" loading={matchMutation.isPending} onClick={() => matchMutation.mutate(suggestion)}>
            {t("finance.reconcile.confirmMatch")}
          </Button>
        </Table.Td>
      </Table.Tr>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={2}>{t("finance.reconcile.title")}</Title>

      <Paper withBorder p="md">
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          <Select label={t("finance.fields.company")} data={companyOptions} value={companyId} onChange={setCompanyId} searchable />
          <Select
            label={t("finance.fields.bankAccount")}
            data={accountOptions}
            value={bankAccountId}
            onChange={setBankAccountId}
            searchable
          />
          <TextInput label={t("finance.fields.from")} type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
          <TextInput label={t("finance.fields.to")} type="date" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
        </SimpleGrid>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Paper withBorder p="md">
          <Group justify="space-between">
            <Text fw={600}>{t("finance.reconcile.systemVsStatement")}</Text>
            <Badge color={balanced ? "green" : "yellow"}>
              {balanced ? t("finance.reconcile.balanced") : t("finance.reconcile.unbalanced")}
            </Badge>
          </Group>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">{t("finance.reconcile.inCompare")}</Text>
          <Text>{totals?.system_in ?? "0.00"} / {totals?.statement_in ?? "0.00"} · {t("finance.reconcile.diff")} {inDiff.toFixed(2)}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">{t("finance.reconcile.outCompare")}</Text>
          <Text>{totals?.system_out ?? "0.00"} / {totals?.statement_out ?? "0.00"} · {t("finance.reconcile.diff")} {outDiff.toFixed(2)}</Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={4}>{t("finance.reconcile.importTitle")}</Title>
          {importError ? <Alert color="red">{importError}</Alert> : null}
          <Textarea
            minRows={5}
            placeholder={t("finance.reconcile.importPlaceholder")}
            value={statementText}
            onChange={(event) => setStatementText(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              onClick={() => importMutation.mutate()}
              loading={importMutation.isPending}
              disabled={!bankAccountId || !statementText.trim()}
            >
              {t("finance.reconcile.import")}
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={4}>{t("finance.reconcile.suggestions")}</Title>
          <ScrollArea>
            <Table withTableBorder withColumnBorders highlightOnHover miw={820}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("finance.reconcile.systemEntry")}</Table.Th>
                  <Table.Th>{t("finance.reconcile.statementLine")}</Table.Th>
                  <Table.Th>{t("finance.fields.amount")}</Table.Th>
                  <Table.Th>{t("finance.reconcile.dayDiff")}</Table.Th>
                  <Table.Th>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(result?.suggestions ?? []).map((suggestion) => (
                  <SuggestionRow
                    key={`${suggestion.ledger_entry_id}-${suggestion.statement_line_id}`}
                    suggestion={suggestion}
                  />
                ))}
                {(result?.suggestions ?? []).length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center" py="md">{t("finance.reconcile.noSuggestions")}</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Paper>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Title order={4}>{t("finance.reconcile.systemUnreconciled")}</Title>
            <LedgerMiniTable rows={result?.system_unreconciled ?? []} />
          </Stack>
        </Paper>
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Title order={4}>{t("finance.reconcile.statementUnmatched")}</Title>
            <StatementMiniTable rows={result?.statement_unmatched ?? []} />
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
