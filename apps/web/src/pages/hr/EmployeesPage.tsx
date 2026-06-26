import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Group,
  Input,
  Loader,
  Modal,
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
  currencies,
  employeeCreateSchema,
  employeeStatuses,
  employeeUpdateSchema,
  employmentTypes,
  payrollSchemes,
  roles,
  type Currency,
  type EmployeeCreateInput,
  type EmployeeStatus,
  type EmployeeUpdateInput,
  type EmploymentType,
  type PayrollScheme,
  type Role
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createEmployee,
  listCompanies,
  listEmployees,
  listPositions,
  listWorkShifts,
  updateEmployee,
  type Employee
} from "../../api/hr";
import { PositionSelect } from "../../components/PositionSelect";

type EmployeeFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  password?: string | undefined;
  role?: Role | undefined;
  company_id?: string | undefined;
  position_id?: string | undefined;
  shift_id?: string | undefined;
  employment_type?: EmploymentType | undefined;
  status?: EmployeeStatus | undefined;
  join_date?: string | undefined;
  payroll_scheme?: PayrollScheme | null | undefined;
  salary_currency?: Currency | undefined;
};

const employeeQueryKey = ["hr", "employees"] as const;
const companyQueryKey = ["hr", "companies"] as const;
const positionQueryKey = ["hr", "positions"] as const;
const workShiftQueryKey = ["hr", "work-shifts"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function getDefaultValues(employee?: Employee): EmployeeFormValues {
  return {
    name: employee?.name ?? "",
    name_en: employee?.name_en ?? undefined,
    email: employee?.email ?? "",
    phone: employee?.phone ?? undefined,
    password: undefined,
    role: employee?.role ?? "clerk",
    employment_type: employee?.employment_type ?? "full_time",
    status: employee?.status ?? "active",
    salary_currency: employee?.salary_currency ?? "SGD",
    payroll_scheme: employee?.payroll_scheme ?? null,
    company_id: employee?.company_id ?? undefined,
    position_id: employee?.position_id ?? undefined,
    shift_id: employee?.shift_id ?? undefined,
    join_date: employee?.join_date ?? undefined
  };
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function EmployeesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: listEmployees
  });
  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: listCompanies
  });
  const positionsQuery = useQuery({
    queryKey: positionQueryKey,
    queryFn: listPositions
  });
  const workShiftsQuery = useQuery({
    queryKey: workShiftQueryKey,
    queryFn: listWorkShifts
  });

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(
      editingEmployee ? employeeUpdateSchema : employeeCreateSchema
    ) as Resolver<EmployeeFormValues>,
    defaultValues: getDefaultValues(editingEmployee ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employeeQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EmployeeUpdateInput }) => updateEmployee(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employeeQueryKey });
      closeModal();
    }
  });

  const companies = companiesQuery.data?.companies ?? [];
  const positions = positionsQuery.data?.positions ?? [];
  const workShifts = workShiftsQuery.data?.work_shifts ?? [];

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const positionById = useMemo(
    () => new Map(positions.map((position) => [position.id, position])),
    [positions]
  );

  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: displayName(company.name, company.name_en)
  }));
  const shiftOptions = workShifts.map((shift) => ({
    value: shift.id,
    label: shift.name
  }));
  const roleOptions = roles.map((role) => ({ value: role, label: t(`role.${role}`) }));
  const employmentTypeOptions = employmentTypes.map((type) => ({
    value: type,
    label: t(`employmentType.${type}`)
  }));
  const statusOptions = employeeStatuses.map((status) => ({
    value: status,
    label: t(`employeeStatus.${status}`)
  }));
  const currencyOptions = currencies.map((currency) => ({
    value: currency,
    label: t(`currency.${currency}`)
  }));
  const payrollSchemeOptions = payrollSchemes.map((scheme) => ({
    value: scheme,
    label: t(`payrollScheme.${scheme}`)
  }));

  function openCreateModal() {
    setEditingEmployee(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(employee: Employee) {
    setEditingEmployee(employee);
    setFormError(null);
    form.reset(getDefaultValues(employee));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingEmployee(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingEmployee) {
        await updateMutation.mutateAsync({ id: editingEmployee.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as EmployeeCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const employees = employeesQuery.data?.employees ?? [];
  const isLoading =
    employeesQuery.isLoading ||
    companiesQuery.isLoading ||
    positionsQuery.isLoading ||
    workShiftsQuery.isLoading;
  const loadError =
    employeesQuery.error ?? companiesQuery.error ?? positionsQuery.error ?? workShiftsQuery.error;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const errors = form.formState.errors;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("hr.employees.title")}</Title>
        <Button onClick={openCreateModal}>{t("hr.employees.add")}</Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("hr.employees.fields.name")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.email")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.role")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.company")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.position")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.status")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : employees.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("hr.employees.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                employees.map((employee) => (
                  <Table.Tr key={employee.id}>
                    <Table.Td>{displayName(employee.name, employee.name_en)}</Table.Td>
                    <Table.Td>{employee.email}</Table.Td>
                    <Table.Td>{t(`role.${employee.role}`)}</Table.Td>
                    <Table.Td>
                      {employee.company_id
                        ? companyById.get(employee.company_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>
                      {employee.position_id
                        ? positionById.get(employee.position_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>{t(`employeeStatus.${employee.status}`)}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openEditModal(employee)}>
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

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingEmployee ? t("hr.employees.edit") : t("hr.employees.add")}
        size="lg"
      >
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("hr.employees.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("hr.employees.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <TextInput
                label={t("hr.employees.fields.email")}
                type="email"
                error={errors.email?.message}
                {...form.register("email")}
              />
              <TextInput
                label={t("hr.employees.fields.phone")}
                error={errors.phone?.message}
                {...form.register("phone", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <TextInput
              label={t("hr.employees.fields.password")}
              type="password"
              error={errors.password?.message}
              {...form.register("password", { setValueAs: emptyToUndefined })}
            />
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select
                    label={t("hr.employees.fields.role")}
                    data={roleOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as Role)}
                    error={errors.role?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="employment_type"
                render={({ field }) => (
                  <Select
                    label={t("hr.employees.fields.employmentType")}
                    data={employmentTypeOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as EmploymentType)}
                    error={errors.employment_type?.message}
                  />
                )}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select
                    label={t("hr.employees.fields.status")}
                    data={statusOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as EmployeeStatus)}
                    error={errors.status?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="salary_currency"
                render={({ field }) => (
                  <Select
                    label={t("hr.employees.fields.salaryCurrency")}
                    data={currencyOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as Currency)}
                    error={errors.salary_currency?.message}
                  />
                )}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="payroll_scheme"
                render={({ field }) => (
                  <Select
                    label={t("hr.employees.fields.payrollScheme")}
                    data={payrollSchemeOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as PayrollScheme | null)}
                    error={errors.payroll_scheme?.message}
                    clearable
                  />
                )}
              />
              <TextInput
                label={t("hr.employees.fields.joinDate")}
                placeholder="YYYY-MM-DD"
                error={errors.join_date?.message}
                {...form.register("join_date", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="company_id"
                render={({ field }) => (
                  <Select
                    label={t("hr.employees.fields.company")}
                    data={companyOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value ?? undefined)}
                    error={errors.company_id?.message}
                    clearable
                  />
                )}
              />
              <Controller
                control={form.control}
                name="position_id"
                render={({ field }) => (
                  <Input.Wrapper label={t("hr.employees.fields.position")} error={errors.position_id?.message}>
                    <PositionSelect
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value ?? undefined)}
                    />
                  </Input.Wrapper>
                )}
              />
            </Group>
            <Controller
              control={form.control}
              name="shift_id"
              render={({ field }) => (
                <Select
                  label={t("hr.employees.fields.shift")}
                  data={shiftOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  error={errors.shift_id?.message}
                  clearable
                />
              )}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSaving}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
