import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { type CaseCommissionInput, type CommissionBasis, type CommissionEntryStatus } from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import {
  listCaseCommissions,
  recomputeCaseCommission,
  setCaseCommissions,
  type CaseCommission,
  type EffectiveExternalCommissionEntry,
  type EffectiveInternalCommissionEntry
} from "../api/caseCommissions";
import { listExternalParties, type ExternalParty } from "../api/externalParties";
import { type Employee } from "../api/hr";

type Props = {
  caseId: string;
  employees: Employee[];
  canManageCases: boolean;
};

type RuleDraft = {
  basis: CommissionBasis;
  value: number | null;
  external_party_id: string | null;
  note: string;
};

const basisOptions: { value: CommissionBasis; labelKey: string }[] = [
  { value: "percent", labelKey: "commissionType.percent" },
  { value: "fixed", labelKey: "commissionType.fixed" }
];

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function formatMoney(amount?: string | number | null) {
  return `SGD ${Number(amount ?? 0).toFixed(2)}`;
}

function statusColor(status: CommissionEntryStatus) {
  switch (status) {
    case "settled":
      return "green";
    case "void":
      return "gray";
    default:
      return "yellow";
  }
}

function ruleDraft(rule?: CaseCommission): RuleDraft {
  return {
    basis: rule?.basis ?? "percent",
    value: rule ? Number(rule.value) : null,
    external_party_id: rule?.external_party_id ?? null,
    note: rule?.note ?? ""
  };
}

function ruleValueLabel(basis: CommissionBasis, value: number | null) {
  if (value === null) {
    return "";
  }

  return basis === "percent" ? `${value}%` : formatMoney(value);
}

function InternalEntriesTable({
  entries,
  employeeById
}: {
  entries: EffectiveInternalCommissionEntry[];
  employeeById: Map<string, Employee>;
}) {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return <Text c="dimmed">{t("caseCommission.emptyEffective")}</Text>;
  }

  return (
    <Table withTableBorder withColumnBorders highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t("caseCommission.fields.payee")}</Table.Th>
          <Table.Th>{t("caseCommission.fields.period")}</Table.Th>
          <Table.Th>{t("caseCommission.fields.amount")}</Table.Th>
          <Table.Th>{t("caseCommission.fields.status")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map((entry) => {
          const employee = employeeById.get(entry.sales_id);
          return (
            <Table.Tr key={entry.id}>
              <Table.Td>{employee ? displayName(employee.name, employee.name_en) : entry.sales_id}</Table.Td>
              <Table.Td>{entry.period}</Table.Td>
              <Table.Td>{formatMoney(entry.effective_amount_sgd)}</Table.Td>
              <Table.Td>
                <Badge color={statusColor(entry.status)} variant="light">
                  {t(`commissionEntryStatus.${entry.status}`)}
                </Badge>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function ExternalEntriesTable({
  entries,
  externalPartyById
}: {
  entries: EffectiveExternalCommissionEntry[];
  externalPartyById: Map<string, ExternalParty>;
}) {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return <Text c="dimmed">{t("caseCommission.emptyEffective")}</Text>;
  }

  return (
    <Table withTableBorder withColumnBorders highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t("caseCommission.fields.payee")}</Table.Th>
          <Table.Th>{t("caseCommission.fields.period")}</Table.Th>
          <Table.Th>{t("caseCommission.fields.amount")}</Table.Th>
          <Table.Th>{t("caseCommission.fields.status")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map((entry) => {
          const party = externalPartyById.get(entry.payee_id);
          return (
            <Table.Tr key={entry.id}>
              <Table.Td>{party ? displayName(party.name, party.name_en) : entry.payee_id}</Table.Td>
              <Table.Td>{entry.period}</Table.Td>
              <Table.Td>{formatMoney(entry.amount_sgd)}</Table.Td>
              <Table.Td>
                <Badge color={statusColor(entry.status)} variant="light">
                  {t(`commissionEntryStatus.${entry.status}`)}
                </Badge>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

export function CaseCommissionPanel({ caseId, employees, canManageCases }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [internalDraft, setInternalDraft] = useState<RuleDraft>(ruleDraft());
  const [externalDraft, setExternalDraft] = useState<RuleDraft>(ruleDraft());
  const [formError, setFormError] = useState<string | null>(null);

  const commissionsQuery = useQuery({
    queryKey: ["cases", caseId, "commissions"],
    queryFn: () => listCaseCommissions(caseId)
  });
  const externalPartiesQuery = useQuery({
    queryKey: ["business-finance", "external-parties"],
    queryFn: () => listExternalParties()
  });

  const commissions = commissionsQuery.data?.commissions ?? [];
  const effective = commissionsQuery.data?.effective_commissions;
  const externalParties = externalPartiesQuery.data?.external_parties ?? [];
  const externalForbidden = externalPartiesQuery.error instanceof ApiError && externalPartiesQuery.error.status === 403;
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const externalPartyById = useMemo(
    () => new Map(externalParties.map((party) => [party.id, party] as const)),
    [externalParties]
  );
  const externalPartyOptions = externalParties.map((party) => ({
    value: party.id,
    label: displayName(party.name, party.name_en)
  }));
  const translatedBasisOptions = basisOptions.map((option) => ({
    value: option.value,
    label: t(option.labelKey)
  }));

  useEffect(() => {
    const internalRule = commissions.find((rule) => rule.target === "internal_sales");
    const externalRule = commissions.find((rule) => rule.target === "external_channel");
    setInternalDraft(ruleDraft(internalRule));
    setExternalDraft(ruleDraft(externalRule));
  }, [commissions]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const rules: CaseCommissionInput[] = [];
      const existingExternalRules = commissions.filter((rule) => rule.target === "external_channel");

      if (internalDraft.value !== null) {
        rules.push({
          target: "internal_sales",
          basis: internalDraft.basis,
          value: internalDraft.value,
          note: internalDraft.note.trim() || null
        });
      }

      if (externalForbidden) {
        rules.push(
          ...existingExternalRules.map((rule) => ({
            target: rule.target,
            party_id: rule.party_id,
            external_party_id: rule.external_party_id,
            basis: rule.basis,
            value: rule.value,
            note: rule.note
          }))
        );
      } else if (externalDraft.value !== null && externalDraft.external_party_id) {
        const selectedParty = externalPartyById.get(externalDraft.external_party_id);
        const existingRule = existingExternalRules[0];
        rules.push({
          target: "external_channel",
          party_id: selectedParty?.party_id ?? existingRule?.party_id ?? null,
          external_party_id: externalDraft.external_party_id,
          basis: externalDraft.basis,
          value: externalDraft.value,
          note: externalDraft.note.trim() || null
        });
      }

      return setCaseCommissions(caseId, rules);
    },
    onSuccess: async () => {
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cases", caseId, "commissions"] }),
        queryClient.invalidateQueries({ queryKey: ["finance", "commission"] }),
        queryClient.invalidateQueries({ queryKey: ["business-finance", "external-commission"] })
      ]);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : t("common.unknown_error"))
  });

  const recomputeMutation = useMutation({
    mutationFn: () => recomputeCaseCommission(caseId),
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["cases", caseId, "commissions"] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : t("common.unknown_error"))
  });

  const loadError =
    commissionsQuery.error ?? (externalForbidden ? null : externalPartiesQuery.error);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={3}>{t("caseCommission.title")}</Title>
            {commissionsQuery.isFetching ? <Loader size="sm" /> : null}
          </Stack>
          <Button
            variant="light"
            onClick={() => recomputeMutation.mutate()}
            loading={recomputeMutation.isPending}
            disabled={!canManageCases}
          >
            {t("caseCommission.recompute")}
          </Button>
        </Group>

        {loadError ? (
          <Alert color="red" variant="light">
            {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
          </Alert>
        ) : null}
        {formError ? <Alert color="red" variant="light">{formError}</Alert> : null}
        {externalForbidden ? (
          <Alert color="yellow" variant="light">
            {t("caseCommission.financePermissionRequired")}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Card withBorder radius="sm" p="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>{t("caseCommission.internalSales")}</Title>
                <Badge variant="light">{formatMoney(effective?.internal_sales.amount_sgd)}</Badge>
              </Group>
              <InternalEntriesTable
                entries={effective?.internal_sales.entries ?? []}
                employeeById={employeeById}
              />
            </Stack>
          </Card>

          <Card withBorder radius="sm" p="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>{t("caseCommission.externalChannel")}</Title>
                <Badge variant="light">{formatMoney(effective?.external_channel.amount_sgd)}</Badge>
              </Group>
              <ExternalEntriesTable
                entries={effective?.external_channel.entries ?? []}
                externalPartyById={externalPartyById}
              />
            </Stack>
          </Card>
        </SimpleGrid>

        <Card withBorder radius="sm" p="md">
          <Stack gap="md">
            <Title order={4}>{t("caseCommission.overrideTitle")}</Title>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Stack gap="sm">
                <Text fw={600}>{t("caseCommission.internalSales")}</Text>
                <Select
                  label={t("caseCommission.fields.basis")}
                  data={translatedBasisOptions}
                  value={internalDraft.basis}
                  onChange={(value) =>
                    setInternalDraft((current) => ({ ...current, basis: (value as CommissionBasis | null) ?? "percent" }))
                  }
                  disabled={!canManageCases}
                />
                <NumberInput
                  label={t("caseCommission.fields.value")}
                  value={internalDraft.value ?? ""}
                  onChange={(value) =>
                    setInternalDraft((current) => ({
                      ...current,
                      value: typeof value === "number" ? value : null
                    }))
                  }
                  min={0}
                  decimalScale={2}
                  {...(internalDraft.basis === "percent" ? { suffix: "%" } : {})}
                  disabled={!canManageCases}
                />
                <TextInput
                  label={t("caseCommission.fields.note")}
                  value={internalDraft.note}
                  onChange={(event) =>
                    setInternalDraft((current) => ({ ...current, note: event.currentTarget.value }))
                  }
                  disabled={!canManageCases}
                />
                <Text size="sm" c="dimmed">
                  {ruleValueLabel(internalDraft.basis, internalDraft.value)}
                </Text>
              </Stack>

              <Stack gap="sm">
                <Text fw={600}>{t("caseCommission.externalChannel")}</Text>
                <Select
                  label={t("caseCommission.fields.externalParty")}
                  data={externalPartyOptions}
                  value={externalDraft.external_party_id}
                  onChange={(value) => setExternalDraft((current) => ({ ...current, external_party_id: value }))}
                  disabled={!canManageCases || externalForbidden}
                  searchable
                  clearable
                />
                <Select
                  label={t("caseCommission.fields.basis")}
                  data={translatedBasisOptions}
                  value={externalDraft.basis}
                  onChange={(value) =>
                    setExternalDraft((current) => ({ ...current, basis: (value as CommissionBasis | null) ?? "percent" }))
                  }
                  disabled={!canManageCases || externalForbidden}
                />
                <NumberInput
                  label={t("caseCommission.fields.value")}
                  value={externalDraft.value ?? ""}
                  onChange={(value) =>
                    setExternalDraft((current) => ({
                      ...current,
                      value: typeof value === "number" ? value : null
                    }))
                  }
                  min={0}
                  decimalScale={2}
                  {...(externalDraft.basis === "percent" ? { suffix: "%" } : {})}
                  disabled={!canManageCases || externalForbidden}
                />
                <TextInput
                  label={t("caseCommission.fields.note")}
                  value={externalDraft.note}
                  onChange={(event) =>
                    setExternalDraft((current) => ({ ...current, note: event.currentTarget.value }))
                  }
                  disabled={!canManageCases || externalForbidden}
                />
                <Text size="sm" c="dimmed">
                  {ruleValueLabel(externalDraft.basis, externalDraft.value)}
                </Text>
              </Stack>
            </SimpleGrid>
            <Group justify="flex-end">
              <Button
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
                disabled={!canManageCases}
              >
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Paper>
  );
}
