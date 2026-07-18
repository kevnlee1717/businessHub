import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Group,
  Input,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput
} from "@mantine/core";
import {
  caseCreateSchema,
  caseStatuses,
  computeReapplyStatus,
  type BusinessType,
  type CaseCreateInput,
  type CaseStatus
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  createCase,
  listCases,
  listClients,
  listEpStepStats,
  listTemplates,
  type Case,
  type Client,
  type EpStepStat
} from "../../api/cases";
import { listPackages } from "../../api/epPackages";
import { listEmployees } from "../../api/hr";
import { listIcaFeeSchemes } from "../../api/businessSchemes";
import { useAuth } from "../../auth/AuthContext";
import { ClientSelect } from "../../components/ClientSelect";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type CaseFormValues = {
  business_type?: BusinessType | undefined;
  client_id?: string | null | undefined;
  template_id?: string | undefined;
  package_id?: string | undefined;
  sales_id?: string | null | undefined;
  fee_scheme_version_id?: string | undefined;
  guarantor_name?: string | undefined;
  guarantor_relation?: string | undefined;
  guarantor_contact?: string | undefined;
  signed_at?: string | null | undefined;
};

type CaseListBusinessType = Extract<BusinessType, "ep" | "ica">;

type CasesPageProps = {
  businessType: CaseListBusinessType;
};

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function formatDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "-";
}

function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) {
    return null;
  }

  const timestamp = Date.parse(dateStr);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.floor((Date.now() - timestamp) / 86400000);
}

function computeEpHealth(caseItem: Case): {
  signedDays: number | null;
  openDays: number | null;
  level: "normal" | "slow" | "attn";
} {
  const signedDays = daysSince(caseItem.signed_at);
  const openDays = daysSince(caseItem.resubmission_open_since);

  if (caseItem.resubmission_open && openDays !== null && openDays > 20) {
    return { signedDays, openDays, level: "attn" };
  }

  if (signedDays !== null && signedDays > 21) {
    return { signedDays, openDays, level: "slow" };
  }

  return { signedDays, openDays, level: "normal" };
}

function statusColor(status: CaseStatus) {
  switch (status) {
    case "completed":
      return "green";
    case "cancelled":
      return "gray";
    case "in_progress":
      return "blue";
    default:
      return "yellow";
  }
}

function ReapplyBadge({ caseItem }: { caseItem: Case }) {
  const status = computeReapplyStatus(
    caseItem.latest_result
      ? [{ result: caseItem.latest_result, rejectedAt: caseItem.latest_rejected_at ?? null, createdAt: caseItem.latest_submission_at ?? caseItem.created_at }]
      : [],
    new Date()
  );
  if (status.state === "approved") return <Badge color="green" variant="light">已通过</Badge>;
  if (status.state === "pending") return <Badge color="blue" variant="light">等待结果</Badge>;
  if (status.state === "rejected_no_date") return <Badge color="gray" variant="light">拒绝日期待补</Badge>;
  if (status.state === "eligible") return <Badge color="green" variant="light">✅ 可再申请</Badge>;
  const d = status.daysRemaining ?? 0;
  return <Badge color={d <= 14 ? "red" : d <= 30 ? "yellow" : "gray"} variant="light">还差 {d} 天可再申请</Badge>;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getDefaultValues(businessType: CaseListBusinessType): CaseFormValues {
  return {
    business_type: businessType,
    client_id: null,
    template_id: undefined,
    package_id: undefined,
    sales_id: null,
    fee_scheme_version_id: undefined,
    guarantor_name: undefined,
    guarantor_relation: undefined,
    guarantor_contact: undefined,
    signed_at: null
  };
}

export function CasesPage({ businessType }: CasesPageProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "active" | null>("active");
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>(currentMonth());
  const [onlyReapply, setOnlyReapply] = useState(false);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [signedAtOrder, setSignedAtOrder] = useState<"asc" | "desc" | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const canManageCases = can("case.manage");
  const useFrontendPagination = businessType === "ica" && onlyReapply;

  const casesQuery = useQuery({
    queryKey: [
      "business",
      "cases",
      businessType,
      statusFilter,
      clientFilter,
      monthFilter,
      onlyReapply,
      signedAtOrder,
      page,
      pageSize,
      useFrontendPagination
    ],
    queryFn: () =>
      listCases({
        business_type: businessType,
        status: statusFilter && statusFilter !== "active" ? statusFilter : undefined,
        status_in: statusFilter === "active" ? "open,in_progress" : undefined,
        client_id: clientFilter ?? undefined,
        signed_month: monthFilter || undefined,
        order_by: signedAtOrder ? "signed_at" : undefined,
        order: signedAtOrder ?? undefined,
        page: useFrontendPagination ? undefined : page,
        page_size: useFrontendPagination ? undefined : pageSize
      }),
    placeholderData: keepPreviousData
  });
  const epStepStatsQuery = useQuery({
    queryKey: ["business", "ep-step-stats"],
    queryFn: () => listEpStepStats(),
    enabled: businessType === "ep"
  });
  const statByName = new Map<string, EpStepStat>(
    (epStepStatsQuery.data?.stats ?? []).map((stat) => [stat.name, stat] as const)
  );
  const clientsQuery = useQuery({
    queryKey: ["business", "clients"],
    queryFn: () => listClients()
  });
  const templatesQuery = useQuery({
    queryKey: ["business", "workflow-templates", businessType],
    queryFn: () => listTemplates(businessType)
  });
  const packagesQuery = useQuery({
    queryKey: ["ep-packages", "packages"],
    queryFn: () => listPackages(),
    enabled: businessType === "ep"
  });
  const employeesQuery = useQuery({
    queryKey: ["hr", "employees"],
    queryFn: () => listEmployees(),
    enabled: businessType === "ep"
  });
  const icaSchemesQuery = useQuery({
    queryKey: ["ica-fee-schemes"],
    queryFn: () => listIcaFeeSchemes(),
    enabled: businessType === "ica"
  });

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseCreateSchema) as Resolver<CaseFormValues>,
    defaultValues: getDefaultValues(businessType)
  });

  const createMutation = useMutation({
    mutationFn: createCase,
    onSuccess: (data) => {
      closeModal();
      navigate(`/business/cases/${data.case.id}`);
    }
  });

  const filteredCases = (casesQuery.data?.cases ?? []).filter((caseItem) => {
    if (!useFrontendPagination) {
      return true;
    }

    const status = computeReapplyStatus(
      caseItem.latest_result
        ? [
            {
              result: caseItem.latest_result,
              rejectedAt: caseItem.latest_rejected_at ?? null,
              createdAt: caseItem.latest_submission_at ?? caseItem.created_at
            }
          ]
        : [],
      new Date()
    );

    return status.state === "eligible" || status.state === "waiting";
  });
  const visibleCases = useFrontendPagination
    ? filteredCases.slice((page - 1) * pageSize, page * pageSize)
    : filteredCases;
  const attnCount =
    businessType === "ep"
      ? visibleCases.filter((caseItem) => computeEpHealth(caseItem).level === "attn").length
      : 0;
  const tableCases =
    businessType === "ep" && onlyAttention
      ? visibleCases.filter((caseItem) => computeEpHealth(caseItem).level === "attn")
      : visibleCases;
  const totalCases = useFrontendPagination ? filteredCases.length : (casesQuery.data?.total ?? filteredCases.length);
  const clients = clientsQuery.data?.clients ?? [];
  const templates = templatesQuery.data?.templates ?? [];
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client] as const)),
    [clients]
  );
  const errors = form.formState.errors;
  const statusOptions = [
    { value: "active", label: "在办" },
    ...caseStatuses.map((status) => ({
      value: status,
      label: t(`caseStatus.${status}`)
    }))
  ];
  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: displayName(client.name, client.name_en)
  }));
  const templateOptions = templates
    .filter((template) => template.business_type === businessType)
    .map((template) => ({
      value: template.id,
      label: template.name
    }));
  const packageOptions = (packagesQuery.data?.packages ?? [])
    .filter((servicePackage) => servicePackage.active)
    .map((servicePackage) => {
      const labelParts = [`${servicePackage.name} · SGD ${Number(servicePackage.base_price_sgd).toFixed(2)}`];
      if (servicePackage.is_recommended) {
        labelParts.push("★推荐");
      }
      return {
        value: servicePackage.id,
        label: labelParts.join(" ")
      };
    });
  const employeeOptions = (employeesQuery.data?.employees ?? [])
    .filter((employee) => employee.status === "active")
    .map((employee) => ({
      value: employee.id,
      label: displayName(employee.name, employee.name_en)
    }));
  const schemes = icaSchemesQuery.data?.schemes ?? [];
  const defaultSchemeId = schemes.find((scheme) => scheme.is_default)?.id ?? schemes[0]?.id;
  const schemeOptions = schemes.map((scheme) => ({
    value: scheme.id,
    label: scheme.label
  }));
  const loadError =
    casesQuery.error ??
    clientsQuery.error ??
    templatesQuery.error ??
    packagesQuery.error ??
    employeesQuery.error ??
    icaSchemesQuery.error;

  useEffect(() => {
    if (businessType === "ica" && modalOpened && defaultSchemeId && !form.getValues("fee_scheme_version_id")) {
      form.setValue("fee_scheme_version_id", defaultSchemeId);
    }
  }, [businessType, defaultSchemeId, form, modalOpened]);

  function openCreateModal() {
    setFormError(null);
    form.reset({
      ...getDefaultValues(businessType),
      fee_scheme_version_id: businessType === "ica" ? defaultSchemeId : undefined
    });
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setFormError(null);
    form.reset(getDefaultValues(businessType));
  }

  function clientName(client?: Client) {
    return client ? displayName(client.name, client.name_en) : t("common.not_available");
  }

  function updateStatusFilter(value: string | null) {
    setStatusFilter(value as CaseStatus | "active" | null);
    setPage(1);
  }

  function updateClientFilter(value: string | null) {
    setClientFilter(value);
    setPage(1);
  }

  function updateMonthFilter(value: string) {
    setMonthFilter(value);
    setPage(1);
  }

  function updateOnlyReapply(checked: boolean) {
    setOnlyReapply(checked);
    setPage(1);
  }

  function updateOnlyAttention(checked: boolean) {
    setOnlyAttention(checked);
    setPage(1);
  }

  function toggleSignedAtSort() {
    setSignedAtOrder((current) => {
      if (current === null) {
        return "desc";
      }

      if (current === "desc") {
        return "asc";
      }

      return null;
    });
    setPage(1);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    if (businessType === "ica" && !values.guarantor_name?.trim()) {
      setFormError(t("case.errors.guarantorRequired"));
      return;
    }

    if (businessType === "ica" && !values.fee_scheme_version_id) {
      setFormError(t("case.errors.feeSchemeRequired"));
      return;
    }

    if (businessType === "ep" && !values.package_id) {
      setFormError(t("case.errors.packageRequired"));
      return;
    }

    try {
      await createMutation.mutateAsync({
        ...values,
        business_type: businessType,
        package_id: businessType === "ep" ? values.package_id : undefined,
        fee_scheme_version_id: businessType === "ica" ? values.fee_scheme_version_id : undefined,
        sales_id: businessType === "ep" ? values.sales_id ?? null : undefined,
        signed_at: values.signed_at || null
      } as CaseCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      {businessType === "ep" && attnCount > 0 ? (
        <Alert color="red" variant="light">
          {attnCount} 个案件在补材料且超 20 天,需特别关注
        </Alert>
      ) : null}

      {/* element-admin filter-container:筛选项 + 操作按钮同一行 */}
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label={t("case.filters.status")}
          w={180}
          data={statusOptions}
          value={statusFilter}
          onChange={updateStatusFilter}
          clearable
        />
        <Select
          label={t("case.filters.client")}
          w={220}
          data={clientOptions}
          value={clientFilter}
          onChange={updateClientFilter}
          searchable
          clearable
        />
        <TextInput
          type="month"
          label={t("case.filters.signedMonth")}
          w={180}
          value={monthFilter}
          onChange={(event) => updateMonthFilter(event.currentTarget.value)}
          rightSection={
            monthFilter ? <CloseButton size="sm" onClick={() => updateMonthFilter("")} /> : null
          }
        />
        {businessType === "ica" && (
          <Checkbox
            label="待再申请"
            checked={onlyReapply}
            onChange={(event) => updateOnlyReapply(event.currentTarget.checked)}
            style={{ alignSelf: "flex-end", paddingBottom: 6 }}
          />
        )}
        {businessType === "ep" && (
          <Checkbox
            label="只看需关注"
            checked={onlyAttention}
            onChange={(event) => updateOnlyAttention(event.currentTarget.checked)}
            style={{ alignSelf: "flex-end", paddingBottom: 6 }}
          />
        )}
        {canManageCases ? (
          <Button onClick={openCreateModal}>{t("case.add")}</Button>
        ) : null}
        {businessType === "ep" && (
          <Button variant="default" onClick={() => setStatsModalOpen(true)}>
            步骤耗时统计
          </Button>
        )}
      </Group>

      <ScrollArea>
        <Table miw={1180} withTableBorder withColumnBorders highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("case.fields.client")}</Table.Th>
                <Table.Th>{t("case.fields.status")}</Table.Th>
                {businessType === "ica" && <Table.Th>首次申请</Table.Th>}
                {businessType === "ica" && <Table.Th>最近申请</Table.Th>}
                {businessType === "ica" && <Table.Th>再申请</Table.Th>}
                <Table.Th>{t("case.fields.currentStep")}</Table.Th>
                <Table.Th
                  onClick={toggleSignedAtSort}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  {t("case.fields.signedAt")}
                  {signedAtOrder ? ` ${signedAtOrder === "asc" ? "↑" : "↓"}` : ""}
                </Table.Th>
                {businessType === "ep" && <Table.Th>签约至今</Table.Th>}
                {businessType === "ep" && <Table.Th>进展预警</Table.Th>}
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {casesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={businessType === "ica" ? 8 : 7}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : tableCases.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={businessType === "ica" ? 8 : 7}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("case.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                tableCases.map((caseItem) => {
                  const health = computeEpHealth(caseItem);
                  const healthColor =
                    health.level === "attn" ? "red.7" : health.level === "slow" ? "orange.7" : "green.7";
                  const healthLabel =
                    health.level === "attn" ? "需特别关注" : health.level === "slow" ? "偏慢" : "正常";
                  const st = caseItem.current_step_name ? statByName.get(caseItem.current_step_name) : undefined;
                  const hasResubmissionWarning = Boolean(caseItem.resubmission_open);
                  const hasSubmittedWaitingWarning = caseItem.submitted_waiting_days != null;
                  const hasCurrentStepWarning = Boolean(
                    st?.reference_active &&
                    st.avg_days >= 1 &&
                    caseItem.current_step_elapsed_days != null &&
                    caseItem.current_step_elapsed_days > st.avg_days
                  );
                  const hasProgressWarning =
                    hasResubmissionWarning || hasSubmittedWaitingWarning || hasCurrentStepWarning;

                  return (
                    <Table.Tr
                      key={caseItem.id}
                      onClick={() => navigate(`/business/cases/${caseItem.id}`)}
                      style={{
                        cursor: "pointer",
                        ...(businessType === "ep" && health.level === "attn"
                          ? { backgroundColor: "var(--mantine-color-red-0)" }
                          : {})
                      }}
                    >
                      <Table.Td>{clientName(clientById.get(caseItem.client_id ?? ""))}</Table.Td>
                      <Table.Td>
                        <Badge color={statusColor(caseItem.status)} variant="light">
                          {t(`caseStatus.${caseItem.status}`)}
                        </Badge>
                      </Table.Td>
                      {businessType === "ica" && (
                        <Table.Td>
                          {caseItem.first_submission_at ? caseItem.first_submission_at.slice(0, 7) : "—"}
                        </Table.Td>
                      )}
                      {businessType === "ica" && (
                        <Table.Td>
                          {caseItem.last_submission_at ? caseItem.last_submission_at.slice(0, 7) : "—"}
                        </Table.Td>
                      )}
                      {businessType === "ica" && (
                        <Table.Td>
                          <ReapplyBadge caseItem={caseItem} />
                        </Table.Td>
                      )}
                      <Table.Td>{caseItem.current_step ?? t("common.not_available")}</Table.Td>
                      <Table.Td>{formatDate(caseItem.signed_at)}</Table.Td>
                      {businessType === "ep" && (
                        <Table.Td>
                          {health.signedDays === null ? (
                            <Text c="dimmed">—</Text>
                          ) : (
                            <Stack gap={2}>
                              <Text c={healthColor} size="lg" fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
                                {health.signedDays} <Text span size="sm">天</Text>
                              </Text>
                              <Text c={healthColor} size="xs">
                                {healthLabel}
                              </Text>
                            </Stack>
                          )}
                        </Table.Td>
                      )}
                      {businessType === "ep" && (
                        <Table.Td>
                          {!hasProgressWarning ? (
                            <Text c="dimmed">—</Text>
                          ) : (
                            <Stack gap={4}>
                              {caseItem.resubmission_open ? (
                                health.openDays !== null && health.openDays > 20 ? (
                                  <Badge color="red" variant="light">
                                    ⚠ 补材料 {health.openDays} 天未结
                                  </Badge>
                                ) : (
                                  <Badge color="orange" variant="light">
                                    补材料中 · 第{caseItem.resubmission_open_round}轮
                                    {health.openDays !== null ? ` · ${health.openDays}天` : ""}
                                  </Badge>
                                )
                              ) : null}
                              {caseItem.submitted_waiting_days != null ? (
                                <Badge color="blue" variant="light">
                                  已递交 · 等结果 {caseItem.submitted_waiting_days} 天
                                </Badge>
                              ) : null}
                              {hasCurrentStepWarning ? (
                                <Badge color="orange" variant="light">
                                  当前步超均值 · {caseItem.current_step_name} {caseItem.current_step_elapsed_days}/{st?.avg_days}天
                                </Badge>
                              ) : null}
                            </Stack>
                          )}
                        </Table.Td>
                      )}
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/business/cases/${caseItem.id}`);
                          }}
                        >
                          {t("common.view")}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
        </Table>
      </ScrollArea>
      <TablePagination
        total={totalCases}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Modal opened={modalOpened} onClose={closeModal} title={t("case.add")} size="lg">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <Controller
                name="client_id"
                control={form.control}
                render={({ field }) => (
                  <Input.Wrapper label={t("case.fields.client")} error={errors.client_id?.message}>
                    <ClientSelect
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value)}
                    />
                  </Input.Wrapper>
                )}
              />
            </Group>
            <Controller
              name="signed_at"
              control={form.control}
              render={({ field }) => (
                <TextInput
                  type="date"
                  label={t("case.fields.signedAt")}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.currentTarget.value || null)}
                  error={errors.signed_at?.message}
                />
              )}
            />
            <Controller
              name="template_id"
              control={form.control}
              render={({ field }) => (
                <Select
                  label={t("case.fields.template")}
                  data={templateOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  error={errors.template_id?.message}
                  searchable
                  clearable
                />
              )}
            />
            {businessType === "ep" ? (
              <Stack gap="xs">
                <Controller
                  name="package_id"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      label={t("case.fields.package")}
                      data={packageOptions}
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value ?? undefined)}
                      error={errors.package_id?.message}
                      searchable
                      required
                    />
                  )}
                />
                <Controller
                  name="sales_id"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      label={t("case.fields.sales")}
                      data={employeeOptions}
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value ?? null)}
                      error={errors.sales_id?.message}
                      searchable
                      clearable
                    />
                  )}
                />
                <Text size="sm" c="dimmed">
                  {t("case.packageCommissionHint")}
                </Text>
              </Stack>
            ) : null}
            {businessType === "ica" ? (
              <Stack gap="md">
                <Controller
                  name="fee_scheme_version_id"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      label={t("case.fields.feeScheme")}
                      data={schemeOptions}
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value ?? undefined)}
                      error={errors.fee_scheme_version_id?.message}
                      searchable
                      required
                      disabled={icaSchemesQuery.isLoading}
                    />
                  )}
                />
                <Group grow align="flex-start">
                  <TextInput
                    label={t("case.fields.guarantorName")}
                    error={errors.guarantor_name?.message}
                    {...form.register("guarantor_name", { setValueAs: emptyToUndefined })}
                  />
                  <TextInput
                    label={t("case.fields.guarantorRelation")}
                    error={errors.guarantor_relation?.message}
                    {...form.register("guarantor_relation", { setValueAs: emptyToUndefined })}
                  />
                </Group>
                <TextInput
                  label={t("case.fields.guarantorContact")}
                  error={errors.guarantor_contact?.message}
                  {...form.register("guarantor_contact", { setValueAs: emptyToUndefined })}
                />
              </Stack>
            ) : null}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal opened={statsModalOpen} onClose={() => setStatsModalOpen(false)} title="EP 步骤耗时统计" size="lg">
        <Table withTableBorder withColumnBorders verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>步骤</Table.Th>
              <Table.Th>平均用时</Table.Th>
              <Table.Th>样本数</Table.Th>
              <Table.Th>参考状态</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(epStepStatsQuery.data?.stats ?? []).map((stat) => (
              <Table.Tr key={stat.step_order}>
                <Table.Td>{stat.step_order}. {stat.name}</Table.Td>
                <Table.Td>{stat.sample_count ? `${stat.avg_days} 天` : "—"}</Table.Td>
                <Table.Td>{stat.sample_count}</Table.Td>
                <Table.Td>
                  {stat.reference_active ? (
                    <Badge color="green" variant="light">已参考</Badge>
                  ) : (
                    <Badge color="gray" variant="light">样本不足 {stat.sample_count}/20</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Modal>
    </Stack>
  );
}
