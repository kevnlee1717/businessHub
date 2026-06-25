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
  can,
  studentCreateSchema,
  studentUpdateSchema,
  type StudentCreateInput,
  type StudentUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { createStudent, listStudents, updateStudent, type Student } from "../../api/education";
import { useAuth } from "../../auth/AuthContext";

type StudentFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  note?: string | null | undefined;
};

export const studentsQueryKey = ["education", "students"] as const;

export const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

export const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

export function displayStudentName(student?: Pick<Student, "name" | "name_en"> | null) {
  if (!student) {
    return "";
  }

  return student.name_en ? `${student.name} / ${student.name_en}` : student.name;
}

function getDefaultValues(student?: Student): StudentFormValues {
  return {
    name: student?.name ?? "",
    name_en: student?.name_en ?? undefined,
    phone: student?.phone ?? undefined,
    email: student?.email ?? undefined,
    note: student?.note ?? null
  };
}

export function StudentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canManageEducation = user ? can(user.role, "education.manage") : false;

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: listStudents
  });

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(
      editingStudent ? studentUpdateSchema : studentCreateSchema
    ) as Resolver<StudentFormValues>,
    defaultValues: getDefaultValues(editingStudent ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createStudent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentsQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: StudentUpdateInput }) => updateStudent(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentsQueryKey });
      closeModal();
    }
  });

  const students = studentsQuery.data?.students ?? [];
  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreateModal() {
    setEditingStudent(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(student: Student) {
    setEditingStudent(student);
    setFormError(null);
    form.reset(getDefaultValues(student));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingStudent(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingStudent) {
        await updateMutation.mutateAsync({ id: editingStudent.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as StudentCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("student.title")}</Title>
        {canManageEducation ? <Button onClick={openCreateModal}>{t("student.add")}</Button> : null}
      </Group>

      {studentsQuery.error ? (
        <Alert color="red" variant="light">
          {studentsQuery.error instanceof Error ? studentsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={840} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("student.fields.name")}</Table.Th>
                <Table.Th>{t("student.fields.phone")}</Table.Th>
                <Table.Th>{t("student.fields.email")}</Table.Th>
                <Table.Th>{t("student.fields.note")}</Table.Th>
                {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {studentsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 5 : 4}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : students.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 5 : 4}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("student.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                students.map((student) => (
                  <Table.Tr key={student.id}>
                    <Table.Td>{displayStudentName(student)}</Table.Td>
                    <Table.Td>{student.phone ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{student.email ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{student.note ?? t("common.not_available")}</Table.Td>
                    {canManageEducation ? (
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => openEditModal(student)}>
                          {t("common.edit")}
                        </Button>
                      </Table.Td>
                    ) : null}
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
        title={editingStudent ? t("student.edit") : t("student.add")}
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
              <TextInput label={t("student.fields.name")} error={errors.name?.message} {...form.register("name")} />
              <TextInput
                label={t("student.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <TextInput
                label={t("student.fields.phone")}
                error={errors.phone?.message}
                {...form.register("phone", { setValueAs: emptyToUndefined })}
              />
              <TextInput
                label={t("student.fields.email")}
                error={errors.email?.message}
                {...form.register("email", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Textarea
              label={t("student.fields.note")}
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
