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
  positionCreateSchema,
  positionUpdateSchema,
  type PositionCreateInput,
  type PositionUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createPosition, listPositions, updatePosition, type Position } from "../../api/hr";

type PositionFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  note?: string | null | undefined;
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

function getDefaultValues(position?: Position): PositionFormValues {
  return {
    name: position?.name ?? "",
    name_en: position?.name_en ?? undefined,
    note: position?.note ?? null
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

  function openCreateModal() {
    setEditingPosition(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(position: Position) {
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

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("position.title")}</Title>
        <Button onClick={openCreateModal}>{t("position.add")}</Button>
      </Group>

      {positionsQuery.error ? (
        <Alert color="red" variant="light">
          {positionsQuery.error instanceof Error ? positionsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={640} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("position.fields.name")}</Table.Th>
                <Table.Th>{t("position.fields.note")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {positionsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : positions.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("position.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                positions.map((position) => (
                  <Table.Tr key={position.id}>
                    <Table.Td>{displayName(position.name, position.name_en)}</Table.Td>
                    <Table.Td>{position.note ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openEditModal(position)}>
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
