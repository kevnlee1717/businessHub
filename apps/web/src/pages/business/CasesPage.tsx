import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ClientSelect } from "../../components/ClientSelect";
import {
  createCase,
  listCases,
  listClients,
  listTemplates,
  type Case,
  type Client
} from "../../api/cases";

type CaseFormValues = {
  business_type?: BusinessType | undefined;
  client_id?: string | null | undefined;
  template_id?: string | undefined;
  guarantor_name?: string | undefined;
  guarantor_relation?: string | undefined;
  guarantor_contact?: string | undefined;
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

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
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

function getDefaultValues(businessType: CaseListBusinessType): CaseFormValues {
  return {
    business_type: businessType,
    client_id: null,
    template_id: undefined,
    guarantor_name: undefined,
    guarantor_relation: undefined,
    guarantor_contact: undefined
  };
}

export function CasesPage({ businessType }: CasesPageProps) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<CaseStatus | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [onlyReapply, setOnlyReapply] = useState(false);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canManageCases = can("case.manage");

  const casesQuery = useQuery({
    queryKey: ["business", "cases", businessType, statusFilter, clientFilter],
    queryFn: () =>
      listCases({
        business_type: businessType,
        status: statusFilter ?? undefined,
        client_id: clientFilter ?? undefined
      })
  });
  const clientsQuery = useQuery({
    queryKey: ["business", "clients"],
    queryFn: listClients
  });
  const templatesQuery = useQuery({
    queryKey: ["business", "workflow-templates", businessType],
    queryFn: () => listTemplates(businessType)
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

  const cases = (casesQuery.data?.cases ?? []).filter((c) => {
    if (!onlyReapply) return true;
    const s = computeReapplyStatus(
      c.latest_result
        ? [{ result: c.latest_result, rejectedAt: c.latest_rejected_at ?? null, createdAt: c.latest_submission_at ?? c.created_at }]
        : [],
      new Date()
    );
    return s.state === "eligible" || s.state === "waiting";
  });
  const clients = clientsQuery.data?.clients ?? [];
  const templates = templatesQuery.data?.templates ?? [];
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client] as const)),
    [clients]
  );
  const errors = form.formState.errors;
  const statusOptions = caseStatuses.map((status) => ({
    value: status,
    label: t(`caseStatus.${status}`)
  }));
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
  const loadError = casesQuery.error ?? clientsQuery.error ?? templatesQuery.error;

  function openCreateModal() {
    setFormError(null);
    form.reset(getDefaultValues(businessType));
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

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    if (businessType === "ica" && !values.guarantor_name?.trim()) {
      setFormError(t("case.errors.guarantorRequired"));
      return;
    }

    try {
      await createMutation.mutateAsync({ ...values, business_type: businessType } as CaseCreateInput);
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

      {/* element-admin filter-container:筛选项 + 操作按钮同一行 */}
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label={t("case.filters.status")}
          w={180}
          data={statusOptions}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as CaseStatus | null)}
          clearable
        />
        <Select
          label={t("case.filters.client")}
          w={220}
          data={clientOptions}
          value={clientFilter}
          onChange={setClientFilter}
          searchable
          clearable
        />
        {businessType === "ica" && (
          <Checkbox
            label="待再申请"
            checked={onlyReapply}
            onChange={(e) => setOnlyReapply(e.currentTarget.checked)}
            style={{ alignSelf: "flex-end", paddingBottom: 6 }}
          />
        )}
        {canManageCases ? (
          <Button onClick={openCreateModal}>{t("case.add")}</Button>
        ) : null}
      </Group>

      <ScrollArea>
        <Table miw={920} withTableBorder withColumnBorders highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("case.fields.businessType")}</Table.Th>
                <Table.Th>{t("case.fields.client")}</Table.Th>
                <Table.Th>{t("case.fields.status")}</Table.Th>
                {businessType === "ica" && <Table.Th>再申请</Table.Th>}
                <Table.Th>{t("case.fields.currentStep")}</Table.Th>
                <Table.Th>{t("case.fields.createdAt")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {casesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={businessType === "ica" ? 7 : 6}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : cases.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={businessType === "ica" ? 7 : 6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("case.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                cases.map((caseItem) => (
                  <Table.Tr
                    key={caseItem.id}
                    onClick={() => navigate(`/business/cases/${caseItem.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <Table.Td>{t(`businessType.${caseItem.business_type}`)}</Table.Td>
                    <Table.Td>{clientName(clientById.get(caseItem.client_id ?? ""))}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(caseItem.status)} variant="light">
                        {t(`caseStatus.${caseItem.status}`)}
                      </Badge>
                    </Table.Td>
                    {businessType === "ica" && (
                      <Table.Td>
                        <ReapplyBadge caseItem={caseItem} />
                      </Table.Td>
                    )}
                    <Table.Td>{caseItem.current_step ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{formatDateTime(caseItem.created_at)}</Table.Td>
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
                ))
              )}
            </Table.Tbody>
        </Table>
      </ScrollArea>

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
            {businessType === "ica" ? (
              <Stack gap="md">
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
    </Stack>
  );
}
