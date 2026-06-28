import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
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
  documentCategoryCreateSchema,
  type DocumentCategoryCreateInput,
  type DocumentCategoryUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createDocumentCategory,
  listDocumentCategories,
  updateDocumentCategory,
  type DocumentCategory
} from "../../api/dms";

type CategoryFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  active?: boolean | undefined;
};

const categoriesQueryKey = ["documents", "categories"] as const;

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function getDefaultValues(category?: DocumentCategory): CategoryFormValues {
  return {
    name: category?.name ?? "",
    name_en: category?.name_en ?? undefined,
    active: category?.active ?? true
  };
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<DocumentCategory | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey,
    queryFn: listDocumentCategories
  });
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(documentCategoryCreateSchema) as Resolver<CategoryFormValues>,
    defaultValues: getDefaultValues(editingCategory ?? undefined)
  });
  const createMutation = useMutation({
    mutationFn: createDocumentCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      closeModal();
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DocumentCategoryUpdateInput }) =>
      updateDocumentCategory(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      closeModal();
    }
  });

  const categories = categoriesQuery.data?.categories ?? [];
  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreateModal() {
    setEditingCategory(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(category: DocumentCategory) {
    setEditingCategory(category);
    setFormError(null);
    form.reset(getDefaultValues(category));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingCategory(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const body = values as DocumentCategoryCreateInput;

      if (editingCategory) {
        await updateMutation.mutateAsync({ id: editingCategory.id, body });
        return;
      }

      await createMutation.mutateAsync(body);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("documentCategory.title")}</Title>
        <Button onClick={openCreateModal}>{t("documentCategory.add")}</Button>
      </Group>

      {categoriesQuery.error ? (
        <Alert color="red" variant="light">
          {categoriesQuery.error instanceof Error ? categoriesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("documentCategory.fields.name")}</Table.Th>
                <Table.Th>{t("documentCategory.fields.nameEn")}</Table.Th>
                <Table.Th>{t("documentCategory.fields.active")}</Table.Th>
                <Table.Th>{t("documentCategory.fields.isSystem")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {categoriesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : categories.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("documentCategory.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                categories.map((category) => (
                  <Table.Tr key={category.id}>
                    <Table.Td>{category.name}</Table.Td>
                    <Table.Td>{category.name_en ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      <Badge color={category.active ? "green" : "gray"} variant="light">
                        {category.active ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={category.is_system ? "blue" : "gray"} variant="light">
                        {category.is_system ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {category.is_system ? (
                        <Text size="sm" c="dimmed">
                          {t("documentCategory.systemReadonly")}
                        </Text>
                      ) : (
                        <Button size="xs" variant="light" onClick={() => openEditModal(category)}>
                          {t("common.edit")}
                        </Button>
                      )}
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
        title={editingCategory ? t("documentCategory.edit") : t("documentCategory.add")}
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
                label={t("documentCategory.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("documentCategory.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            {editingCategory?.is_system ? (
              <TextInput label={t("documentCategory.fields.isSystem")} value={t("common.yes")} disabled />
            ) : null}
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Checkbox
                  label={t("documentCategory.fields.active")}
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
