import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
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
  Title
} from "@mantine/core";
import {
  can,
  wsqCourseCreateSchema,
  wsqCourseUpdateSchema,
  wsqEnrollmentCreateSchema,
  type WsqCourseCreateInput,
  type WsqCourseUpdateInput,
  type WsqEnrollmentCreateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createWsqCourse,
  createWsqEnrollment,
  deleteWsqEnrollment,
  listStudents,
  listWsqCourseEnrollments,
  listWsqCourses,
  updateWsqCourse,
  type WsqCourse
} from "../../api/education";
import { useAuth } from "../../auth/AuthContext";
import { displayStudentName, emptyToNull, emptyToUndefined, studentsQueryKey } from "./StudentsPage";

type CourseFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  content?: string | null | undefined;
  start_date?: string | undefined;
  duration?: string | undefined;
  price_sgd?: string | number | null | undefined;
  min_students?: number | null | undefined;
};

type EnrollmentFormValues = {
  student_id?: string | undefined;
  course_id?: string | undefined;
};

const wsqCoursesQueryKey = ["education", "wsq-courses"] as const;
const wsqEnrollmentsQueryKey = ["education", "wsq-enrollments"] as const;

function numberOrNull(value: string | number) {
  if (value === "") {
    return null;
  }

  return value;
}

function getCourseDefaultValues(course?: WsqCourse): CourseFormValues {
  return {
    name: course?.name ?? "",
    name_en: course?.name_en ?? undefined,
    content: course?.content ?? null,
    start_date: course?.start_date ?? undefined,
    duration: course?.duration ?? undefined,
    price_sgd: course?.price_sgd ?? null,
    min_students: course?.min_students ?? null
  };
}

export function WsqPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<WsqCourse | null>(null);
  const [courseModalOpened, setCourseModalOpened] = useState(false);
  const [enrollmentModalOpened, setEnrollmentModalOpened] = useState(false);
  const [courseFormError, setCourseFormError] = useState<string | null>(null);
  const [enrollmentFormError, setEnrollmentFormError] = useState<string | null>(null);
  const canManageEducation = user ? can(user.role, "education.manage") : false;

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: listStudents
  });

  const coursesQuery = useQuery({
    queryKey: wsqCoursesQueryKey,
    queryFn: listWsqCourses
  });

  const enrollmentsQuery = useQuery({
    queryKey: [...wsqEnrollmentsQueryKey, selectedCourseId],
    queryFn: () => listWsqCourseEnrollments(selectedCourseId ?? ""),
    enabled: Boolean(selectedCourseId)
  });

  const courseForm = useForm<CourseFormValues>({
    resolver: zodResolver(
      editingCourse ? wsqCourseUpdateSchema : wsqCourseCreateSchema
    ) as Resolver<CourseFormValues>,
    defaultValues: getCourseDefaultValues(editingCourse ?? undefined)
  });

  const enrollmentForm = useForm<EnrollmentFormValues>({
    resolver: zodResolver(wsqEnrollmentCreateSchema) as Resolver<EnrollmentFormValues>,
    defaultValues: { student_id: undefined, course_id: selectedCourseId ?? undefined }
  });

  const createCourseMutation = useMutation({
    mutationFn: createWsqCourse,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: wsqCoursesQueryKey });
      setSelectedCourseId(data.course.id);
      closeCourseModal();
    }
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WsqCourseUpdateInput }) => updateWsqCourse(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: wsqCoursesQueryKey });
      closeCourseModal();
    }
  });

  const createEnrollmentMutation = useMutation({
    mutationFn: createWsqEnrollment,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wsqCoursesQueryKey }),
        queryClient.invalidateQueries({ queryKey: [...wsqEnrollmentsQueryKey, variables.course_id] })
      ]);
      closeEnrollmentModal();
    }
  });

  const deleteEnrollmentMutation = useMutation({
    mutationFn: deleteWsqEnrollment,
    onSuccess: async () => {
      if (!selectedCourseId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wsqCoursesQueryKey }),
        queryClient.invalidateQueries({ queryKey: [...wsqEnrollmentsQueryKey, selectedCourseId] })
      ]);
    }
  });

  const courses = coursesQuery.data?.courses ?? [];
  const students = studentsQuery.data?.students ?? [];
  const enrollments = enrollmentsQuery.data?.enrollments ?? [];
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const courseErrors = courseForm.formState.errors;
  const enrollmentErrors = enrollmentForm.formState.errors;
  const isSavingCourse = createCourseMutation.isPending || updateCourseMutation.isPending;
  const isSavingEnrollment = createEnrollmentMutation.isPending;
  const studentOptions = students.map((student) => ({
    value: student.id,
    label: displayStudentName(student)
  }));
  const studentsById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);

  useEffect(() => {
    if (coursesQuery.isLoading) {
      return;
    }

    if (selectedCourseId && courses.some((course) => course.id === selectedCourseId)) {
      return;
    }

    setSelectedCourseId(courses[0]?.id ?? null);
  }, [courses, coursesQuery.isLoading, selectedCourseId]);

  function openCreateCourseModal() {
    setEditingCourse(null);
    setCourseFormError(null);
    courseForm.reset(getCourseDefaultValues());
    setCourseModalOpened(true);
  }

  function openEditCourseModal(course: WsqCourse) {
    setEditingCourse(course);
    setCourseFormError(null);
    courseForm.reset(getCourseDefaultValues(course));
    setCourseModalOpened(true);
  }

  function closeCourseModal() {
    setCourseModalOpened(false);
    setEditingCourse(null);
    setCourseFormError(null);
    courseForm.reset(getCourseDefaultValues());
  }

  function openEnrollmentModal() {
    setEnrollmentFormError(null);
    enrollmentForm.reset({ student_id: undefined, course_id: selectedCourseId ?? undefined });
    setEnrollmentModalOpened(true);
  }

  function closeEnrollmentModal() {
    setEnrollmentModalOpened(false);
    setEnrollmentFormError(null);
    enrollmentForm.reset({ student_id: undefined, course_id: selectedCourseId ?? undefined });
  }

  const onCourseSubmit = courseForm.handleSubmit(async (values) => {
    setCourseFormError(null);

    try {
      const body = {
        ...values,
        price_sgd: values.price_sgd ?? null,
        min_students: values.min_students ?? null
      };

      if (editingCourse) {
        await updateCourseMutation.mutateAsync({ id: editingCourse.id, body });
        return;
      }

      await createCourseMutation.mutateAsync(body as WsqCourseCreateInput);
    } catch (error) {
      setCourseFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onEnrollmentSubmit = enrollmentForm.handleSubmit(async (values) => {
    setEnrollmentFormError(null);

    try {
      await createEnrollmentMutation.mutateAsync({
        student_id: values.student_id,
        course_id: selectedCourseId
      } as WsqEnrollmentCreateInput);
    } catch (error) {
      setEnrollmentFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function handleDeleteEnrollment(id: string) {
    await deleteEnrollmentMutation.mutateAsync(id);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("wsq.title")}</Title>
        {canManageEducation ? <Button onClick={openCreateCourseModal}>{t("wsq.course.add")}</Button> : null}
      </Group>

      {studentsQuery.error || coursesQuery.error || enrollmentsQuery.error ? (
        <Alert color="red" variant="light">
          {studentsQuery.error instanceof Error
            ? studentsQuery.error.message
            : coursesQuery.error instanceof Error
              ? coursesQuery.error.message
              : enrollmentsQuery.error instanceof Error
                ? enrollmentsQuery.error.message
                : t("common.unknown_error")}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Paper withBorder radius="md">
          <ScrollArea>
            <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("wsq.course.fields.name")}</Table.Th>
                  <Table.Th>{t("wsq.course.fields.priceSgd")}</Table.Th>
                  <Table.Th>{t("wsq.course.fields.minStudents")}</Table.Th>
                  <Table.Th>{t("wsq.course.fields.enrollmentCount")}</Table.Th>
                  <Table.Th>{t("wsq.course.fields.canOpen")}</Table.Th>
                  {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {coursesQuery.isLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={canManageEducation ? 6 : 5}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : courses.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={canManageEducation ? 6 : 5}>
                      <Text ta="center" c="dimmed" py="lg">
                        {t("wsq.course.empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  courses.map((course) => (
                    <Table.Tr
                      key={course.id}
                      onClick={() => setSelectedCourseId(course.id)}
                      style={{
                        cursor: "pointer",
                        backgroundColor:
                          course.id === selectedCourseId ? "var(--mantine-color-blue-light)" : undefined
                      }}
                    >
                      <Table.Td>{displayStudentName(course)}</Table.Td>
                      <Table.Td>{course.price_sgd ?? t("common.not_available")}</Table.Td>
                      <Table.Td>{course.min_students ?? t("common.not_available")}</Table.Td>
                      <Table.Td>{course.enrollment_count}</Table.Td>
                      <Table.Td>
                        <Badge color={course.can_open ? "green" : "gray"} variant="light">
                          {course.can_open ? t("wsq.course.canOpen") : t("wsq.course.cannotOpen")}
                        </Badge>
                      </Table.Td>
                      {canManageEducation ? (
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditCourseModal(course);
                            }}
                          >
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

        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3}>{selectedCourse ? displayStudentName(selectedCourse) : t("wsq.enrollment.title")}</Title>
              {canManageEducation && selectedCourse ? (
                <Button size="sm" onClick={openEnrollmentModal}>
                  {t("wsq.enrollment.add")}
                </Button>
              ) : null}
            </Group>
            {selectedCourse ? (
              <ScrollArea>
                <Table miw={460} verticalSpacing="sm" striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("wsq.enrollment.fields.student")}</Table.Th>
                      {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {enrollmentsQuery.isLoading || studentsQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={canManageEducation ? 2 : 1}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : enrollments.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={canManageEducation ? 2 : 1}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("wsq.enrollment.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      enrollments.map((enrollment) => (
                        <Table.Tr key={enrollment.id}>
                          <Table.Td>
                            {displayStudentName(studentsById.get(enrollment.student_id)) || t("common.not_available")}
                          </Table.Td>
                          {canManageEducation ? (
                            <Table.Td>
                              <Button
                                size="xs"
                                variant="light"
                                color="red"
                                loading={deleteEnrollmentMutation.isPending}
                                onClick={() => handleDeleteEnrollment(enrollment.id)}
                              >
                                {t("wsq.enrollment.remove")}
                              </Button>
                            </Table.Td>
                          ) : null}
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : (
              <Text c="dimmed">{t("wsq.course.selectHint")}</Text>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      <Modal
        opened={courseModalOpened}
        onClose={closeCourseModal}
        title={editingCourse ? t("wsq.course.edit") : t("wsq.course.add")}
        size="lg"
      >
        <form onSubmit={onCourseSubmit}>
          <Stack gap="md">
            {courseFormError ? (
              <Alert color="red" variant="light">
                {courseFormError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("wsq.course.fields.name")}
                error={courseErrors.name?.message}
                {...courseForm.register("name")}
              />
              <TextInput
                label={t("wsq.course.fields.nameEn")}
                error={courseErrors.name_en?.message}
                {...courseForm.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Textarea
              label={t("wsq.course.fields.content")}
              error={courseErrors.content?.message}
              {...courseForm.register("content", { setValueAs: emptyToNull })}
            />
            <Group grow align="flex-start">
              <TextInput
                label={t("wsq.course.fields.startDate")}
                placeholder="YYYY-MM-DD"
                error={courseErrors.start_date?.message}
                {...courseForm.register("start_date", { setValueAs: emptyToUndefined })}
              />
              <TextInput
                label={t("wsq.course.fields.duration")}
                error={courseErrors.duration?.message}
                {...courseForm.register("duration", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={courseForm.control}
                name="price_sgd"
                render={({ field }) => (
                  <NumberInput
                    label={t("wsq.course.fields.priceSgd")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={courseErrors.price_sgd?.message}
                    min={0}
                  />
                )}
              />
              <Controller
                control={courseForm.control}
                name="min_students"
                render={({ field }) => (
                  <NumberInput
                    label={t("wsq.course.fields.minStudents")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={courseErrors.min_students?.message}
                    min={0}
                    allowDecimal={false}
                  />
                )}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeCourseModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingCourse}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={enrollmentModalOpened}
        onClose={closeEnrollmentModal}
        title={t("wsq.enrollment.add")}
        size="md"
      >
        <form onSubmit={onEnrollmentSubmit}>
          <Stack gap="md">
            {enrollmentFormError ? (
              <Alert color="red" variant="light">
                {enrollmentFormError}
              </Alert>
            ) : null}
            <Controller
              control={enrollmentForm.control}
              name="student_id"
              render={({ field }) => (
                <Select
                  label={t("wsq.enrollment.fields.student")}
                  data={studentOptions}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  error={enrollmentErrors.student_id?.message}
                  searchable
                  withAsterisk
                />
              )}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeEnrollmentModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingEnrollment}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
