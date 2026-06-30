import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
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
  collectionItemCreateSchema,
  collectionItemUpdateSchema,
  schemeLineRecurrences,
  type CollectionItemCreateInput,
  type CollectionItemUpdateInput,
  type SchemeLineRecurrence
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createCollectionItem,
  getCollectionItems,
  updateCollectionItem,
  type CollectionItem
} from "../../api/collectionItems";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type CollectionItemFormValues = {
  code?: string | undefined;
  name?: string | undefined;
  name_en?: string | null | undefined;
  default_recurrence?: SchemeLineRecurrence | null | undefined;
  active?: boolean | undefined;
  sort_order?: number | undefined;
};

const collectionItemsQueryKey = ["collection-items"] as const;

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function getDefaultValues(item?: CollectionItem): CollectionItemFormValues {
  return {
    code: item?.code ?? "",
    name: item?.name ?? "",
    name_en: item?.name_en ?? null,
    default_recurrence: item?.default_recurrence ?? null,
    active: item?.active ?? true,
    sort_order: item?.sort_order ?? 0
  };
}

export function CollectionItemsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const itemsQuery = useQuery({
    queryKey: collectionItemsQueryKey,
    queryFn: () => getCollectionItems()
  });

  const form = useForm<CollectionItemFormValues>({
    resolver: zodResolver(
      editingItem ? collectionItemUpdateSchema : collectionItemCreateSchema
    ) as Resolver<CollectionItemFormValues>,
    defaultValues: getDefaultValues(editingItem ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createCollectionItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: collectionItemsQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CollectionItemUpdateInput }) => updateCollectionItem(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: collectionItemsQueryKey });
      closeModal();
    }
  });

  // 收款项目是方案/账单表单复用的基础数据；保持全量请求，在前端切片分页。
  const items = itemsQuery.data?.collection_items ?? [];
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);
  const recurrenceOptions = schemeLineRecurrences.map((recurrence) => ({
    value: recurrence,
    label: t(`schemeLineRecurrence.${recurrence}`)
  }));
  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreateModal() {
    setEditingItem(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(item: CollectionItem) {
    setEditingItem(item);
    setFormError(null);
    form.reset(getDefaultValues(item));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingItem(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const body = {
        ...values,
        name_en: values.name_en ?? null,
        default_recurrence: values.default_recurrence ?? null,
        active: values.active ?? true,
        sort_order: values.sort_order ?? 0
      };

      if (editingItem) {
        const updateBody = editingItem.is_system ? { ...body, code: undefined } : body;
        await updateMutation.mutateAsync({ id: editingItem.id, body: updateBody });
        return;
      }

      await createMutation.mutateAsync(body as CollectionItemCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Button onClick={openCreateModal}>{t("collectionItem.add")}</Button>
      </Group>

      {itemsQuery.error ? (
        <Alert color="red" variant="light">
          {itemsQuery.error instanceof Error ? itemsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={820} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("collectionItem.fields.name")}</Table.Th>
                <Table.Th>{t("collectionItem.fields.nameEn")}</Table.Th>
                <Table.Th>{t("collectionItem.fields.defaultRecurrence")}</Table.Th>
                <Table.Th>{t("collectionItem.fields.active")}</Table.Th>
                <Table.Th>{t("collectionItem.fields.isSystem")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {itemsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : items.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("collectionItem.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                visibleItems.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm">{displayName(item.name, item.name_en)}</Text>
                        <Text size="xs" c="dimmed">
                          {item.code}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{item.name_en ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      {item.default_recurrence
                        ? t(`schemeLineRecurrence.${item.default_recurrence}`)
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={item.active ? "green" : "gray"} variant="light">
                        {item.active ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={item.is_system ? "blue" : "gray"} variant="light">
                        {item.is_system ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openEditModal(item)}>
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
        total={items.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingItem ? t("collectionItem.edit") : t("collectionItem.add")}
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
                label={t("collectionItem.fields.code")}
                disabled={Boolean(editingItem?.is_system)}
                error={errors.code?.message}
                {...form.register("code")}
              />
              <TextInput
                label={t("collectionItem.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
            </Group>
            <Group grow align="flex-start">
              <TextInput
                label={t("collectionItem.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToNull })}
              />
              <Controller
                control={form.control}
                name="default_recurrence"
                render={({ field }) => (
                  <Select
                    label={t("collectionItem.fields.defaultRecurrence")}
                    data={recurrenceOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as SchemeLineRecurrence | null)}
                    clearable
                    error={errors.default_recurrence?.message}
                  />
                )}
              />
            </Group>
            <Group align="flex-end">
              <Controller
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <NumberInput
                    label={t("collectionItem.fields.sortOrder")}
                    value={field.value ?? 0}
                    onChange={(value) => field.onChange(typeof value === "number" ? value : 0)}
                    error={errors.sort_order?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="active"
                render={({ field }) => (
                  <Checkbox
                    label={t("collectionItem.fields.active")}
                    checked={field.value ?? true}
                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                    pb={8}
                  />
                )}
              />
            </Group>
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
