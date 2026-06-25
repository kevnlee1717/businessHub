import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import {
  companyCreateSchema,
  companyUpdateSchema,
  companyStatuses,
  type CompanyStatus,
  type CompanyCreateInput,
  type CompanyUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createCompany, listCompanies, listIndustries, updateCompany, type Company } from "../../api/hr";

type CompanyFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  uen?: string | undefined;
  industry_id?: string | null | undefined;
  status?: CompanyStatus | undefined;
  note?: string | null | undefined;
};

const companyQueryKey = ["hr", "companies"] as const;
const industryQueryKey = ["hr", "industries"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

function getDefaultValues(company?: Company): CompanyFormValues {
  return {
    name: company?.name ?? "",
    name_en: company?.name_en ?? undefined,
    uen: company?.uen ?? undefined,
    industry_id: company?.industry_id ?? null,
    status: isCompanyStatus(company?.status) ? company.status : undefined,
    note: company?.note ?? null
  };
}

function isCompanyStatus(value: string | null | undefined): value is CompanyStatus {
  return companyStatuses.includes(value as CompanyStatus);
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function CompaniesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: listCompanies
  });

  const industriesQuery = useQuery({
    queryKey: industryQueryKey,
    queryFn: listIndustries
  });

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(
      editingCompany ? companyUpdateSchema : companyCreateSchema
    ) as Resolver<CompanyFormValues>,
    defaultValues: getDefaultValues(editingCompany ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CompanyUpdateInput }) => updateCompany(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      closeModal();
    }
  });

  const companies = companiesQuery.data?.companies ?? [];
  const industries = industriesQuery.data?.industries ?? [];
  const industryById = useMemo(
    () => new Map(industries.map((industry) => [industry.id, industry])),
    [industries]
  );
  const industryOptions = industries.map((industry) => ({
    value: industry.id,
    label: displayName(industry.name, industry.name_en)
  }));
  const statusOptions = companyStatuses.map((status) => ({
    value: status,
    label: t(`companyStatus.${status}`)
  }));
  const loadError = companiesQuery.error ?? industriesQuery.error;
  const isLoading = companiesQuery.isLoading || industriesQuery.isLoading;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const errors = form.formState.errors;

  function openCreateModal() {
    setEditingCompany(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(company: Company) {
    setEditingCompany(company);
    setFormError(null);
    form.reset(getDefaultValues(company));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingCompany(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingCompany) {
        await updateMutation.mutateAsync({ id: editingCompany.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as CompanyCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("company.title")}</Title>
        <Button onClick={openCreateModal}>{t("company.add")}</Button>
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
                <Table.Th>{t("company.fields.name")}</Table.Th>
                <Table.Th>{t("company.fields.uen")}</Table.Th>
                <Table.Th>{t("company.fields.industry")}</Table.Th>
                <Table.Th>{t("company.fields.status")}</Table.Th>
                <Table.Th>{t("company.fields.note")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : companies.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("company.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                companies.map((company) => (
                  <Table.Tr key={company.id}>
                    <Table.Td>{displayName(company.name, company.name_en)}</Table.Td>
                    <Table.Td>{company.uen ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      {company.industry_id
                        ? industryById.get(company.industry_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>
                      {isCompanyStatus(company.status)
                        ? t(`companyStatus.${company.status}`)
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>{company.note ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openEditModal(company)}>
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
        title={editingCompany ? t("company.edit") : t("company.add")}
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
                label={t("company.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("company.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <TextInput
                label={t("company.fields.uen")}
                error={errors.uen?.message}
                {...form.register("uen", { setValueAs: emptyToUndefined })}
              />
              <Controller
                control={form.control}
                name="industry_id"
                render={({ field }) => (
                  <Select
                    label={t("company.fields.industry")}
                    data={industryOptions}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    error={errors.industry_id?.message}
                    clearable
                    searchable
                  />
                )}
              />
            </Group>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select
                  label={t("company.fields.status")}
                  data={statusOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(isCompanyStatus(value) ? value : undefined)}
                  error={errors.status?.message}
                  clearable
                />
              )}
            />
            <Textarea
              label={t("company.fields.note")}
              error={errors.note?.message}
              {...form.register("note", { setValueAs: emptyToNull })}
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
