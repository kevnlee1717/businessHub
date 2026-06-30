import { Alert, Button, Group, Loader, Paper, ScrollArea, Stack, Table, Text, Title } from "@mantine/core";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listStudents, type Student } from "../../api/education";
import { useCan } from "../../auth/permissions";
import { StudentFormModal } from "../../components/StudentFormModal";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

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

export function StudentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const canManageEducation = useCan("education.manage");
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const studentsQuery = useQuery({
    queryKey: [...studentsQueryKey, page, pageSize],
    queryFn: () => listStudents({ page, page_size: pageSize }),
    placeholderData: keepPreviousData
  });

  const students = studentsQuery.data?.students ?? [];
  const totalStudents = studentsQuery.data?.total ?? students.length;

  function openCreateModal() {
    setEditingStudent(null);
    setModalOpened(true);
  }

  function openEditModal(student: Student) {
    setEditingStudent(student);
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingStudent(null);
  }

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
          <Table miw={840} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
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
      <TablePagination
        total={totalStudents}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <StudentFormModal
        opened={modalOpened}
        onClose={closeModal}
        initialValues={editingStudent}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: studentsQueryKey });
        }}
      />
    </Stack>
  );
}
