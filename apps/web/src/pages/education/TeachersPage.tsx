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
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import {
  teacherCreateSchema,
  teacherUpdateSchema,
  type TeacherCreateInput,
  type TeacherUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createTeacher, deleteTeacher, listTeachers, updateTeacher, type Teacher } from "../../api/teachers";
import { useCan } from "../../auth/permissions";
import { teachersQueryKey } from "../../components/TeacherMultiSelect";

type TeacherFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  phone?: string | undefined;
  note?: string | undefined;
  active?: boolean | undefined;
};

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function displayName(teacher: { name: string; name_en?: string | null }) {
  return teacher.name_en ? `${teacher.name} / ${teacher.name_en}` : teacher.name;
}

function getDefaultValues(teacher?: Teacher): TeacherFormValues {
  return {
    name: teacher?.name ?? "",
    name_en: teacher?.name_en ?? undefined,
    phone: teacher?.phone ?? undefined,
    note: teacher?.note ?? undefined,
    active: teacher?.active ?? true
  };
}

export function TeachersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManageEducation = useCan("education.manage");
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const teachersQuery = useQuery({
    queryKey: teachersQueryKey,
    queryFn: () => listTeachers()
  });

  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(editingTeacher ? teacherUpdateSchema : teacherCreateSchema) as Resolver<TeacherFormValues>,
    defaultValues: getDefaultValues()
  });

  const createMutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teachersQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TeacherUpdateInput }) => updateTeacher(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teachersQueryKey });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTeacher,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teachersQueryKey });
    }
  });

  const teachers = teachersQuery.data?.teachers ?? [];
  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreateModal() {
    setEditingTeacher(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(teacher: Teacher) {
    setEditingTeacher(teacher);
    setFormError(null);
    form.reset(getDefaultValues(teacher));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingTeacher(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingTeacher) {
        await updateMutation.mutateAsync({ id: editingTeacher.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as TeacherCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("teachers.saveFailed"));
    }
  });

  async function handleDelete(teacher: Teacher) {
    if (!window.confirm(t("teachers.confirmDelete", { name: displayName(teacher) }))) {
      return;
    }

    await deleteMutation.mutateAsync(teacher.id);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("teachers.title")}</Title>
        {canManageEducation ? <Button onClick={openCreateModal}>{t("teachers.add")}</Button> : null}
      </Group>

      {teachersQuery.error ? (
        <Alert color="red" variant="light">
          {teachersQuery.error instanceof Error ? teachersQuery.error.message : t("teachers.loadFailed")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={780} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("teachers.fields.name")}</Table.Th>
                <Table.Th>{t("teachers.fields.phone")}</Table.Th>
                <Table.Th>{t("teachers.fields.note")}</Table.Th>
                <Table.Th>{t("teachers.fields.status")}</Table.Th>
                {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {teachersQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 5 : 4}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : teachers.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 5 : 4}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("teachers.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                teachers.map((teacher) => (
                  <Table.Tr key={teacher.id}>
                    <Table.Td>{displayName(teacher)}</Table.Td>
                    <Table.Td>{teacher.phone ?? "-"}</Table.Td>
                    <Table.Td>{teacher.note ?? "-"}</Table.Td>
                    <Table.Td>
                      <Badge color={teacher.active ? "green" : "gray"} variant="light">
                        {teacher.active ? t("teachers.active") : t("teachers.inactive")}
                      </Badge>
                    </Table.Td>
                    {canManageEducation ? (
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => openEditModal(teacher)}>
                            {t("common.edit")}
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            color={teacher.active ? "yellow" : "green"}
                            loading={updateMutation.isPending}
                            onClick={() =>
                              updateMutation.mutate({
                                id: teacher.id,
                                body: { active: !teacher.active }
                              })
                            }
                          >
                            {teacher.active ? t("teachers.disable") : t("teachers.enable")}
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            color="red"
                            loading={deleteMutation.isPending}
                            onClick={() => handleDelete(teacher)}
                          >
                            {t("common.delete")}
                          </Button>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal opened={modalOpened} onClose={closeModal} title={editingTeacher ? t("teachers.edit") : t("teachers.add")} size="lg">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput label={t("teachers.fields.name")} error={errors.name?.message} {...form.register("name")} />
              <TextInput
                label={t("teachers.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <TextInput
              label={t("teachers.fields.phone")}
              error={errors.phone?.message}
              {...form.register("phone", { setValueAs: emptyToUndefined })}
            />
            <Textarea
              label={t("teachers.fields.note")}
              error={errors.note?.message}
              {...form.register("note", { setValueAs: emptyToUndefined })}
            />
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Checkbox
                  label={t("teachers.active")}
                  checked={field.value ?? true}
                  onChange={(event) => field.onChange(event.currentTarget.checked)}
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
