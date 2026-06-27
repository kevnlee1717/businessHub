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
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  commissionEntryStatuses,
  commissionRecurrences,
  commissionTypes,
  type CommissionEntryStatus,
  type CommissionRecurrence,
  type CommissionType
} from "@bh/shared";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listBusinesses, type Business } from "../../api/businessSchemes";
import {
  createCommissionEntry,
  createSalesAssignment,
  deleteSalesAssignment,
  listCommissionEntries,
  listSalesAssignments,
  recomputeCommission,
  updateCommissionEntry,
  updateSalesAssignment,
  type CommissionEntry,
  type SalesBusinessAssignment
} from "../../api/commission";
import {
  getResolvedCompensation,
  listCompanies,
  listEmployees,
  type Company,
  type Employee
} from "../../api/hr";

type AssignmentDraft = {
  commission_type: CommissionType | null;
  commission_value: number | null;
  active: boolean;
};

type EntryDraft = {
  amount_sgd: number | null;
  period: string;
};

type ManualEntryDraft = {
  sales_id: string | null;
  billing_id: string;
  business_id: string | null;
  period: string;
  recurrence: CommissionRecurrence;
  amount_sgd: number | null;
  note: string;
};

const salesQueryKey = ["hr", "employees"] as const;
const assignmentsQueryKey = ["finance", "sales-assignments"] as const;
const entriesQueryKey = ["finance", "commission-entries"] as const;

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? String(value) : numberValue.toFixed(2);
}

function moneyToNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function toNumberOrNull(value: string | number) {
  return typeof value === "number" ? value : null;
}

function businessLabel(business?: Pick<Business, "code" | "name" | "name_en"> | null) {
  if (!business) {
    return "-";
  }

  const name = displayName(business.name, business.name_en);
  return business.code ? `${business.code} · ${name}` : name;
}

function statusColor(status: CommissionEntryStatus) {
  switch (status) {
    case "pending":
      return "yellow";
    case "settled":
      return "green";
    case "void":
      return "gray";
    default:
      return "gray";
  }
}

function assignmentDraftFrom(assignment: SalesBusinessAssignment): AssignmentDraft {
  return {
    commission_type: assignment.commission_type ?? null,
    commission_value: moneyToNumber(assignment.commission_value),
    active: assignment.active
  };
}

function entryDraftFrom(entry: CommissionEntry): EntryDraft {
  return {
    amount_sgd: moneyToNumber(entry.amount_sgd),
    period: entry.period
  };
}

function getManualEntryDefaults(selectedSalesId: string | null, period: string): ManualEntryDraft {
  return {
    sales_id: selectedSalesId,
    billing_id: "",
    business_id: null,
    period,
    recurrence: "one_time",
    amount_sgd: null,
    note: ""
  };
}

export function SalesCommissionPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedSalesId, setSelectedSalesId] = useState<string | null>(null);
  const [addBusinessId, setAddBusinessId] = useState<string | null>(null);
  const [addCommissionType, setAddCommissionType] = useState<CommissionType | null>(null);
  const [addCommissionValue, setAddCommissionValue] = useState<number | null>(null);
  const [periodFilter, setPeriodFilter] = useState("");
  const [entrySalesFilter, setEntrySalesFilter] = useState<string | null>(null);
  const [entryBusinessFilter, setEntryBusinessFilter] = useState<string | null>(null);
  const [entryStatusFilter, setEntryStatusFilter] = useState<CommissionEntryStatus | null>(null);
  const [recomputeBillingId, setRecomputeBillingId] = useState("");
  const [manualOpened, setManualOpened] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualEntryDraft>(() => getManualEntryDefaults(null, ""));
  const [formError, setFormError] = useState<string | null>(null);

  const employeesQuery = useQuery({
    queryKey: salesQueryKey,
    queryFn: listEmployees
  });
  const companiesQuery = useQuery({
    queryKey: ["hr", "companies"],
    queryFn: listCompanies
  });
  const businessesQuery = useQuery({
    queryKey: ["business-finance", "businesses"],
    queryFn: () => listBusinesses()
  });
  const assignmentsQuery = useQuery({
    queryKey: [...assignmentsQueryKey, selectedSalesId],
    queryFn: () => listSalesAssignments(selectedSalesId ?? ""),
    enabled: Boolean(selectedSalesId)
  });
  const entriesQuery = useQuery({
    queryKey: [
      ...entriesQueryKey,
      entrySalesFilter,
      periodFilter.trim(),
      entryBusinessFilter,
      entryStatusFilter
    ],
    queryFn: () =>
      listCommissionEntries({
        sales_id: entrySalesFilter,
        period: periodFilter.trim() || null,
        business_id: entryBusinessFilter,
        status: entryStatusFilter
      })
  });

  const employees = employeesQuery.data?.employees ?? [];
  const salesEmployees = employees.filter((employee) => employee.role === "sales");
  const companies = companiesQuery.data?.companies ?? [];
  const businesses = businessesQuery.data?.businesses ?? [];
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const entries = entriesQuery.data?.entries ?? [];
  const totals = entriesQuery.data?.totals ?? {};
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const businessById = useMemo(() => new Map(businesses.map((business) => [business.id, business])), [businesses]);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const assignmentBusinessIds = new Set(assignments.map((assignment) => assignment.business_id));

  const compensationQueries = useQueries({
    queries: salesEmployees.map((employee) => ({
      queryKey: ["hr", "employee-compensation-resolved", employee.id],
      queryFn: () => getResolvedCompensation(employee.id),
      staleTime: 60_000
    }))
  });
  const baseSalaryByEmployeeId = useMemo(() => {
    const map = new Map<string, string | number | null>();
    salesEmployees.forEach((employee, index) => {
      map.set(employee.id, compensationQueries[index]?.data?.compensation.base_salary.value ?? null);
    });
    return map;
  }, [compensationQueries, salesEmployees]);

  const selectedSales = selectedSalesId ? employeeById.get(selectedSalesId) : null;
  const selectedCompany = selectedSales?.company_id ? companyById.get(selectedSales.company_id) : null;
  const selectedBaseSalary = selectedSalesId ? baseSalaryByEmployeeId.get(selectedSalesId) : null;
  const loadError =
    employeesQuery.error ??
    companiesQuery.error ??
    businessesQuery.error ??
    assignmentsQuery.error ??
    entriesQuery.error;

  const salesOptions = salesEmployees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const businessOptions = businesses.map((business) => ({
    value: business.id,
    label: businessLabel(business)
  }));
  const availableBusinessOptions = businessOptions.filter((option) => !assignmentBusinessIds.has(option.value));
  const commissionTypeOptions = commissionTypes.map((type) => ({
    value: type,
    label: t(`commissionType.${type}`)
  }));
  const statusOptions = commissionEntryStatuses.map((status) => ({
    value: status,
    label: t(`commissionEntryStatus.${status}`)
  }));
  const recurrenceOptions = commissionRecurrences.map((recurrence) => ({
    value: recurrence,
    label: t(`commissionRecurrence.${recurrence}`)
  }));

  const createAssignmentMutation = useMutation({
    mutationFn: createSalesAssignment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
      setAddBusinessId(null);
      setAddCommissionType(null);
      setAddCommissionValue(null);
    }
  });
  const updateAssignmentMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: AssignmentDraft }) =>
      updateSalesAssignment(id, {
        commission_type: draft.commission_type,
        commission_value: draft.commission_value,
        active: draft.active
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
    }
  });
  const deleteAssignmentMutation = useMutation({
    mutationFn: deleteSalesAssignment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
    }
  });
  const updateEntryMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: EntryDraft }) =>
      updateCommissionEntry(id, {
        amount_sgd: draft.amount_sgd ?? undefined,
        period: draft.period
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entriesQueryKey });
    }
  });
  const voidEntryMutation = useMutation({
    mutationFn: (id: string) => updateCommissionEntry(id, { status: "void" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entriesQueryKey });
    }
  });
  const recomputeMutation = useMutation({
    mutationFn: recomputeCommission,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entriesQueryKey });
      setRecomputeBillingId("");
    }
  });
  const createEntryMutation = useMutation({
    mutationFn: createCommissionEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entriesQueryKey });
      closeManualModal();
    }
  });

  async function handleAddAssignment() {
    if (!selectedSalesId || !addBusinessId) {
      return;
    }

    setFormError(null);
    try {
      await createAssignmentMutation.mutateAsync({
        sales_id: selectedSalesId,
        business_id: addBusinessId,
        commission_type: addCommissionType,
        commission_value: addCommissionValue,
        active: true
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function handleDeleteAssignment(assignment: SalesBusinessAssignment) {
    if (!window.confirm(t("commission.confirmDeleteAssignment", { business: businessLabel(assignment.business) }))) {
      return;
    }

    await deleteAssignmentMutation.mutateAsync(assignment.id);
  }

  async function handleRecompute() {
    const billingId = recomputeBillingId.trim();
    if (!billingId) {
      return;
    }

    await recomputeMutation.mutateAsync({ billing_id: billingId });
  }

  function openManualModal() {
    setManualDraft(getManualEntryDefaults(entrySalesFilter ?? selectedSalesId, periodFilter.trim()));
    setManualOpened(true);
  }

  function closeManualModal() {
    setManualOpened(false);
    setManualDraft(getManualEntryDefaults(null, ""));
    setFormError(null);
  }

  async function handleCreateManualEntry() {
    if (!manualDraft.sales_id || !manualDraft.billing_id.trim() || !manualDraft.period.trim() || manualDraft.amount_sgd === null) {
      return;
    }

    setFormError(null);
    try {
      await createEntryMutation.mutateAsync({
        sales_id: manualDraft.sales_id,
        billing_id: manualDraft.billing_id.trim(),
        business_id: manualDraft.business_id,
        period: manualDraft.period.trim(),
        recurrence: manualDraft.recurrence,
        amount_sgd: manualDraft.amount_sgd,
        note: manualDraft.note.trim() || null
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="lg">
      <Title order={2}>{t("commission.title")}</Title>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Tabs defaultValue="assignments">
        <Tabs.List>
          <Tabs.Tab value="assignments">{t("commission.tabs.assignments")}</Tabs.Tab>
          <Tabs.Tab value="ledger">{t("commission.tabs.ledger")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="assignments" pt="md">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            <Paper withBorder radius="md" p="md">
              <Stack gap="md">
                <Title order={3}>{t("commission.sales.title")}</Title>
                <ScrollArea>
                  <Table miw={620} verticalSpacing="sm" striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("commission.fields.sales")}</Table.Th>
                        <Table.Th>{t("commission.fields.company")}</Table.Th>
                        <Table.Th>{t("commission.fields.baseSalary")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {employeesQuery.isLoading || companiesQuery.isLoading ? (
                        <Table.Tr>
                          <Table.Td colSpan={3}>
                            <Group justify="center" py="lg">
                              <Loader size="sm" />
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ) : salesEmployees.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={3}>
                            <Text ta="center" c="dimmed" py="lg">
                              {t("commission.sales.empty")}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        salesEmployees.map((employee) => (
                          <Table.Tr
                            key={employee.id}
                            onClick={() => setSelectedSalesId(employee.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <Table.Td>
                              <Text fw={selectedSalesId === employee.id ? 700 : 400}>
                                {displayName(employee.name, employee.name_en)}
                              </Text>
                            </Table.Td>
                            <Table.Td>{companyName(companyById, employee.company_id)}</Table.Td>
                            <Table.Td>{formatMoney(baseSalaryByEmployeeId.get(employee.id))}</Table.Td>
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
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Title order={3}>{t("commission.assignments.title")}</Title>
                    {selectedSales ? (
                      <Text size="sm" c="dimmed">
                        {displayName(selectedSales.name, selectedSales.name_en)} ·{" "}
                        {selectedCompany ? displayName(selectedCompany.name, selectedCompany.name_en) : "-"} ·{" "}
                        {t("commission.fields.baseSalary")} {formatMoney(selectedBaseSalary)}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">{t("commission.assignments.selectSales")}</Text>
                    )}
                  </Stack>
                </Group>

                {formError ? (
                  <Alert color="red" variant="light">
                    {formError}
                  </Alert>
                ) : null}

                {selectedSalesId ? (
                  <>
                    <Group align="flex-end" grow>
                      <Select
                        label={t("commission.fields.business")}
                        data={availableBusinessOptions}
                        value={addBusinessId}
                        onChange={setAddBusinessId}
                        searchable
                        clearable
                      />
                      <Select
                        label={t("commission.fields.overrideType")}
                        data={commissionTypeOptions}
                        value={addCommissionType}
                        onChange={(value) => setAddCommissionType(value as CommissionType | null)}
                        clearable
                      />
                      <NumberInput
                        label={t("commission.fields.overrideValue")}
                        value={addCommissionValue ?? ""}
                        onChange={(value) => setAddCommissionValue(toNumberOrNull(value))}
                        min={0}
                        decimalScale={2}
                      />
                      <Button
                        onClick={() => void handleAddAssignment()}
                        loading={createAssignmentMutation.isPending}
                        disabled={!addBusinessId}
                      >
                        {t("commission.assignments.add")}
                      </Button>
                    </Group>

                    <ScrollArea>
                      <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t("commission.fields.business")}</Table.Th>
                            <Table.Th>{t("commission.fields.overrideType")}</Table.Th>
                            <Table.Th>{t("commission.fields.overrideValue")}</Table.Th>
                            <Table.Th>{t("commission.fields.active")}</Table.Th>
                            <Table.Th>{t("common.actions")}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {assignmentsQuery.isLoading ? (
                            <Table.Tr>
                              <Table.Td colSpan={5}>
                                <Group justify="center" py="lg">
                                  <Loader size="sm" />
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ) : assignments.length === 0 ? (
                            <Table.Tr>
                              <Table.Td colSpan={5}>
                                <Text ta="center" c="dimmed" py="lg">
                                  {t("commission.assignments.empty")}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            assignments.map((assignment) => (
                              <AssignmentRow
                                key={assignment.id}
                                assignment={assignment}
                                commissionTypeOptions={commissionTypeOptions}
                                onSave={(draft) =>
                                  updateAssignmentMutation.mutateAsync({ id: assignment.id, draft })
                                }
                                onDelete={() => handleDeleteAssignment(assignment)}
                                saving={updateAssignmentMutation.isPending}
                                deleting={deleteAssignmentMutation.isPending}
                              />
                            ))
                          )}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </>
                ) : null}
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="ledger" pt="md">
          <Stack gap="md">
            <Paper withBorder radius="md" p="md">
              <Stack gap="md">
                <Group align="flex-end">
                  <Select
                    label={t("commission.fields.sales")}
                    data={salesOptions}
                    value={entrySalesFilter}
                    onChange={setEntrySalesFilter}
                    searchable
                    clearable
                  />
                  <TextInput
                    label={t("commission.fields.period")}
                    placeholder="YYYY-MM"
                    value={periodFilter}
                    onChange={(event) => setPeriodFilter(event.currentTarget.value)}
                  />
                  <Select
                    label={t("commission.fields.business")}
                    data={businessOptions}
                    value={entryBusinessFilter}
                    onChange={setEntryBusinessFilter}
                    searchable
                    clearable
                  />
                  <Select
                    label={t("commission.fields.status")}
                    data={statusOptions}
                    value={entryStatusFilter}
                    onChange={(value) => setEntryStatusFilter(value as CommissionEntryStatus | null)}
                    clearable
                  />
                </Group>
                <Group justify="space-between" align="flex-end">
                  <Group>
                    <Badge color="yellow" variant="light">
                      {t("commission.totals.pending")}: {formatMoney(totals.pending)}
                    </Badge>
                    <Badge color="green" variant="light">
                      {t("commission.totals.settled")}: {formatMoney(totals.settled)}
                    </Badge>
                    <Badge color="gray" variant="light">
                      {t("commission.totals.void")}: {formatMoney(totals.void)}
                    </Badge>
                  </Group>
                  <Group align="flex-end">
                    <TextInput
                      label={t("commission.fields.billingId")}
                      value={recomputeBillingId}
                      onChange={(event) => setRecomputeBillingId(event.currentTarget.value)}
                    />
                    <Button
                      variant="light"
                      onClick={() => void handleRecompute()}
                      loading={recomputeMutation.isPending}
                      disabled={!recomputeBillingId.trim()}
                    >
                      {t("commission.recompute")}
                    </Button>
                    <Button onClick={openManualModal}>{t("commission.manualAdd")}</Button>
                  </Group>
                </Group>
              </Stack>
            </Paper>

            {recomputeMutation.error ? (
              <Alert color="red" variant="light">
                {recomputeMutation.error instanceof Error ? recomputeMutation.error.message : t("common.unknown_error")}
              </Alert>
            ) : null}

            <Paper withBorder radius="md">
              <ScrollArea>
                <Table miw={1180} verticalSpacing="sm" striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("commission.fields.sales")}</Table.Th>
                      <Table.Th>{t("commission.fields.period")}</Table.Th>
                      <Table.Th>{t("commission.fields.billingId")}</Table.Th>
                      <Table.Th>{t("commission.fields.business")}</Table.Th>
                      <Table.Th>{t("commission.fields.recurrence")}</Table.Th>
                      <Table.Th>{t("commission.fields.amountSgd")}</Table.Th>
                      <Table.Th>{t("commission.fields.status")}</Table.Th>
                      <Table.Th>{t("commission.fields.payslip")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {entriesQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={9}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : entries.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={9}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("commission.ledger.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      entries.map((entry) => (
                        <CommissionEntryRow
                          key={entry.id}
                          entry={entry}
                          sales={employeeById.get(entry.sales_id)}
                          business={entry.business ?? businessById.get(entry.business_id ?? "")}
                          onSave={(draft) => updateEntryMutation.mutateAsync({ id: entry.id, draft })}
                          onVoid={() => voidEntryMutation.mutateAsync(entry.id)}
                          saving={updateEntryMutation.isPending}
                          voiding={voidEntryMutation.isPending}
                        />
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Modal opened={manualOpened} onClose={closeManualModal} title={t("commission.manualAdd")} size="lg">
        <Stack gap="md">
          {formError ? (
            <Alert color="red" variant="light">
              {formError}
            </Alert>
          ) : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label={t("commission.fields.sales")}
              data={salesOptions}
              value={manualDraft.sales_id}
              onChange={(value) => setManualDraft((draft) => ({ ...draft, sales_id: value }))}
              searchable
            />
            <TextInput
              label={t("commission.fields.billingId")}
              value={manualDraft.billing_id}
              onChange={(event) => setManualDraft((draft) => ({ ...draft, billing_id: event.currentTarget.value }))}
            />
            <Select
              label={t("commission.fields.business")}
              data={businessOptions}
              value={manualDraft.business_id}
              onChange={(value) => setManualDraft((draft) => ({ ...draft, business_id: value }))}
              searchable
              clearable
            />
            <TextInput
              label={t("commission.fields.period")}
              placeholder="YYYY-MM"
              value={manualDraft.period}
              onChange={(event) => setManualDraft((draft) => ({ ...draft, period: event.currentTarget.value }))}
            />
            <Select
              label={t("commission.fields.recurrence")}
              data={recurrenceOptions}
              value={manualDraft.recurrence}
              onChange={(value) =>
                setManualDraft((draft) => ({
                  ...draft,
                  recurrence: (value as CommissionRecurrence | null) ?? "one_time"
                }))
              }
            />
            <NumberInput
              label={t("commission.fields.amountSgd")}
              value={manualDraft.amount_sgd ?? ""}
              onChange={(value) => setManualDraft((draft) => ({ ...draft, amount_sgd: toNumberOrNull(value) }))}
              min={0}
              decimalScale={2}
            />
          </SimpleGrid>
          <TextInput
            label={t("commission.fields.note")}
            value={manualDraft.note}
            onChange={(event) => setManualDraft((draft) => ({ ...draft, note: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeManualModal}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void handleCreateManualEntry()}
              loading={createEntryMutation.isPending}
              disabled={
                !manualDraft.sales_id ||
                !manualDraft.billing_id.trim() ||
                !manualDraft.period.trim() ||
                manualDraft.amount_sgd === null
              }
            >
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function companyName(companyById: Map<string, Company>, companyId?: string | null) {
  if (!companyId) {
    return "-";
  }

  const company = companyById.get(companyId);
  return company ? displayName(company.name, company.name_en) : companyId;
}

function AssignmentRow({
  assignment,
  commissionTypeOptions,
  onSave,
  onDelete,
  saving,
  deleting
}: {
  assignment: SalesBusinessAssignment;
  commissionTypeOptions: { value: string; label: string }[];
  onSave: (draft: AssignmentDraft) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  saving: boolean;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AssignmentDraft>(() => assignmentDraftFrom(assignment));

  return (
    <Table.Tr>
      <Table.Td>{businessLabel(assignment.business)}</Table.Td>
      <Table.Td>
        <Select
          data={commissionTypeOptions}
          value={draft.commission_type}
          onChange={(value) => setDraft((current) => ({ ...current, commission_type: value as CommissionType | null }))}
          clearable
          placeholder={t("commission.useScheme")}
        />
      </Table.Td>
      <Table.Td>
        <NumberInput
          value={draft.commission_value ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, commission_value: toNumberOrNull(value) }))}
          min={0}
          decimalScale={2}
          placeholder={t("commission.useScheme")}
        />
      </Table.Td>
      <Table.Td>
        <Switch
          checked={draft.active}
          onChange={(event) => setDraft((current) => ({ ...current, active: event.currentTarget.checked }))}
        />
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="light" onClick={() => void onSave(draft)} loading={saving}>
            {t("common.save")}
          </Button>
          <Button size="xs" color="red" variant="light" onClick={() => void onDelete()} loading={deleting}>
            {t("common.delete")}
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function CommissionEntryRow({
  entry,
  sales,
  business,
  onSave,
  onVoid,
  saving,
  voiding
}: {
  entry: CommissionEntry;
  sales?: Employee | undefined;
  business?: Pick<Business, "code" | "name" | "name_en"> | null | undefined;
  onSave: (draft: EntryDraft) => Promise<unknown>;
  onVoid: () => Promise<unknown>;
  saving: boolean;
  voiding: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<EntryDraft>(() => entryDraftFrom(entry));
  const isPending = entry.status === "pending";

  return (
    <Table.Tr>
      <Table.Td>{sales ? displayName(sales.name, sales.name_en) : entry.sales?.name ?? entry.sales_id}</Table.Td>
      <Table.Td>
        {isPending ? (
          <TextInput
            value={draft.period}
            onChange={(event) => setDraft((current) => ({ ...current, period: event.currentTarget.value }))}
          />
        ) : (
          entry.period
        )}
      </Table.Td>
      <Table.Td>{entry.billing_id}</Table.Td>
      <Table.Td>{businessLabel(business)}</Table.Td>
      <Table.Td>{t(`commissionRecurrence.${entry.recurrence}`)}</Table.Td>
      <Table.Td>
        {isPending ? (
          <NumberInput
            value={draft.amount_sgd ?? ""}
            onChange={(value) => setDraft((current) => ({ ...current, amount_sgd: toNumberOrNull(value) }))}
            min={0}
            decimalScale={2}
          />
        ) : (
          formatMoney(entry.amount_sgd)
        )}
      </Table.Td>
      <Table.Td>
        <Badge color={statusColor(entry.status)} variant="light">
          {t(`commissionEntryStatus.${entry.status}`)}
        </Badge>
      </Table.Td>
      <Table.Td>{entry.payslip_id ?? "-"}</Table.Td>
      <Table.Td>
        {isPending ? (
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" variant="light" onClick={() => void onSave(draft)} loading={saving}>
              {t("common.save")}
            </Button>
            <Button size="xs" color="red" variant="light" onClick={() => void onVoid()} loading={voiding}>
              {t("commission.void")}
            </Button>
          </Group>
        ) : (
          "-"
        )}
      </Table.Td>
    </Table.Tr>
  );
}
