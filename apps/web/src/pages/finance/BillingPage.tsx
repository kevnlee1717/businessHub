import { zodResolver } from "@hookform/resolvers/zod";
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
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import {
  billingCreateSchema,
  billingRefTypes,
  billingStatuses,
  billingUpdateSchema,
  commissionTypes,
  currencies,
  paymentCreateSchema,
  paymentTypes,
  type BillingCreateInput,
  type BillingStatus,
  type BillingUpdateInput,
  type CommissionType,
  type Currency,
  type PaymentCreateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  getSchemeVersion,
  listBusinesses,
  listDealParties,
  listSchemeVersions,
  type SchemeLine
} from "../../api/businessSchemes";
import {
  createBilling,
  createPayment,
  deletePayment,
  getBilling,
  listBilling,
  updateBilling,
  type Billing
} from "../../api/finance";
import { listExternalParties } from "../../api/externalParties";
import { listEmployees } from "../../api/hr";

type MoneyFormValue = number | null | undefined;

type BillingFormValues = {
  ref_type?: string | undefined;
  ref_id?: string | undefined;
  total_price_sgd?: MoneyFormValue;
  deposit_sgd?: MoneyFormValue;
  sales_id?: string | null | undefined;
  commission_type?: CommissionType | null | undefined;
  commission_value?: MoneyFormValue;
  business_id?: string | null | undefined;
  scheme_version_id?: string | null | undefined;
  external_payees?: Record<string, string | null | undefined>;
  status?: BillingStatus | undefined;
};

type PaymentFormValues = {
  paid_currency?: Currency | undefined;
  paid_amount?: MoneyFormValue;
  fx_rate?: MoneyFormValue;
  type?: string | undefined;
  paid_at?: string | undefined;
  note?: string | null | undefined;
};

const billingListQueryKey = ["finance", "billing"] as const;

function displayDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function truncateId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function employeeLabel(employee: { name: string; name_en?: string | null }) {
  return employee.name_en ? `${employee.name} / ${employee.name_en}` : employee.name;
}

function statusColor(status: string) {
  switch (status) {
    case "paid":
      return "green";
    case "partial":
      return "yellow";
    default:
      return "gray";
  }
}

function toNumberOrEmpty(value: string | number, emptyValue: null | undefined) {
  return typeof value === "number" ? value : emptyValue;
}

function moneyToNumber(value?: string | number | null): MoneyFormValue {
  if (value === null) {
    return null;
  }

  if (value === undefined || value === "") {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? undefined : numberValue;
}

function getCreateDefaults(): BillingFormValues {
  return {
    ref_type: "ep",
    ref_id: "",
    total_price_sgd: undefined,
    deposit_sgd: undefined,
    sales_id: null,
    commission_type: null,
    commission_value: null,
    business_id: null,
    scheme_version_id: null,
    external_payees: {}
  };
}

function getEditDefaults(billing?: Billing): BillingFormValues {
  return {
    total_price_sgd: moneyToNumber(billing?.total_price_sgd),
    deposit_sgd: moneyToNumber(billing?.deposit_sgd),
    sales_id: billing?.sales_id ?? null,
    commission_type: (billing?.commission_type as CommissionType | null | undefined) ?? null,
    commission_value: moneyToNumber(billing?.commission_value),
    business_id: billing?.business_id ?? null,
    scheme_version_id: billing?.scheme_version_id ?? null,
    external_payees: billing?.external_payees ?? {},
    status: (billing?.status as BillingStatus | undefined) ?? "unpaid"
  };
}

function getPaymentDefaults(): PaymentFormValues {
  return {
    paid_currency: "SGD",
    paid_amount: undefined,
    fx_rate: undefined,
    type: "deposit",
    paid_at: undefined,
    note: null
  };
}

function sanitizeExternalPayees(values?: Record<string, string | null | undefined>) {
  const payees: Record<string, string> = {};

  Object.entries(values ?? {}).forEach(([lineId, payeeId]) => {
    if (payeeId) {
      payees[lineId] = payeeId;
    }
  });

  return payees;
}

function toBillingCreateInput(values: BillingFormValues): BillingCreateInput {
  return {
    ...(values as BillingCreateInput),
    external_payees: sanitizeExternalPayees(values.external_payees)
  };
}

function toBillingUpdateInput(values: BillingFormValues): BillingUpdateInput {
  return {
    ...(values as BillingUpdateInput),
    external_payees: sanitizeExternalPayees(values.external_payees)
  };
}

export function BillingPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refTypeFilter, setRefTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedBillingId, setSelectedBillingId] = useState<string | null>(null);
  const [createOpened, setCreateOpened] = useState(false);
  const [editOpened, setEditOpened] = useState(false);
  const [paymentOpened, setPaymentOpened] = useState(false);
  const [paymentPaidAtLocal, setPaymentPaidAtLocal] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const billingsQuery = useQuery({
    queryKey: [...billingListQueryKey, refTypeFilter, statusFilter],
    queryFn: () => listBilling({ ref_type: refTypeFilter, status: statusFilter })
  });
  const billingDetailQuery = useQuery({
    queryKey: ["finance", "billing-detail", selectedBillingId],
    queryFn: () => getBilling(selectedBillingId ?? ""),
    enabled: Boolean(selectedBillingId)
  });
  const employeesQuery = useQuery({
    queryKey: ["hr", "employees"],
    queryFn: listEmployees
  });
  const businessesQuery = useQuery({
    queryKey: ["business-finance", "businesses"],
    queryFn: () => listBusinesses()
  });
  const dealPartiesQuery = useQuery({
    queryKey: ["business-finance", "deal-parties"],
    queryFn: listDealParties
  });
  const externalPartiesQuery = useQuery({
    queryKey: ["business-finance", "external-parties"],
    queryFn: listExternalParties
  });

  const createForm = useForm<BillingFormValues>({
    resolver: zodResolver(billingCreateSchema) as Resolver<BillingFormValues>,
    defaultValues: getCreateDefaults()
  });
  const editForm = useForm<BillingFormValues>({
    resolver: zodResolver(billingUpdateSchema) as Resolver<BillingFormValues>,
    defaultValues: getEditDefaults()
  });
  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentCreateSchema) as Resolver<PaymentFormValues>,
    defaultValues: getPaymentDefaults()
  });

  const createMutation = useMutation({
    mutationFn: createBilling,
    onSuccess: async ({ billing }) => {
      await queryClient.invalidateQueries({ queryKey: billingListQueryKey });
      setSelectedBillingId(billing.id);
      closeCreateModal();
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BillingUpdateInput }) => updateBilling(id, body),
    onSuccess: async () => {
      await invalidateBilling();
      closeEditModal();
    }
  });
  const paymentMutation = useMutation({
    mutationFn: ({ billingId, body }: { billingId: string; body: PaymentCreateInput }) =>
      createPayment(billingId, body),
    onSuccess: async () => {
      await invalidateBilling();
      closePaymentModal();
    }
  });
  const deletePaymentMutation = useMutation({
    mutationFn: deletePayment,
    onSuccess: invalidateBilling
  });

  const billings = billingsQuery.data?.billings ?? [];
  const selectedDetail = billingDetailQuery.data;
  const selectedBilling = selectedDetail?.billing;
  const employees = employeesQuery.data?.employees ?? [];
  const businesses = businessesQuery.data?.businesses ?? [];
  const dealParties = dealPartiesQuery.data?.deal_parties ?? [];
  const externalParties = externalPartiesQuery.data?.external_parties ?? [];
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const refTypeOptions = billingRefTypes.map((type) => ({
    value: type,
    label: t(`billingRefType.${type}`)
  }));
  const statusOptions = billingStatuses.map((status) => ({
    value: status,
    label: t(`billingStatus.${status}`)
  }));
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: employeeLabel(employee)
  }));
  const commissionTypeOptions = commissionTypes.map((type) => ({
    value: type,
    label: t(`commissionType.${type}`)
  }));
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));
  const paymentTypeOptions = paymentTypes.map((type) => ({
    value: type,
    label: t(`paymentType.${type}`)
  }));
  const businessOptions = businesses.map((business) => ({
    value: business.id,
    label: business.code ? `${business.code} · ${business.name}` : business.name
  }));
  const externalPartyOptions = externalParties.map((party) => ({
    value: party.id,
    label: party.name_en ? `${party.name} / ${party.name_en}` : party.name
  }));

  async function invalidateBilling() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: billingListQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["finance", "billing-detail", selectedBillingId] })
    ]);
  }

  function openCreateModal() {
    setFormError(null);
    createForm.reset(getCreateDefaults());
    setCreateOpened(true);
  }

  function closeCreateModal() {
    setCreateOpened(false);
    setFormError(null);
    createForm.reset(getCreateDefaults());
  }

  function openEditModal() {
    if (!selectedBilling) {
      return;
    }

    setFormError(null);
    editForm.reset(getEditDefaults(selectedBilling));
    setEditOpened(true);
  }

  function closeEditModal() {
    setEditOpened(false);
    setFormError(null);
    editForm.reset(getEditDefaults(selectedBilling));
  }

  function openPaymentModal() {
    setFormError(null);
    setPaymentPaidAtLocal("");
    paymentForm.reset(getPaymentDefaults());
    setPaymentOpened(true);
  }

  function closePaymentModal() {
    setPaymentOpened(false);
    setFormError(null);
    setPaymentPaidAtLocal("");
    paymentForm.reset(getPaymentDefaults());
  }

  const onCreateSubmit = createForm.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await createMutation.mutateAsync(toBillingCreateInput(values));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onEditSubmit = editForm.handleSubmit(async (values) => {
    if (!selectedBilling) {
      return;
    }

    setFormError(null);
    try {
      await updateMutation.mutateAsync({ id: selectedBilling.id, body: toBillingUpdateInput(values) });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onPaymentSubmit = paymentForm.handleSubmit(async (values) => {
    if (!selectedBilling) {
      return;
    }

    if (values.paid_currency === "RMB" && (values.fx_rate === null || values.fx_rate === undefined)) {
      setFormError(t("payment.fxRateRequired"));
      return;
    }

    setFormError(null);
    try {
      await paymentMutation.mutateAsync({
        billingId: selectedBilling.id,
        body: {
          ...(values as PaymentCreateInput),
          note: values.note?.trim() || null,
          paid_at: values.paid_at || undefined
        }
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function removePayment(paymentId: string) {
    setFormError(null);
    try {
      await deletePaymentMutation.mutateAsync(paymentId);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("billing.title")}</Title>
        <Button onClick={openCreateModal}>{t("billing.add")}</Button>
      </Group>

      <Paper withBorder radius="md" p="md">
        <Group grow align="flex-end">
          <Select
            label={t("billing.filters.refType")}
            placeholder={t("common.all")}
            data={refTypeOptions}
            value={refTypeFilter}
            onChange={setRefTypeFilter}
            clearable
          />
          <Select
            label={t("billing.filters.status")}
            placeholder={t("common.all")}
            data={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
          />
        </Group>
      </Paper>

      {billingsQuery.error || employeesQuery.error ? (
        <Alert color="red" variant="light">
          {billingsQuery.error instanceof Error
            ? billingsQuery.error.message
            : employeesQuery.error instanceof Error
              ? employeesQuery.error.message
              : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={980} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("billing.fields.refType")}</Table.Th>
                <Table.Th>{t("billing.fields.refId")}</Table.Th>
                <Table.Th>{t("billing.fields.totalPriceSgd")}</Table.Th>
                <Table.Th>{t("billing.fields.status")}</Table.Th>
                <Table.Th>{t("billing.fields.sales")}</Table.Th>
                <Table.Th>{t("billing.fields.commissionAmountSgd")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {billingsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : billings.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("billing.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                billings.map((billing) => {
                  const sales = billing.sales_id ? employeeById.get(billing.sales_id) : undefined;

                  return (
                    <Table.Tr key={billing.id}>
                      <Table.Td>{t(`billingRefType.${billing.ref_type}`)}</Table.Td>
                      <Table.Td>
                        <Text title={billing.ref_id}>{truncateId(billing.ref_id)}</Text>
                      </Table.Td>
                      <Table.Td>{billing.total_price_sgd}</Table.Td>
                      <Table.Td>
                        <Badge color={statusColor(billing.status)} variant="light">
                          {t(`billingStatus.${billing.status}`)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{sales ? employeeLabel(sales) : t("common.not_available")}</Table.Td>
                      <Table.Td>{billing.commission_amount_sgd}</Table.Td>
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => setSelectedBillingId(billing.id)}>
                          {t("billing.detail")}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {!selectedBillingId ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">{t("billing.selectHint")}</Text>
        </Paper>
      ) : (
        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3}>{t("billing.detailTitle")}</Title>
              <Group gap="xs">
                {billingDetailQuery.isFetching ? <Loader size="sm" /> : null}
                <Button variant="light" onClick={openEditModal} disabled={!selectedBilling}>
                  {t("billing.edit")}
                </Button>
              </Group>
            </Group>

            {billingDetailQuery.error ? (
              <Alert color="red" variant="light">
                {billingDetailQuery.error instanceof Error
                  ? billingDetailQuery.error.message
                  : t("common.unknown_error")}
              </Alert>
            ) : null}
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}

            {selectedDetail ? (
              <>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
                  <SummaryItem label={t("billing.fields.totalPriceSgd")} value={selectedDetail.billing.total_price_sgd} />
                  <SummaryItem label={t("billing.fields.paidTotal")} value={selectedDetail.paid_total} />
                  <SummaryItem label={t("billing.fields.balance")} value={selectedDetail.balance} />
                  <SummaryItem
                    label={t("billing.fields.status")}
                    value={t(`billingStatus.${selectedDetail.billing.status}`)}
                  />
                  <SummaryItem
                    label={t("billing.fields.commissionAmountSgd")}
                    value={selectedDetail.billing.commission_amount_sgd}
                  />
                </SimpleGrid>

                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Title order={4}>{t("payment.title")}</Title>
                    <Button onClick={openPaymentModal}>{t("payment.add")}</Button>
                  </Group>
                  <ScrollArea>
                    <Table miw={900} verticalSpacing="sm" striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t("payment.fields.paidCurrency")}</Table.Th>
                          <Table.Th>{t("payment.fields.paidAmount")}</Table.Th>
                          <Table.Th>{t("payment.fields.fxRate")}</Table.Th>
                          <Table.Th>{t("payment.fields.sgdEquivalent")}</Table.Th>
                          <Table.Th>{t("payment.fields.type")}</Table.Th>
                          <Table.Th>{t("payment.fields.paidAt")}</Table.Th>
                          <Table.Th>{t("payment.fields.note")}</Table.Th>
                          <Table.Th>{t("common.actions")}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedDetail.payments.length === 0 ? (
                          <Table.Tr>
                            <Table.Td colSpan={8}>
                              <Text ta="center" c="dimmed" py="md">
                                {t("payment.empty")}
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ) : (
                          selectedDetail.payments.map((payment) => (
                            <Table.Tr key={payment.id}>
                              <Table.Td>{payment.paid_currency}</Table.Td>
                              <Table.Td>{payment.paid_amount}</Table.Td>
                              <Table.Td>{payment.fx_rate ?? t("common.not_available")}</Table.Td>
                              <Table.Td>{payment.sgd_equivalent}</Table.Td>
                              <Table.Td>{t(`paymentType.${payment.type}`)}</Table.Td>
                              <Table.Td>{displayDateTime(payment.paid_at)}</Table.Td>
                              <Table.Td>{payment.note ?? t("common.not_available")}</Table.Td>
                              <Table.Td>
                                <Button
                                  size="xs"
                                  variant="light"
                                  color="red"
                                  onClick={() => removePayment(payment.id)}
                                  loading={deletePaymentMutation.isPending}
                                >
                                  {t("common.delete")}
                                </Button>
                              </Table.Td>
                            </Table.Tr>
                          ))
                        )}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Stack>

                <Stack gap="sm">
                  <Title order={4}>{t("priceAdjustment.title")}</Title>
                  <ScrollArea>
                    <Table miw={760} verticalSpacing="sm" striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t("priceAdjustment.fields.field")}</Table.Th>
                          <Table.Th>{t("priceAdjustment.fields.oldValue")}</Table.Th>
                          <Table.Th>{t("priceAdjustment.fields.newValue")}</Table.Th>
                          <Table.Th>{t("priceAdjustment.fields.changedAt")}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedDetail.adjustments.length === 0 ? (
                          <Table.Tr>
                            <Table.Td colSpan={4}>
                              <Text ta="center" c="dimmed" py="md">
                                {t("priceAdjustment.empty")}
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ) : (
                          selectedDetail.adjustments.map((adjustment) => (
                            <Table.Tr key={adjustment.id}>
                              <Table.Td>{adjustment.field}</Table.Td>
                              <Table.Td>{adjustment.old_value}</Table.Td>
                              <Table.Td>{adjustment.new_value}</Table.Td>
                              <Table.Td>{displayDateTime(adjustment.changed_at)}</Table.Td>
                            </Table.Tr>
                          ))
                        )}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Stack>
              </>
            ) : null}
          </Stack>
        </Paper>
      )}

      <Modal opened={createOpened} onClose={closeCreateModal} title={t("billing.add")} size="lg">
        <form onSubmit={onCreateSubmit}>
          {formError ? (
            <Alert color="red" variant="light" mb="md">
              {formError}
            </Alert>
          ) : null}
          <BillingForm
            form={createForm}
            employeeOptions={employeeOptions}
            refTypeOptions={refTypeOptions}
            statusOptions={statusOptions}
            commissionTypeOptions={commissionTypeOptions}
            businessOptions={businessOptions}
            externalPartyOptions={externalPartyOptions}
            dealParties={dealParties}
            mode="create"
          />
          <FormActions loading={createMutation.isPending} onCancel={closeCreateModal} />
        </form>
      </Modal>

      <Modal opened={editOpened} onClose={closeEditModal} title={t("billing.edit")} size="lg">
        <form onSubmit={onEditSubmit}>
          {formError ? (
            <Alert color="red" variant="light" mb="md">
              {formError}
            </Alert>
          ) : null}
          <BillingForm
            form={editForm}
            employeeOptions={employeeOptions}
            refTypeOptions={refTypeOptions}
            statusOptions={statusOptions}
            commissionTypeOptions={commissionTypeOptions}
            businessOptions={businessOptions}
            externalPartyOptions={externalPartyOptions}
            dealParties={dealParties}
            mode="edit"
          />
          <FormActions loading={updateMutation.isPending} onCancel={closeEditModal} />
        </form>
      </Modal>

      <Modal opened={paymentOpened} onClose={closePaymentModal} title={t("payment.add")} size="lg">
        <form onSubmit={onPaymentSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Controller
              control={paymentForm.control}
              name="paid_currency"
              render={({ field }) => (
                <Select
                  label={t("payment.fields.paidCurrency")}
                  data={currencyOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value as Currency)}
                  error={paymentForm.formState.errors.paid_currency?.message}
                  required
                />
              )}
            />
            <Controller
              control={paymentForm.control}
              name="paid_amount"
              render={({ field }) => (
                <NumberInput
                  label={t("payment.fields.paidAmount")}
                  value={field.value ?? ""}
                  onChange={(value) => field.onChange(toNumberOrEmpty(value, undefined))}
                  error={paymentForm.formState.errors.paid_amount?.message}
                  min={0}
                  decimalScale={2}
                  required
                />
              )}
            />
            <Controller
              control={paymentForm.control}
              name="fx_rate"
              render={({ field }) => (
                <NumberInput
                  label={t("payment.fields.fxRate")}
                  description={t("payment.fxRateHint")}
                  value={field.value ?? ""}
                  onChange={(value) => field.onChange(toNumberOrEmpty(value, undefined))}
                  error={paymentForm.formState.errors.fx_rate?.message}
                  min={0}
                  decimalScale={4}
                />
              )}
            />
            <Controller
              control={paymentForm.control}
              name="type"
              render={({ field }) => (
                <Select
                  label={t("payment.fields.type")}
                  data={paymentTypeOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? "")}
                  error={paymentForm.formState.errors.type?.message}
                  required
                />
              )}
            />
            <Controller
              control={paymentForm.control}
              name="paid_at"
              render={({ field }) => (
                <TextInput
                  type="datetime-local"
                  label={t("payment.fields.paidAt")}
                  value={paymentPaidAtLocal}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setPaymentPaidAtLocal(value);
                    field.onChange(value ? new Date(value).toISOString() : undefined);
                  }}
                  error={paymentForm.formState.errors.paid_at?.message}
                />
              )}
            />
            <Textarea
              label={t("payment.fields.note")}
              error={paymentForm.formState.errors.note?.message}
              {...paymentForm.register("note")}
            />
            <FormActions loading={paymentMutation.isPending} onCancel={closePaymentModal} />
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700}>{value}</Text>
    </Paper>
  );
}

function BillingForm({
  form,
  employeeOptions,
  refTypeOptions,
  statusOptions,
  commissionTypeOptions,
  businessOptions,
  externalPartyOptions,
  dealParties,
  mode
}: {
  form: ReturnType<typeof useForm<BillingFormValues>>;
  employeeOptions: { value: string; label: string }[];
  refTypeOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  commissionTypeOptions: { value: string; label: string }[];
  businessOptions: { value: string; label: string }[];
  externalPartyOptions: { value: string; label: string }[];
  dealParties: { id: string; code: string }[];
  mode: "create" | "edit";
}) {
  const { t } = useTranslation();
  const errors = form.formState.errors;
  const selectedBusinessId = form.watch("business_id");
  const selectedSchemeVersionId = form.watch("scheme_version_id");
  const versionsQuery = useQuery({
    queryKey: ["business-finance", "scheme-versions", selectedBusinessId],
    queryFn: () => listSchemeVersions(selectedBusinessId ?? ""),
    enabled: Boolean(selectedBusinessId)
  });
  const schemeVersionQuery = useQuery({
    queryKey: ["business-finance", "scheme-version", selectedSchemeVersionId],
    queryFn: () => getSchemeVersion(selectedSchemeVersionId ?? ""),
    enabled: Boolean(selectedSchemeVersionId)
  });
  const partyCodeById = useMemo(() => new Map(dealParties.map((party) => [party.id, party.code])), [dealParties]);
  const versionOptions = (versionsQuery.data?.scheme_versions ?? []).map((version) => ({
    value: version.id,
    label: version.label
  }));
  const externalCommissionLines = useMemo(
    () =>
      (schemeVersionQuery.data?.scheme_version.lines ?? []).filter((line): line is SchemeLine => {
        const partyCode = line.party_id ? partyCodeById.get(line.party_id) : undefined;
        return line.kind === "commission" && Boolean(partyCode) && partyCode !== "us" && partyCode !== "sales";
      }),
    [partyCodeById, schemeVersionQuery.data?.scheme_version.lines]
  );

  return (
    <Stack gap="md">
      {mode === "create" ? (
        <>
          <Controller
            control={form.control}
            name="ref_type"
            render={({ field }) => (
              <Select
                label={t("billing.fields.refType")}
                data={refTypeOptions}
                value={field.value ?? null}
                onChange={(value) => field.onChange(value ?? "")}
                error={errors.ref_type?.message}
                required
              />
            )}
          />
          <TextInput
            label={t("billing.fields.refId")}
            description={t("billing.refIdHint")}
            error={errors.ref_id?.message}
            {...form.register("ref_id")}
            required
          />
        </>
      ) : null}
      <Controller
        control={form.control}
        name="total_price_sgd"
        render={({ field }) => (
          <NumberInput
            label={t("billing.fields.totalPriceSgd")}
            value={field.value ?? ""}
            onChange={(value) => field.onChange(toNumberOrEmpty(value, undefined))}
            error={errors.total_price_sgd?.message}
            min={0}
            decimalScale={2}
            required={mode === "create"}
          />
        )}
      />
      <Controller
        control={form.control}
        name="deposit_sgd"
        render={({ field }) => (
          <NumberInput
            label={t("billing.fields.depositSgd")}
            value={field.value ?? ""}
            onChange={(value) => field.onChange(toNumberOrEmpty(value, undefined))}
            error={errors.deposit_sgd?.message}
            min={0}
            decimalScale={2}
          />
        )}
      />
      <Controller
        control={form.control}
        name="sales_id"
        render={({ field }) => (
          <Select
            label={t("billing.fields.sales")}
            data={employeeOptions}
            value={field.value ?? null}
            onChange={(value) => field.onChange(value)}
            error={errors.sales_id?.message}
            searchable
            clearable
          />
        )}
      />
      <Controller
        control={form.control}
        name="commission_type"
        render={({ field }) => (
          <Select
            label={t("billing.fields.commissionType")}
            data={commissionTypeOptions}
            value={field.value ?? null}
            onChange={(value) => field.onChange(value as CommissionType | null)}
            error={errors.commission_type?.message}
            clearable
          />
        )}
      />
      <Controller
        control={form.control}
        name="commission_value"
        render={({ field }) => (
          <NumberInput
            label={t("billing.fields.commissionValue")}
            value={field.value ?? ""}
            onChange={(value) => field.onChange(toNumberOrEmpty(value, null))}
            error={errors.commission_value?.message}
            min={0}
            decimalScale={2}
          />
        )}
      />
      <Controller
        control={form.control}
        name="business_id"
        render={({ field }) => (
          <Select
            label={t("billing.fields.business")}
            data={businessOptions}
            value={field.value ?? null}
            onChange={(value) => {
              field.onChange(value);
              form.setValue("scheme_version_id", null);
              form.setValue("external_payees", {});
            }}
            error={errors.business_id?.message}
            searchable
            clearable
          />
        )}
      />
      <Controller
        control={form.control}
        name="scheme_version_id"
        render={({ field }) => (
          <Select
            label={t("billing.fields.schemeVersion")}
            data={versionOptions}
            value={field.value ?? null}
            onChange={(value) => {
              field.onChange(value);
              form.setValue("external_payees", {});
            }}
            error={errors.scheme_version_id?.message}
            disabled={!selectedBusinessId}
            searchable
            clearable
          />
        )}
      />
      {schemeVersionQuery.isFetching ? (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            {t("billing.externalPayees.loading")}
          </Text>
        </Group>
      ) : null}
      {externalCommissionLines.length > 0 ? (
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={600}>{t("billing.externalPayees.title")}</Text>
            {externalCommissionLines.map((line) => (
              <Controller
                key={line.id}
                control={form.control}
                name={`external_payees.${line.id}`}
                render={({ field }) => (
                  <Select
                    label={line.label}
                    placeholder={t("billing.externalPayees.selectPayee")}
                    data={externalPartyOptions}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    searchable
                    clearable
                  />
                )}
              />
            ))}
          </Stack>
        </Paper>
      ) : null}
      {mode === "edit" ? (
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Select
              label={t("billing.fields.status")}
              data={statusOptions}
              value={field.value ?? null}
              onChange={(value) => field.onChange(value as BillingStatus)}
              error={errors.status?.message}
            />
          )}
        />
      ) : null}
    </Stack>
  );
}

function FormActions({ loading, onCancel }: { loading: boolean; onCancel: () => void }) {
  const { t } = useTranslation();

  return (
    <Group justify="flex-end" mt="md">
      <Button variant="subtle" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" loading={loading}>
        {t("common.save")}
      </Button>
    </Group>
  );
}
