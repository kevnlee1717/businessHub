import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  statutoryPaymentSchema,
  statutoryTypes,
  type StatutoryPaymentInput,
  type StatutoryType
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { getCommissionSummary, type CommissionEntry } from "../../api/commission";
import {
  createStatutory,
  generatePayslips,
  listEmployees,
  listPayslips,
  listStatutory,
  payPayslip,
  type Employee,
  type Payslip
} from "../../api/hr";

type StatutoryFormValues = {
  type?: StatutoryType | undefined;
  period?: string | undefined;
  employee_id?: string | null | undefined;
  amount?: number | undefined;
  paid_at?: string | undefined;
  reference?: string | undefined;
};

const employeeQueryKey = ["hr", "employees"] as const;
const payslipQueryKey = ["hr", "payslips"] as const;
const statutoryQueryKey = ["hr", "statutory"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function employeeName(employeeById: Map<string, Employee>, employeeId?: string | null) {
  if (!employeeId) {
    return null;
  }

  const employee = employeeById.get(employeeId);
  return employee ? displayName(employee.name, employee.name_en) : employeeId;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toNumberOrUndefined(value: string | number) {
  return typeof value === "number" ? value : undefined;
}

function getStatutoryDefaultValues(): StatutoryFormValues {
  return {
    type: "cpf",
    period: "",
    employee_id: null,
    amount: undefined,
    paid_at: undefined,
    reference: undefined
  };
}

export function PayrollPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("");
  const [modalOpened, setModalOpened] = useState(false);
  const [commissionDetail, setCommissionDetail] = useState<{ employeeId: string; period: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: listEmployees
  });
  const payslipsQuery = useQuery({
    queryKey: [...payslipQueryKey, period.trim()],
    queryFn: () => listPayslips({ period: period.trim() || undefined })
  });
  const statutoryQuery = useQuery({
    queryKey: statutoryQueryKey,
    queryFn: () => listStatutory()
  });
  const commissionSummaryQuery = useQuery({
    queryKey: ["finance", "commission-summary", commissionDetail?.employeeId, commissionDetail?.period],
    queryFn: () => getCommissionSummary(commissionDetail?.employeeId ?? "", commissionDetail?.period ?? ""),
    enabled: Boolean(commissionDetail)
  });

  const statutoryForm = useForm<StatutoryFormValues>({
    resolver: zodResolver(statutoryPaymentSchema) as Resolver<StatutoryFormValues>,
    defaultValues: getStatutoryDefaultValues()
  });

  const generateMutation = useMutation({
    mutationFn: generatePayslips,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: payslipQueryKey });
    }
  });

  const payMutation = useMutation({
    mutationFn: payPayslip,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: payslipQueryKey });
    }
  });

  const createStatutoryMutation = useMutation({
    mutationFn: createStatutory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: statutoryQueryKey });
      closeModal();
    }
  });

  const employees = employeesQuery.data?.employees ?? [];
  const payslips = payslipsQuery.data?.payslips ?? [];
  const payments = statutoryQuery.data?.payments ?? [];
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const statutoryTypeOptions = statutoryTypes.map((type) => ({
    value: type,
    label: t(`statutoryType.${type}`)
  }));
  const loadError = employeesQuery.error ?? payslipsQuery.error ?? statutoryQuery.error;
  const statutoryErrors = statutoryForm.formState.errors;

  function closeModal() {
    setModalOpened(false);
    setFormError(null);
    statutoryForm.reset(getStatutoryDefaultValues());
  }

  async function handleGenerate() {
    const targetPeriod = period.trim();
    if (!targetPeriod) {
      return;
    }

    try {
      await generateMutation.mutateAsync({ period: targetPeriod });
    } catch {
      // The mutation error is displayed near the payroll table.
    }
  }

  async function handlePay(payslip: Payslip) {
    if (!window.confirm(t("payslip.confirmPay", { employee: employeeName(employeeById, payslip.employeeId) }))) {
      return;
    }

    await payMutation.mutateAsync(payslip.id);
  }

  function openCommissionDetail(payslip: Payslip) {
    setCommissionDetail({ employeeId: payslip.employeeId, period: payslip.period });
  }

  const onStatutorySubmit = statutoryForm.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await createStatutoryMutation.mutateAsync(values as StatutoryPaymentInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="lg">
      <Title order={2}>{t("hr.tabs.payroll")}</Title>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Title order={3}>{t("payslip.title")}</Title>
          <Group align="flex-end">
            <TextInput
              label={t("payslip.fields.period")}
              placeholder="YYYY-MM"
              value={period}
              onChange={(event) => setPeriod(event.currentTarget.value)}
            />
            <Button onClick={() => void handleGenerate()} loading={generateMutation.isPending} disabled={!period.trim()}>
              {t("payslip.generate")}
            </Button>
          </Group>
        </Group>

        {generateMutation.error ? (
          <Alert color="red" variant="light">
            {generateMutation.error instanceof Error ? generateMutation.error.message : t("common.unknown_error")}
          </Alert>
        ) : null}

        <Paper withBorder radius="md">
          <ScrollArea>
            <Table miw={920} verticalSpacing="sm" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("payslip.fields.employee")}</Table.Th>
                  <Table.Th>{t("payslip.fields.period")}</Table.Th>
                  <Table.Th>{t("payslip.fields.gross")}</Table.Th>
                  <Table.Th>{t("payslip.fields.commissionTotal")}</Table.Th>
                  <Table.Th>{t("payslip.fields.netPay")}</Table.Th>
                  <Table.Th>{t("payslip.fields.currency")}</Table.Th>
                  <Table.Th>{t("payslip.fields.payday")}</Table.Th>
                  <Table.Th>{t("payslip.fields.status")}</Table.Th>
                  <Table.Th>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {payslipsQuery.isLoading || employeesQuery.isLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : payslips.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text ta="center" c="dimmed" py="lg">
                        {t("payslip.empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  payslips.map((payslip) => (
                    <Table.Tr key={payslip.id}>
                      <Table.Td>{employeeName(employeeById, payslip.employeeId)}</Table.Td>
                      <Table.Td>{payslip.period}</Table.Td>
                      <Table.Td>{payslip.gross}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Text size="sm">{payslip.commissionTotal}</Text>
                          <Button size="xs" variant="subtle" onClick={() => openCommissionDetail(payslip)}>
                            {t("payslip.commissionDetails")}
                          </Button>
                        </Group>
                      </Table.Td>
                      <Table.Td>{payslip.netPay}</Table.Td>
                      <Table.Td>{t(`currency.${payslip.currency}`)}</Table.Td>
                      <Table.Td>{payslip.payday ?? t("common.not_available")}</Table.Td>
                      <Table.Td>
                        {payslip.status === "paid" ? (
                          <Badge color="green" variant="light">
                            {t("payslip.paidBadge", { paidAt: formatDateTime(payslip.paidAt) })}
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light">
                            {t(`payslipStatus.${payslip.status}`)}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {payslip.status === "draft" ? (
                          <Button
                            size="xs"
                            variant="light"
                            loading={payMutation.isPending}
                            onClick={() => void handlePay(payslip)}
                          >
                            {t("payslip.pay")}
                          </Button>
                        ) : (
                          t("common.not_available")
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </Stack>

      <Divider />

      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>{t("statutory.title")}</Title>
          <Button onClick={() => setModalOpened(true)}>{t("statutory.add")}</Button>
        </Group>

        <Paper withBorder radius="md">
          <ScrollArea>
            <Table miw={820} verticalSpacing="sm" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("statutory.fields.type")}</Table.Th>
                  <Table.Th>{t("statutory.fields.period")}</Table.Th>
                  <Table.Th>{t("statutory.fields.amount")}</Table.Th>
                  <Table.Th>{t("statutory.fields.employee")}</Table.Th>
                  <Table.Th>{t("statutory.fields.paidAt")}</Table.Th>
                  <Table.Th>{t("statutory.fields.reference")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {statutoryQuery.isLoading || employeesQuery.isLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : payments.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text ta="center" c="dimmed" py="lg">
                        {t("statutory.empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  payments.map((payment) => (
                    <Table.Tr key={payment.id}>
                      <Table.Td>{t(`statutoryType.${payment.type}`)}</Table.Td>
                      <Table.Td>{payment.period}</Table.Td>
                      <Table.Td>{payment.amount}</Table.Td>
                      <Table.Td>
                        {payment.employeeId
                          ? employeeName(employeeById, payment.employeeId)
                          : t("statutory.batchPayment")}
                      </Table.Td>
                      <Table.Td>{formatDateTime(payment.paidAt)}</Table.Td>
                      <Table.Td>{payment.reference ?? t("common.not_available")}</Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </Stack>

      <Modal opened={modalOpened} onClose={closeModal} title={t("statutory.add")} size="lg">
        <form onSubmit={onStatutorySubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <Controller
                control={statutoryForm.control}
                name="type"
                render={({ field }) => (
                  <Select
                    label={t("statutory.fields.type")}
                    data={statutoryTypeOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as StatutoryType)}
                    error={statutoryErrors.type?.message}
                  />
                )}
              />
              <TextInput
                label={t("statutory.fields.period")}
                placeholder="YYYY-MM"
                error={statutoryErrors.period?.message}
                {...statutoryForm.register("period", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={statutoryForm.control}
                name="employee_id"
                render={({ field }) => (
                  <Select
                    label={t("statutory.fields.employee")}
                    data={employeeOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value ?? null)}
                    error={statutoryErrors.employee_id?.message}
                    searchable
                    clearable
                  />
                )}
              />
              <Controller
                control={statutoryForm.control}
                name="amount"
                render={({ field }) => (
                  <NumberInput
                    label={t("statutory.fields.amount")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(toNumberOrUndefined(value))}
                    error={statutoryErrors.amount?.message}
                    min={0}
                    decimalScale={2}
                  />
                )}
              />
            </Group>
            <Controller
              control={statutoryForm.control}
              name="paid_at"
              render={({ field }) => (
                <TextInput
                  label={t("statutory.fields.paidAt")}
                  type="datetime-local"
                  value={field.value ? field.value.slice(0, 16) : ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    field.onChange(value ? new Date(value).toISOString() : undefined);
                  }}
                  error={statutoryErrors.paid_at?.message}
                />
              )}
            />
            <TextInput
              label={t("statutory.fields.reference")}
              error={statutoryErrors.reference?.message}
              {...statutoryForm.register("reference", { setValueAs: emptyToUndefined })}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createStatutoryMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(commissionDetail)}
        onClose={() => setCommissionDetail(null)}
        title={t("payslip.commissionDetails")}
        size="xl"
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {commissionDetail
                ? `${employeeName(employeeById, commissionDetail.employeeId)} · ${commissionDetail.period}`
                : ""}
            </Text>
            <Badge variant="light">
              {t("payslip.fields.commissionTotal")}: {commissionSummaryQuery.data?.total ?? "-"}
            </Badge>
          </Group>
          {commissionSummaryQuery.error ? (
            <Alert color="red" variant="light">
              {commissionSummaryQuery.error instanceof Error
                ? commissionSummaryQuery.error.message
                : t("common.unknown_error")}
            </Alert>
          ) : null}
          <Paper withBorder radius="md">
            <ScrollArea>
              <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("commission.fields.billingId")}</Table.Th>
                    <Table.Th>{t("commission.fields.period")}</Table.Th>
                    <Table.Th>{t("commission.fields.recurrence")}</Table.Th>
                    <Table.Th>{t("commission.fields.amountSgd")}</Table.Th>
                    <Table.Th>{t("commission.fields.status")}</Table.Th>
                    <Table.Th>{t("commission.fields.payslip")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {commissionSummaryQuery.isLoading ? (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Group justify="center" py="lg">
                          <Loader size="sm" />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ) : (commissionSummaryQuery.data?.entries ?? []).length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text ta="center" c="dimmed" py="lg">
                          {t("commission.ledger.empty")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    (commissionSummaryQuery.data?.entries ?? []).map((entry) => (
                      <CommissionSummaryRow key={entry.id} entry={entry} />
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        </Stack>
      </Modal>
    </Stack>
  );
}

function commissionStatusColor(status: CommissionEntry["status"]) {
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

function CommissionSummaryRow({ entry }: { entry: CommissionEntry }) {
  const { t } = useTranslation();

  return (
    <Table.Tr>
      <Table.Td>{entry.billing_id}</Table.Td>
      <Table.Td>{entry.period}</Table.Td>
      <Table.Td>{t(`commissionRecurrence.${entry.recurrence}`)}</Table.Td>
      <Table.Td>{entry.amount_sgd}</Table.Td>
      <Table.Td>
        <Badge color={commissionStatusColor(entry.status)} variant="light">
          {t(`commissionEntryStatus.${entry.status}`)}
        </Badge>
      </Table.Td>
      <Table.Td>{entry.payslip_id ?? "-"}</Table.Td>
    </Table.Tr>
  );
}
