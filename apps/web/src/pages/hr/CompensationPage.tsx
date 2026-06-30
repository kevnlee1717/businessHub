import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Group,
  Input,
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
  Title
} from "@mantine/core";
import {
  commissionTypes,
  compensationTemplateSchema,
  currencies,
  employeeCompensationSchema,
  type CommissionType,
  type CompensationTemplateInput,
  type Currency,
  type EmployeeCompensationInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Controller,
  useForm,
  type Control,
  type FieldErrors,
  type Path,
  type Resolver
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createCompensationTemplate,
  getEmployeeCompensation,
  getResolvedCompensation,
  listCompanies,
  listCompensationTemplates,
  listEmployees,
  listPositions,
  putEmployeeCompensation,
  updateCompensationTemplate,
  type CompensationTemplate,
  type EmployeeCompensation,
  type ResolvedCompensationField
} from "../../api/hr";
import { PositionSelect } from "../../components/PositionSelect";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type MoneyFormValue = number | null | undefined;

type CompensationTemplateFormValues = {
  company_id?: string | undefined;
  position_id?: string | undefined;
  base_salary?: MoneyFormValue;
  salary_currency?: Currency | null | undefined;
  attendance_bonus?: MoneyFormValue;
  task_completion_bonus?: MoneyFormValue;
  task_satisfaction_bonus?: MoneyFormValue;
  kpi_bonus?: MoneyFormValue;
  default_commission_type?: CommissionType | null | undefined;
  default_commission_value?: MoneyFormValue;
  payday?: number | null | undefined;
};

type EmployeeCompensationFormValues = Omit<CompensationTemplateFormValues, "company_id" | "position_id">;

const templateQueryKey = ["hr", "compensation-templates"] as const;
const companyQueryKey = ["hr", "companies"] as const;
const positionQueryKey = ["hr", "positions"] as const;
const employeeQueryKey = ["hr", "employees"] as const;

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
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

function formatValue(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function getTemplateDefaultValues(template?: CompensationTemplate): CompensationTemplateFormValues {
  return {
    company_id: template?.company_id ?? undefined,
    position_id: template?.position_id ?? undefined,
    base_salary: moneyToNumber(template?.base_salary),
    salary_currency: template?.salary_currency ?? null,
    attendance_bonus: moneyToNumber(template?.attendance_bonus),
    task_completion_bonus: moneyToNumber(template?.task_completion_bonus),
    task_satisfaction_bonus: moneyToNumber(template?.task_satisfaction_bonus),
    kpi_bonus: moneyToNumber(template?.kpi_bonus),
    default_commission_type: template?.default_commission_type ?? null,
    default_commission_value: moneyToNumber(template?.default_commission_value),
    payday: template?.payday ?? null
  };
}

function getEmployeeDefaultValues(compensation?: EmployeeCompensation | null): EmployeeCompensationFormValues {
  return {
    base_salary: moneyToNumber(compensation?.baseSalary),
    salary_currency: compensation?.salaryCurrency ?? null,
    attendance_bonus: moneyToNumber(compensation?.attendanceBonus),
    task_completion_bonus: moneyToNumber(compensation?.taskCompletionBonus),
    task_satisfaction_bonus: moneyToNumber(compensation?.taskSatisfactionBonus),
    kpi_bonus: moneyToNumber(compensation?.kpiBonus),
    default_commission_type: compensation?.defaultCommissionType ?? null,
    default_commission_value: moneyToNumber(compensation?.defaultCommissionValue),
    payday: compensation?.payday ?? null
  };
}

function resolvedValue(field?: ResolvedCompensationField) {
  return field ? formatValue(field.value) : "-";
}

function resolvedSource(field?: ResolvedCompensationField) {
  return field?.source ?? "none";
}

export function CompensationPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpened, setModalOpened] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CompensationTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const templatesQuery = useQuery({
    queryKey: templateQueryKey,
    queryFn: () => listCompensationTemplates()
  });
  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: () => listCompanies()
  });
  const positionsQuery = useQuery({
    queryKey: positionQueryKey,
    queryFn: () => listPositions()
  });
  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: () => listEmployees()
  });
  const employeeCompensationQuery = useQuery({
    queryKey: ["hr", "employee-compensation", selectedEmployeeId],
    queryFn: () => getEmployeeCompensation(selectedEmployeeId ?? ""),
    enabled: Boolean(selectedEmployeeId)
  });
  const resolvedCompensationQuery = useQuery({
    queryKey: ["hr", "employee-compensation-resolved", selectedEmployeeId],
    queryFn: () => getResolvedCompensation(selectedEmployeeId ?? ""),
    enabled: Boolean(selectedEmployeeId)
  });

  const templateForm = useForm<CompensationTemplateFormValues>({
    resolver: zodResolver(
      editingTemplate ? compensationTemplateSchema.partial() : compensationTemplateSchema
    ) as Resolver<CompensationTemplateFormValues>,
    defaultValues: getTemplateDefaultValues()
  });
  const employeeForm = useForm<EmployeeCompensationFormValues>({
    resolver: zodResolver(employeeCompensationSchema) as Resolver<EmployeeCompensationFormValues>,
    defaultValues: getEmployeeDefaultValues()
  });

  const createTemplateMutation = useMutation({
    mutationFn: createCompensationTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateQueryKey });
      closeTemplateModal();
    }
  });
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CompensationTemplateInput> }) =>
      updateCompensationTemplate(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: templateQueryKey });
      if (selectedEmployeeId) {
        await queryClient.invalidateQueries({ queryKey: ["hr", "employee-compensation-resolved", selectedEmployeeId] });
      }
      closeTemplateModal();
    }
  });
  const putEmployeeMutation = useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: string; body: EmployeeCompensationInput }) =>
      putEmployeeCompensation(employeeId, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "employee-compensation", variables.employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "employee-compensation-resolved", variables.employeeId] });
    }
  });

  useEffect(() => {
    employeeForm.reset(getEmployeeDefaultValues(employeeCompensationQuery.data?.compensation ?? null));
  }, [employeeCompensationQuery.data, employeeForm, selectedEmployeeId]);

  // 薪酬模板会被员工薪酬解析和表单选项复用；请求全量后在前端切片分页。
  const templates = templatesQuery.data?.templates ?? [];
  const visibleTemplates = templates.slice((page - 1) * pageSize, page * pageSize);
  const companies = companiesQuery.data?.companies ?? [];
  const positions = positionsQuery.data?.positions ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const positionById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: displayName(company.name, company.name_en)
  }));
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const currencyOptions = currencies.map((currency) => ({
    value: currency,
    label: t(`currency.${currency}`)
  }));
  const commissionTypeOptions = commissionTypes.map((type) => ({
    value: type,
    label: t(`commissionType.${type}`)
  }));
  const templateErrors = templateForm.formState.errors;
  const employeeErrors = employeeForm.formState.errors;
  const loadError = templatesQuery.error ?? companiesQuery.error ?? positionsQuery.error ?? employeesQuery.error;
  const resolvedCompensation = resolvedCompensationQuery.data?.compensation;

  function openCreateTemplateModal() {
    setEditingTemplate(null);
    setTemplateError(null);
    templateForm.reset(getTemplateDefaultValues());
    setModalOpened(true);
  }

  function openEditTemplateModal(template: CompensationTemplate) {
    setEditingTemplate(template);
    setTemplateError(null);
    templateForm.reset(getTemplateDefaultValues(template));
    setModalOpened(true);
  }

  function closeTemplateModal() {
    setModalOpened(false);
    setEditingTemplate(null);
    setTemplateError(null);
    templateForm.reset(getTemplateDefaultValues());
  }

  const onTemplateSubmit = templateForm.handleSubmit(async (values) => {
    setTemplateError(null);

    try {
      if (editingTemplate) {
        await updateTemplateMutation.mutateAsync({
          id: editingTemplate.id,
          body: values as Partial<CompensationTemplateInput>
        });
        return;
      }

      await createTemplateMutation.mutateAsync(values as CompensationTemplateInput);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onEmployeeSubmit = employeeForm.handleSubmit(async (values) => {
    if (!selectedEmployeeId) {
      return;
    }

    setEmployeeError(null);
    try {
      await putEmployeeMutation.mutateAsync({
        employeeId: selectedEmployeeId,
        body: values as EmployeeCompensationInput
      });
    } catch (error) {
      setEmployeeError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const moneyFieldNames = [
    "base_salary",
    "attendance_bonus",
    "task_completion_bonus",
    "task_satisfaction_bonus",
    "kpi_bonus",
    "default_commission_value"
  ] as const;
  const resolvedRows = [
    "base_salary",
    "salary_currency",
    "attendance_bonus",
    "task_completion_bonus",
    "task_satisfaction_bonus",
    "kpi_bonus",
    "default_commission_type",
    "default_commission_value",
    "payday"
  ] as const;

  return (
    <Stack gap="lg">

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>{t("compensation.templates.title")}</Title>
          <Button onClick={openCreateTemplateModal}>{t("compensation.templates.add")}</Button>
        </Group>
        <Paper withBorder radius="md">
          <ScrollArea>
            <Table miw={1080} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("compensation.fields.company")}</Table.Th>
                  <Table.Th>{t("compensation.fields.position")}</Table.Th>
                  <Table.Th>{t("compensation.fields.base_salary")}</Table.Th>
                  <Table.Th>{t("compensation.fields.attendance_bonus")}</Table.Th>
                  <Table.Th>{t("compensation.fields.task_completion_bonus")}</Table.Th>
                  <Table.Th>{t("compensation.fields.task_satisfaction_bonus")}</Table.Th>
                  <Table.Th>{t("compensation.fields.kpi_bonus")}</Table.Th>
                  <Table.Th>{t("compensation.fields.payday")}</Table.Th>
                  <Table.Th>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {templatesQuery.isLoading || companiesQuery.isLoading || positionsQuery.isLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : templates.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text ta="center" c="dimmed" py="lg">
                        {t("compensation.templates.empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  visibleTemplates.map((template) => (
                    <Table.Tr key={template.id}>
                      <Table.Td>
                        {template.company_name ??
                          companyById.get(template.company_id)?.name ??
                          t("common.not_available")}
                      </Table.Td>
                      <Table.Td>
                        {template.position_name ??
                          positionById.get(template.position_id)?.name ??
                          t("common.not_available")}
                      </Table.Td>
                      <Table.Td>{formatValue(template.base_salary)}</Table.Td>
                      <Table.Td>{formatValue(template.attendance_bonus)}</Table.Td>
                      <Table.Td>{formatValue(template.task_completion_bonus)}</Table.Td>
                      <Table.Td>{formatValue(template.task_satisfaction_bonus)}</Table.Td>
                      <Table.Td>{formatValue(template.kpi_bonus)}</Table.Td>
                      <Table.Td>{formatValue(template.payday)}</Table.Td>
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => openEditTemplateModal(template)}>
                          {t("common.edit")}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
        <TablePagination
          total={templates.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Stack>

      <Stack gap="md">
        <Title order={3}>{t("compensation.employee.title")}</Title>
        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Select
              label={t("compensation.employee.select")}
              data={employeeOptions}
              value={selectedEmployeeId}
              onChange={(value) => {
                setSelectedEmployeeId(value);
                setEmployeeError(null);
              }}
              searchable
              clearable
            />

            {selectedEmployeeId ? (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <form onSubmit={onEmployeeSubmit}>
                  <Stack gap="md">
                    <Title order={4}>{t("compensation.employee.overrideTitle")}</Title>
                    {employeeError ? (
                      <Alert color="red" variant="light">
                        {employeeError}
                      </Alert>
                    ) : null}
                    {employeeCompensationQuery.error ? (
                      <Alert color="red" variant="light">
                        {employeeCompensationQuery.error instanceof Error
                          ? employeeCompensationQuery.error.message
                          : t("common.unknown_error")}
                      </Alert>
                    ) : null}
                    {employeeCompensationQuery.isLoading ? (
                      <Group justify="center" py="md">
                        <Loader size="sm" />
                      </Group>
                    ) : (
                      <>
                        <CompensationMoneyFields
                          control={employeeForm.control}
                          errors={employeeErrors}
                          names={moneyFieldNames}
                          emptyValue={null}
                        />
                        <Group grow align="flex-start">
                          <Controller
                            control={employeeForm.control}
                            name="salary_currency"
                            render={({ field }) => (
                              <Select
                                label={t("compensation.fields.salaryCurrency")}
                                data={currencyOptions}
                                value={field.value ?? null}
                                onChange={(value) => field.onChange(value as Currency | null)}
                                error={employeeErrors.salary_currency?.message}
                                clearable
                              />
                            )}
                          />
                          <Controller
                            control={employeeForm.control}
                            name="default_commission_type"
                            render={({ field }) => (
                              <Select
                                label={t("compensation.fields.defaultCommissionType")}
                                data={commissionTypeOptions}
                                value={field.value ?? null}
                                onChange={(value) => field.onChange(value as CommissionType | null)}
                                error={employeeErrors.default_commission_type?.message}
                                clearable
                              />
                            )}
                          />
                        </Group>
                        <Controller
                          control={employeeForm.control}
                          name="payday"
                          render={({ field }) => (
                            <NumberInput
                              label={t("compensation.fields.payday")}
                              value={field.value ?? ""}
                              onChange={(value) => field.onChange(toNumberOrEmpty(value, null))}
                              error={employeeErrors.payday?.message}
                              min={1}
                              max={28}
                            />
                          )}
                        />
                        <Group justify="flex-end">
                          <Button type="submit" loading={putEmployeeMutation.isPending}>
                            {t("compensation.employee.save")}
                          </Button>
                        </Group>
                      </>
                    )}
                  </Stack>
                </form>

                <Paper withBorder radius="md" p="md">
                  <Stack gap="md">
                    <Group justify="space-between" align="center">
                      <Title order={4}>{t("compensation.resolved.title")}</Title>
                      {resolvedCompensationQuery.data?.template_id ? (
                        <Badge variant="light">{t("compensation.resolved.templateMatched")}</Badge>
                      ) : null}
                    </Group>
                    {resolvedCompensationQuery.isLoading ? (
                      <Group justify="center" py="md">
                        <Loader size="sm" />
                      </Group>
                    ) : resolvedCompensationQuery.error ? (
                      <Alert color="red" variant="light">
                        {resolvedCompensationQuery.error instanceof Error
                          ? resolvedCompensationQuery.error.message
                          : t("common.unknown_error")}
                      </Alert>
                    ) : (
                      <Table verticalSpacing="xs">
                        <Table.Tbody>
                          {resolvedRows.map((name) => (
                            <Table.Tr key={name}>
                              <Table.Th>{t(`compensation.fields.${name}`)}</Table.Th>
                              <Table.Td>{resolvedValue(resolvedCompensation?.[name])}</Table.Td>
                              <Table.Td>
                                <Badge size="sm" color={resolvedSource(resolvedCompensation?.[name]) === "none" ? "gray" : "blue"} variant="light">
                                  {t(`compensation.source.${resolvedSource(resolvedCompensation?.[name])}`)}
                                </Badge>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </Stack>
                </Paper>
              </SimpleGrid>
            ) : (
              <Text c="dimmed">{t("compensation.employee.selectHint")}</Text>
            )}
          </Stack>
        </Paper>
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={closeTemplateModal}
        title={editingTemplate ? t("compensation.templates.edit") : t("compensation.templates.add")}
        size="xl"
      >
        <form onSubmit={onTemplateSubmit}>
          <Stack gap="md">
            {templateError ? (
              <Alert color="red" variant="light">
                {templateError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <Controller
                control={templateForm.control}
                name="company_id"
                render={({ field }) => (
                  <Select
                    label={t("compensation.fields.company")}
                    data={companyOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value ?? undefined)}
                    error={templateErrors.company_id?.message}
                    searchable
                  />
                )}
              />
              <Controller
                control={templateForm.control}
                name="position_id"
                render={({ field }) => (
                  <Input.Wrapper label={t("compensation.fields.position")} error={templateErrors.position_id?.message}>
                    <PositionSelect
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value ?? undefined)}
                    />
                  </Input.Wrapper>
                )}
              />
            </Group>
            <CompensationMoneyFields
              control={templateForm.control}
              errors={templateErrors}
              names={moneyFieldNames}
              emptyValue={editingTemplate ? null : undefined}
            />
            <Group grow align="flex-start">
              <Controller
                control={templateForm.control}
                name="salary_currency"
                render={({ field }) => (
                  <Select
                    label={t("compensation.fields.salaryCurrency")}
                    data={currencyOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as Currency | null)}
                    error={templateErrors.salary_currency?.message}
                    clearable
                  />
                )}
              />
              <Controller
                control={templateForm.control}
                name="default_commission_type"
                render={({ field }) => (
                  <Select
                    label={t("compensation.fields.defaultCommissionType")}
                    data={commissionTypeOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as CommissionType | null)}
                    error={templateErrors.default_commission_type?.message}
                    clearable
                  />
                )}
              />
            </Group>
            <Controller
              control={templateForm.control}
              name="payday"
              render={({ field }) => (
                <NumberInput
                  label={t("compensation.fields.payday")}
                  value={field.value ?? ""}
                  onChange={(value) => field.onChange(toNumberOrEmpty(value, editingTemplate ? null : undefined))}
                  error={templateErrors.payday?.message}
                  min={1}
                  max={28}
                />
              )}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeTemplateModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createTemplateMutation.isPending || updateTemplateMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

function fieldErrorMessage<T extends EmployeeCompensationFormValues>(errors: FieldErrors<T>, name: Path<T>) {
  const error = errors[name];
  return typeof error?.message === "string" ? error.message : undefined;
}

function CompensationMoneyFields<T extends EmployeeCompensationFormValues>({
  control,
  errors,
  names,
  emptyValue
}: {
  control: Control<T>;
  errors: FieldErrors<T>;
  names: readonly Path<T>[];
  emptyValue: null | undefined;
}) {
  const { t } = useTranslation();

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {names.map((name) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field }) => (
            <NumberInput
              label={t(`compensation.fields.${name}`)}
              value={field.value ?? ""}
              onChange={(value) => field.onChange(toNumberOrEmpty(value, emptyValue))}
              error={fieldErrorMessage(errors, name)}
              min={0}
              decimalScale={2}
            />
          )}
        />
      ))}
    </SimpleGrid>
  );
}
