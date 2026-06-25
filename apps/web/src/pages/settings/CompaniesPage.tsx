import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
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
  type CompanyCreateInput,
  type CompanyUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createCompany, listCompanies, updateCompany, type Company } from "../../api/hr";

type CompanyFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  uen?: string | undefined;
  status?: string | undefined;
  note?: string | null | undefined;
};

const companyQueryKey = ["hr", "companies"] as const;

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
    status: company?.status ?? undefined,
    note: company?.note ?? null
  };
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

      {companiesQuery.error ? (
        <Alert color="red" variant="light">
          {companiesQuery.error instanceof Error ? companiesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("company.fields.name")}</Table.Th>
                <Table.Th>{t("company.fields.uen")}</Table.Th>
                <Table.Th>{t("company.fields.status")}</Table.Th>
                <Table.Th>{t("company.fields.note")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {companiesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : companies.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
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
                    <Table.Td>{company.status ?? t("common.not_available")}</Table.Td>
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
              <TextInput
                label={t("company.fields.status")}
                error={errors.status?.message}
                {...form.register("status", { setValueAs: emptyToUndefined })}
              />
            </Group>
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
