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
  can,
  diplomaEnrollmentCreateSchema,
  diplomaEnrollmentUpdateSchema,
  type DiplomaEnrollmentCreateInput,
  type DiplomaEnrollmentUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createDiplomaEnrollment,
  listDiplomaEnrollments,
  listStudents,
  updateDiplomaEnrollment,
  type DiplomaEnrollment
} from "../../api/education";
import { useAuth } from "../../auth/AuthContext";
import { displayStudentName, studentsQueryKey } from "./StudentsPage";

type DiplomaFormValues = {
  student_id?: string | undefined;
  program?: string | undefined;
  enroll_date?: string | undefined;
  installments_count?: number | null | undefined;
  graduated?: boolean | undefined;
};

const diplomaQueryKey = ["education", "diploma-enrollments"] as const;

function numberOrNull(value: string | number) {
  if (value === "") {
    return null;
  }

  return value;
}

function getDefaultValues(enrollment?: DiplomaEnrollment): DiplomaFormValues {
  return {
    student_id: enrollment?.student_id ?? undefined,
    program: enrollment?.program ?? "",
    enroll_date: enrollment?.enroll_date ?? undefined,
    installments_count: enrollment?.installments_count ?? null,
    graduated: enrollment?.graduated ?? false
  };
}

export function DiplomaPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [editingEnrollment, setEditingEnrollment] = useState<DiplomaEnrollment | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canManageEducation = user ? can(user.role, "education.manage") : false;

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: listStudents
  });

  const enrollmentsQuery = useQuery({
    queryKey: [...diplomaQueryKey, studentFilter],
    queryFn: () => listDiplomaEnrollments(studentFilter ?? undefined)
  });

  const form = useForm<DiplomaFormValues>({
    resolver: zodResolver(
      editingEnrollment ? diplomaEnrollmentUpdateSchema : diplomaEnrollmentCreateSchema
    ) as Resolver<DiplomaFormValues>,
    defaultValues: getDefaultValues(editingEnrollment ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createDiplomaEnrollment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: diplomaQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DiplomaEnrollmentUpdateInput }) =>
      updateDiplomaEnrollment(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: diplomaQueryKey });
      closeModal();
    }
  });

  const students = studentsQuery.data?.students ?? [];
  const enrollments = enrollmentsQuery.data?.enrollments ?? [];
  const studentOptions = students.map((student) => ({
    value: student.id,
    label: displayStudentName(student)
  }));
  const studentsById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreateModal() {
    setEditingEnrollment(null);
    setFormError(null);
    form.reset({ ...getDefaultValues(), student_id: studentFilter ?? undefined });
    setModalOpened(true);
  }

  function openEditModal(enrollment: DiplomaEnrollment) {
    setEditingEnrollment(enrollment);
    setFormError(null);
    form.reset(getDefaultValues(enrollment));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingEnrollment(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingEnrollment) {
        await updateMutation.mutateAsync({
          id: editingEnrollment.id,
          body: {
            installments_count: values.installments_count ?? null,
            graduated: values.graduated ?? false
          }
        });
        return;
      }

      await createMutation.mutateAsync({
        ...values,
        installments_count: values.installments_count ?? null
      } as DiplomaEnrollmentCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Group align="flex-end">
          <Title order={2}>{t("diploma.title")}</Title>
          <Select
            label={t("diploma.filters.student")}
            placeholder={t("common.all")}
            data={studentOptions}
            value={studentFilter}
            onChange={setStudentFilter}
            clearable
            searchable
            w={260}
          />
        </Group>
        {canManageEducation ? <Button onClick={openCreateModal}>{t("diploma.add")}</Button> : null}
      </Group>

      {studentsQuery.error || enrollmentsQuery.error ? (
        <Alert color="red" variant="light">
          {studentsQuery.error instanceof Error
            ? studentsQuery.error.message
            : enrollmentsQuery.error instanceof Error
              ? enrollmentsQuery.error.message
              : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={900} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("diploma.fields.student")}</Table.Th>
                <Table.Th>{t("diploma.fields.program")}</Table.Th>
                <Table.Th>{t("diploma.fields.enrollDate")}</Table.Th>
                <Table.Th>{t("diploma.fields.installmentsCount")}</Table.Th>
                <Table.Th>{t("diploma.fields.graduated")}</Table.Th>
                {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {enrollmentsQuery.isLoading || studentsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 6 : 5}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : enrollments.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 6 : 5}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("diploma.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                enrollments.map((enrollment) => (
                  <Table.Tr key={enrollment.id}>
                    <Table.Td>
                      {displayStudentName(studentsById.get(enrollment.student_id)) || t("common.not_available")}
                    </Table.Td>
                    <Table.Td>{enrollment.program}</Table.Td>
                    <Table.Td>{enrollment.enroll_date ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{enrollment.installments_count ?? t("common.not_available")}</Table.Td>
                    <Table.Td>
                      <Badge color={enrollment.graduated ? "green" : "gray"} variant="light">
                        {enrollment.graduated ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                    {canManageEducation ? (
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => openEditModal(enrollment)}>
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
        title={editingEnrollment ? t("diploma.edit") : t("diploma.add")}
        size="lg"
      >
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            {editingEnrollment ? null : (
              <Controller
                control={form.control}
                name="student_id"
                render={({ field }) => (
                  <Select
                    label={t("diploma.fields.student")}
                    data={studentOptions}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    error={errors.student_id?.message}
                    searchable
                    withAsterisk
                  />
                )}
              />
            )}
            {editingEnrollment ? null : (
              <Group grow align="flex-start">
                <TextInput
                  label={t("diploma.fields.program")}
                  error={errors.program?.message}
                  {...form.register("program")}
                />
                <TextInput
                  label={t("diploma.fields.enrollDate")}
                  placeholder="YYYY-MM-DD"
                  error={errors.enroll_date?.message}
                  {...form.register("enroll_date")}
                />
              </Group>
            )}
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="installments_count"
                render={({ field }) => (
                  <NumberInput
                    label={t("diploma.fields.installmentsCount")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={errors.installments_count?.message}
                    min={0}
                    allowDecimal={false}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="graduated"
                render={({ field }) => (
                  <Checkbox
                    label={t("diploma.fields.graduated")}
                    checked={field.value ?? false}
                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                    mt={30}
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
