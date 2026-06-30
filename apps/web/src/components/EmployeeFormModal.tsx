import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Group, Input, Modal, Select, Stack, TextInput } from "@mantine/core";
import {
  currencies,
  employeeCreateSchema,
  employeeStatuses,
  employeeUpdateSchema,
  employmentTypes,
  payrollSchemes,
  type Currency,
  type EmployeeCreateInput,
  type EmployeeStatus,
  type EmployeeUpdateInput,
  type EmploymentType,
  type PayrollScheme
} from "@bh/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createEmployee,
  listCompanies,
  listWorkShifts,
  updateEmployee,
  type Employee
} from "../api/hr";
import { PositionSelect } from "./PositionSelect";

type EmployeeFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  password?: string | undefined;
  company_id?: string | undefined;
  position_id?: string | undefined;
  shift_id?: string | undefined;
  employment_type?: EmploymentType | undefined;
  status?: EmployeeStatus | undefined;
  join_date?: string | undefined;
  payroll_scheme?: PayrollScheme | null | undefined;
  salary_currency?: Currency | undefined;
};

type EmployeeFormModalProps = {
  opened: boolean;
  onClose: () => void;
  initialValues?: Employee | null;
  initialName?: string;
  defaultPositionId?: string | null;
  onSaved: (employee: Employee) => void | Promise<void>;
};

const companyQueryKey = ["hr", "companies"] as const;
const workShiftQueryKey = ["hr", "work-shifts"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function getDefaultValues(
  employee?: Employee | null,
  initialName?: string,
  defaultPositionId?: string | null
): EmployeeFormValues {
  return {
    name: employee?.name ?? initialName ?? "",
    name_en: employee?.name_en ?? undefined,
    email: employee?.email ?? "",
    phone: employee?.phone ?? undefined,
    password: undefined,
    employment_type: employee?.employment_type ?? "full_time",
    status: employee?.status ?? "active",
    salary_currency: employee?.salary_currency ?? "SGD",
    payroll_scheme: employee?.payroll_scheme ?? null,
    company_id: employee?.company_id ?? undefined,
    position_id: employee?.position_id ?? defaultPositionId ?? undefined,
    shift_id: employee?.shift_id ?? undefined,
    join_date: employee?.join_date ?? undefined
  };
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function EmployeeFormModal({
  opened,
  onClose,
  initialValues,
  initialName,
  defaultPositionId,
  onSaved
}: EmployeeFormModalProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = Boolean(initialValues?.id);

  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: () => listCompanies()
  });
  const workShiftsQuery = useQuery({
    queryKey: workShiftQueryKey,
    queryFn: () => listWorkShifts()
  });

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(
      isEditing ? employeeUpdateSchema : employeeCreateSchema
    ) as Resolver<EmployeeFormValues>,
    defaultValues: getDefaultValues(initialValues, initialName, defaultPositionId)
  });

  const createMutation = useMutation({
    mutationFn: createEmployee
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EmployeeUpdateInput }) => updateEmployee(id, body)
  });

  useEffect(() => {
    if (!opened) {
      return;
    }

    setFormError(null);
    form.reset(getDefaultValues(initialValues, initialName, defaultPositionId));
  }, [defaultPositionId, form, initialName, initialValues, opened]);

  const companies = companiesQuery.data?.companies ?? [];
  const workShifts = workShiftsQuery.data?.work_shifts ?? [];
  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: displayName(company.name, company.name_en)
  }));
  const shiftOptions = workShifts.map((shift) => ({
    value: shift.id,
    label: shift.name
  }));
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

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const data = initialValues?.id
        ? await updateMutation.mutateAsync({ id: initialValues.id, body: values })
        : await createMutation.mutateAsync(values as EmployeeCreateInput);
      await onSaved(data.employee);
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const title = isEditing ? t("hr.employees.edit") : t("hr.employees.add");

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {formError ? (
            <Alert color="red" variant="light">
              {formError}
            </Alert>
          ) : null}
          {companiesQuery.error || workShiftsQuery.error ? (
            <Alert color="red" variant="light">
              {companiesQuery.error instanceof Error
                ? companiesQuery.error.message
                : workShiftsQuery.error instanceof Error
                  ? workShiftsQuery.error.message
                  : t("common.unknown_error")}
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
              name="position_id"
              render={({ field }) => (
                <Input.Wrapper label="岗位" error={errors.position_id?.message}>
                  <PositionSelect
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value ?? undefined)}
                  />
                </Input.Wrapper>
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
            <Button variant="subtle" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={isSaving}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
