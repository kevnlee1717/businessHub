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
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  dataScopes,
  permissionCatalog,
  positionCreateSchema,
  positionUpdateSchema,
  type DataScope,
  type PositionCreateInput,
  type PositionUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createPosition, listPositions, updatePosition, type Position } from "../../api/hr";

type PositionFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  note?: string | null | undefined;
  permissions?: string[] | undefined;
  data_scope?: DataScope | undefined;
  sort_order?: number | undefined;
};

const positionQueryKey = ["hr", "positions"] as const;

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

const dataScopeLabels: Record<DataScope, string> = {
  all: "全部公司+全部数据",
  company: "本公司全部",
  self: "仅本人"
};

function getDefaultValues(position?: Position): PositionFormValues {
  return {
    name: position?.name ?? "",
    name_en: position?.name_en ?? undefined,
    note: position?.note ?? null,
    permissions: position?.permissions ?? [],
    data_scope: position?.data_scope ?? "self",
    sort_order: position?.sort_order ?? 0
  };
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function PositionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const positionsQuery = useQuery({
    queryKey: positionQueryKey,
    queryFn: listPositions
  });

  const form = useForm<PositionFormValues>({
    resolver: zodResolver(
      editingPosition ? positionUpdateSchema : positionCreateSchema
    ) as Resolver<PositionFormValues>,
    defaultValues: getDefaultValues(editingPosition ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createPosition,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: positionQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PositionUpdateInput }) => updatePosition(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: positionQueryKey });
      closeModal();
    }
  });

  const positions = positionsQuery.data?.positions ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const errors = form.formState.errors;
  const selectedPermissions = form.watch("permissions") ?? [];

  function openCreateModal() {
    setEditingPosition(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(position: Position) {
    if (position.is_system) {
      setFormError("系统岗位不可在前端编辑");
      return;
    }

    setEditingPosition(position);
    setFormError(null);
    form.reset(getDefaultValues(position));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingPosition(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingPosition) {
        await updateMutation.mutateAsync({ id: editingPosition.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as PositionCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  function setGroupPermissions(permissionKeys: string[], checked: boolean) {
    const current = form.getValues("permissions") ?? [];
    const next = checked
      ? Array.from(new Set([...current, ...permissionKeys]))
      : current.filter((permission) => !permissionKeys.includes(permission));
    form.setValue("permissions", next, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Button onClick={openCreateModal}>{t("position.add")}</Button>
      </Group>

      {positionsQuery.error ? (
        <Alert color="red" variant="light">
          {positionsQuery.error instanceof Error ? positionsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={640} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("position.fields.name")}</Table.Th>
                <Table.Th>数据范围</Table.Th>
                <Table.Th>{t("position.fields.note")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {positionsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : positions.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("position.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                positions.map((position) => (
                  <Table.Tr key={position.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <Text>{displayName(position.name, position.name_en)}</Text>
                        {position.is_system ? (
                          <Badge size="xs" variant="light">
                            系统
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>{dataScopeLabels[position.data_scope]}</Table.Td>
                    <Table.Td>{position.note ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      {position.is_system ? (
                        <Text size="sm" c="dimmed">
                          不可编辑
                        </Text>
                      ) : (
                        <Button size="xs" variant="light" onClick={() => openEditModal(position)}>
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
        title={editingPosition ? t("position.edit") : t("position.add")}
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
                label={t("position.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("position.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Textarea
              label={t("position.fields.note")}
              error={errors.note?.message}
              {...form.register("note", { setValueAs: emptyToNull })}
            />
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="data_scope"
                render={({ field }) => (
                  <Select
                    label="数据范围"
                    data={dataScopes.map((scope) => ({
                      value: scope,
                      label: dataScopeLabels[scope]
                    }))}
                    value={field.value ?? "self"}
                    onChange={(value) => field.onChange((value ?? "self") as DataScope)}
                    error={errors.data_scope?.message}
                    allowDeselect={false}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <NumberInput
                    label="排序"
                    value={field.value ?? 0}
                    onChange={(value) => field.onChange(typeof value === "number" ? value : 0)}
                    error={errors.sort_order?.message}
                    allowDecimal={false}
                  />
                )}
              />
            </Group>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={700}>功能权限</Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      form.setValue(
                        "permissions",
                        permissionCatalog.flatMap((group) => group.permissions.map((permission) => permission.key)),
                        { shouldDirty: true, shouldValidate: true }
                      )
                    }
                  >
                    全选
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => form.setValue("permissions", [], { shouldDirty: true, shouldValidate: true })}
                  >
                    清空
                  </Button>
                </Group>
              </Group>
              {permissionCatalog.map((group) => {
                const permissionKeys = group.permissions.map((permission) => permission.key);
                const allChecked = permissionKeys.every((permission) => selectedPermissions.includes(permission));

                return (
                  <Paper key={group.key} withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={700}>{group.label}</Text>
                        <Checkbox
                          label="本组全选"
                          checked={allChecked}
                          onChange={(event) => setGroupPermissions(permissionKeys, event.currentTarget.checked)}
                        />
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        {group.permissions.map((permission) => (
                          <Controller
                            key={permission.key}
                            control={form.control}
                            name="permissions"
                            render={({ field }) => (
                              <Checkbox
                                label={permission.label}
                                checked={(field.value ?? []).includes(permission.key)}
                                onChange={(event) => {
                                  const current = field.value ?? [];
                                  field.onChange(
                                    event.currentTarget.checked
                                      ? Array.from(new Set([...current, permission.key]))
                                      : current.filter((item) => item !== permission.key)
                                  );
                                }}
                              />
                            )}
                          />
                        ))}
                      </SimpleGrid>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
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
