import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  industryCreateSchema,
  industryUpdateSchema,
  type IndustryCreateInput,
  type IndustryUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createIndustry,
  deleteIndustry,
  listIndustries,
  updateIndustry,
  type Industry
} from "../../api/hr";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type IndustryFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  active?: boolean | undefined;
};

const industryQueryKey = ["hr", "industries"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function getDefaultValues(industry?: Industry): IndustryFormValues {
  return {
    name: industry?.name ?? "",
    name_en: industry?.name_en ?? undefined,
    active: industry?.active ?? true
  };
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function IndustriesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingIndustry, setEditingIndustry] = useState<Industry | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const industriesQuery = useQuery({
    queryKey: industryQueryKey,
    queryFn: () => listIndustries()
  });

  const form = useForm<IndustryFormValues>({
    resolver: zodResolver(
      editingIndustry ? industryUpdateSchema : industryCreateSchema
    ) as Resolver<IndustryFormValues>,
    defaultValues: getDefaultValues(editingIndustry ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createIndustry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: industryQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: IndustryUpdateInput }) => updateIndustry(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: industryQueryKey });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIndustry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: industryQueryKey });
    }
  });

  // 行业是基础下拉数据；保持全量请求，在前端切片分页。
  const industries = industriesQuery.data?.industries ?? [];
  const visibleIndustries = industries.slice((page - 1) * pageSize, page * pageSize);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const errors = form.formState.errors;

  function openCreateModal() {
    setEditingIndustry(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(industry: Industry) {
    setEditingIndustry(industry);
    setFormError(null);
    form.reset(getDefaultValues(industry));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingIndustry(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  async function handleDelete(industry: Industry) {
    if (!window.confirm(t("industry.confirmDelete", { name: industry.name }))) {
      return;
    }

    await deleteMutation.mutateAsync(industry.id);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingIndustry) {
        await updateMutation.mutateAsync({ id: editingIndustry.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as IndustryCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Button onClick={openCreateModal}>{t("industry.add")}</Button>
      </Group>

      {industriesQuery.error ? (
        <Alert color="red" variant="light">
          {industriesQuery.error instanceof Error ? industriesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={640} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("industry.fields.name")}</Table.Th>
                <Table.Th>{t("industry.fields.active")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {industriesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : industries.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("industry.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                visibleIndustries.map((industry) => (
                  <Table.Tr key={industry.id}>
                    <Table.Td>{displayName(industry.name, industry.name_en)}</Table.Td>
                    <Table.Td>{industry.active ? t("common.yes") : t("common.no")}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button size="xs" variant="light" onClick={() => openEditModal(industry)}>
                          {t("common.edit")}
                        </Button>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          loading={deleteMutation.isPending}
                          onClick={() => void handleDelete(industry)}
                        >
                          {t("common.delete")}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>
      <TablePagination
        total={industries.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingIndustry ? t("industry.edit") : t("industry.add")}
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
                label={t("industry.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("industry.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Checkbox
                  label={t("industry.fields.active")}
                  checked={field.value ?? true}
                  onChange={(event) => field.onChange(event.currentTarget.checked)}
                  error={errors.active?.message}
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
