import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Input,
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
  diplomaCourseCreateSchema,
  diplomaCourseUpdateSchema,
  diplomaEnrollmentCreateSchema,
  diplomaEnrollmentUpdateSchema,
  type DiplomaCourseCreateInput,
  type DiplomaCourseUpdateInput,
  type DiplomaEnrollmentCreateInput,
  type DiplomaEnrollmentUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createDiplomaCourse,
  createDiplomaEnrollment,
  deleteDiplomaCourse,
  listDiplomaCourseEnrollments,
  listDiplomaCourses,
  listDiplomaEnrollments,
  listStudents,
  updateDiplomaCourse,
  updateDiplomaEnrollment,
  type DiplomaCourse,
  type DiplomaEnrollment
} from "../../api/education";
import { listEmployees, type Employee } from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";
import { StudentSelect } from "../../components/StudentSelect";
import { TeacherSelect } from "../../components/TeacherSelect";
import { displayStudentName, emptyToNull, emptyToUndefined, studentsQueryKey } from "./StudentsPage";

type CourseFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  content?: string | null | undefined;
  teacher_id?: string | null | undefined;
  price_sgd?: string | number | null | undefined;
  duration?: string | undefined;
};

type DiplomaFormValues = {
  student_id?: string | undefined;
  course_id?: string | null | undefined;
  program?: string | undefined;
  enroll_date?: string | undefined;
  installments_count?: number | null | undefined;
  graduated?: boolean | undefined;
};

const diplomaCoursesQueryKey = ["education", "diploma-courses"] as const;
const diplomaQueryKey = ["education", "diploma-enrollments"] as const;
const employeesQueryKey = ["hr", "employees"] as const;

function numberOrNull(value: string | number) {
  if (value === "") {
    return null;
  }

  return value;
}

function displayName(item?: { name: string; name_en?: string | null } | null) {
  if (!item) {
    return "";
  }

  return item.name_en ? `${item.name} / ${item.name_en}` : item.name;
}

function truncateText(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.length > 48 ? `${value.slice(0, 48)}...` : value;
}

function getCourseDefaultValues(course?: DiplomaCourse): CourseFormValues {
  return {
    name: course?.name ?? "",
    name_en: course?.name_en ?? undefined,
    content: course?.content ?? null,
    teacher_id: course?.teacher_id ?? null,
    price_sgd: course?.price_sgd ?? null,
    duration: course?.duration ?? undefined
  };
}

function getEnrollmentDefaultValues(enrollment?: DiplomaEnrollment): DiplomaFormValues {
  return {
    student_id: enrollment?.student_id ?? undefined,
    course_id: enrollment?.course_id ?? null,
    program: enrollment?.program ?? "",
    enroll_date: enrollment?.enroll_date ?? undefined,
    installments_count: enrollment?.installments_count ?? null,
    graduated: enrollment?.graduated ?? false
  };
}

function filterEnrollmentsByStudent(enrollments: DiplomaEnrollment[], studentId: string | null) {
  if (!studentId) {
    return enrollments;
  }

  return enrollments.filter((enrollment) => enrollment.student_id === studentId);
}

export function DiplomaPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<DiplomaCourse | null>(null);
  const [courseModalOpened, setCourseModalOpened] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<DiplomaEnrollment | null>(null);
  const [enrollmentModalOpened, setEnrollmentModalOpened] = useState(false);
  const [courseFormError, setCourseFormError] = useState<string | null>(null);
  const [enrollmentFormError, setEnrollmentFormError] = useState<string | null>(null);
  const canManageEducation = user ? can(user.role, "education.manage") : false;

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: listStudents
  });

  const employeesQuery = useQuery({
    queryKey: employeesQueryKey,
    queryFn: listEmployees
  });

  const coursesQuery = useQuery({
    queryKey: diplomaCoursesQueryKey,
    queryFn: listDiplomaCourses
  });

  const enrollmentsQuery = useQuery({
    queryKey: [...diplomaQueryKey, studentFilter],
    queryFn: () => listDiplomaEnrollments(studentFilter ?? undefined),
    enabled: !selectedCourseId
  });

  const courseEnrollmentsQuery = useQuery({
    queryKey: [...diplomaQueryKey, "course", selectedCourseId],
    queryFn: () => listDiplomaCourseEnrollments(selectedCourseId ?? ""),
    enabled: Boolean(selectedCourseId)
  });

  const courseForm = useForm<CourseFormValues>({
    resolver: zodResolver(
      editingCourse ? diplomaCourseUpdateSchema : diplomaCourseCreateSchema
    ) as Resolver<CourseFormValues>,
    defaultValues: getCourseDefaultValues(editingCourse ?? undefined)
  });

  const enrollmentForm = useForm<DiplomaFormValues>({
    resolver: zodResolver(
      editingEnrollment ? diplomaEnrollmentUpdateSchema : diplomaEnrollmentCreateSchema
    ) as Resolver<DiplomaFormValues>,
    defaultValues: getEnrollmentDefaultValues(editingEnrollment ?? undefined)
  });

  const createCourseMutation = useMutation({
    mutationFn: createDiplomaCourse,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: diplomaCoursesQueryKey });
      setSelectedCourseId(data.course.id);
      closeCourseModal();
    }
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DiplomaCourseUpdateInput }) => updateDiplomaCourse(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: diplomaCoursesQueryKey });
      closeCourseModal();
    }
  });

  const deleteCourseMutation = useMutation({
    mutationFn: deleteDiplomaCourse,
    onSuccess: async (_data, courseId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: diplomaCoursesQueryKey }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
      if (selectedCourseId === courseId) {
        setSelectedCourseId(null);
      }
    }
  });

  const createEnrollmentMutation = useMutation({
    mutationFn: createDiplomaEnrollment,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey }),
        variables.course_id
          ? queryClient.invalidateQueries({ queryKey: [...diplomaQueryKey, "course", variables.course_id] })
          : Promise.resolve()
      ]);
      closeEnrollmentModal();
    }
  });

  const updateEnrollmentMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DiplomaEnrollmentUpdateInput }) =>
      updateDiplomaEnrollment(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: diplomaQueryKey });
      closeEnrollmentModal();
    }
  });

  const courses = coursesQuery.data?.courses ?? [];
  const students = studentsQuery.data?.students ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const courseEnrollments = courseEnrollmentsQuery.data?.enrollments ?? [];
  const enrollments = selectedCourseId
    ? filterEnrollmentsByStudent(courseEnrollments, studentFilter)
    : (enrollmentsQuery.data?.enrollments ?? []);
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const studentOptions = students.map((student) => ({
    value: student.id,
    label: displayStudentName(student)
  }));
  const courseOptions = courses.map((course) => ({
    value: course.id,
    label: displayName(course)
  }));
  const studentsById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const coursesById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const employeesById = useMemo(
    () => new Map<string, Employee>(employees.map((employee) => [employee.id, employee])),
    [employees]
  );
  const courseErrors = courseForm.formState.errors;
  const enrollmentErrors = enrollmentForm.formState.errors;
  const isSavingCourse = createCourseMutation.isPending || updateCourseMutation.isPending;
  const isSavingEnrollment = createEnrollmentMutation.isPending || updateEnrollmentMutation.isPending;
  const isLoadingEnrollments = selectedCourseId ? courseEnrollmentsQuery.isLoading : enrollmentsQuery.isLoading;
  const loadError =
    studentsQuery.error ?? employeesQuery.error ?? coursesQuery.error ?? enrollmentsQuery.error ?? courseEnrollmentsQuery.error;

  function openCreateCourseModal() {
    setEditingCourse(null);
    setCourseFormError(null);
    courseForm.reset(getCourseDefaultValues());
    setCourseModalOpened(true);
  }

  function openEditCourseModal(course: DiplomaCourse) {
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

  function openCreateEnrollmentModal() {
    setEditingEnrollment(null);
    setEnrollmentFormError(null);
    enrollmentForm.reset({
      ...getEnrollmentDefaultValues(),
      student_id: studentFilter ?? undefined,
      course_id: selectedCourseId ?? null
    });
    setEnrollmentModalOpened(true);
  }

  function openEditEnrollmentModal(enrollment: DiplomaEnrollment) {
    setEditingEnrollment(enrollment);
    setEnrollmentFormError(null);
    enrollmentForm.reset(getEnrollmentDefaultValues(enrollment));
    setEnrollmentModalOpened(true);
  }

  function closeEnrollmentModal() {
    setEnrollmentModalOpened(false);
    setEditingEnrollment(null);
    setEnrollmentFormError(null);
    enrollmentForm.reset(getEnrollmentDefaultValues());
  }

  const onCourseSubmit = courseForm.handleSubmit(async (values) => {
    setCourseFormError(null);

    try {
      const body = {
        ...values,
        teacher_id: values.teacher_id ?? null,
        price_sgd: values.price_sgd ?? null
      };

      if (editingCourse) {
        await updateCourseMutation.mutateAsync({ id: editingCourse.id, body });
        return;
      }

      await createCourseMutation.mutateAsync(body as DiplomaCourseCreateInput);
    } catch (error) {
      setCourseFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onEnrollmentSubmit = enrollmentForm.handleSubmit(async (values) => {
    setEnrollmentFormError(null);

    try {
      if (editingEnrollment) {
        await updateEnrollmentMutation.mutateAsync({
          id: editingEnrollment.id,
          body: {
            course_id: values.course_id ?? null,
            installments_count: values.installments_count ?? null,
            graduated: values.graduated ?? false
          }
        });
        return;
      }

      await createEnrollmentMutation.mutateAsync({
        ...values,
        course_id: values.course_id ?? null,
        installments_count: values.installments_count ?? null
      } as DiplomaEnrollmentCreateInput);
    } catch (error) {
      setEnrollmentFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function handleDeleteCourse(course: DiplomaCourse) {
    if (!window.confirm(t("diplomaCourse.confirmDelete", { name: displayName(course) }))) {
      return;
    }

    await deleteCourseMutation.mutateAsync(course.id);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("diploma.title")}</Title>
        {canManageEducation ? <Button onClick={openCreateCourseModal}>{t("diplomaCourse.add")}</Button> : null}
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
        <Paper withBorder radius="md">
          <ScrollArea>
            <Table miw={900} verticalSpacing="sm" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("diplomaCourse.fields.name")}</Table.Th>
                  <Table.Th>{t("diplomaCourse.fields.teacher")}</Table.Th>
                  <Table.Th>{t("diplomaCourse.fields.priceSgd")}</Table.Th>
                  <Table.Th>{t("diplomaCourse.fields.duration")}</Table.Th>
                  <Table.Th>{t("diplomaCourse.fields.content")}</Table.Th>
                  {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {coursesQuery.isLoading || employeesQuery.isLoading ? (
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
                        {t("diplomaCourse.empty")}
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
                      <Table.Td>{displayName(course)}</Table.Td>
                      <Table.Td>
                        {displayName(employeesById.get(course.teacher_id ?? "")) || t("common.not_available")}
                      </Table.Td>
                      <Table.Td>{course.price_sgd ?? t("common.not_available")}</Table.Td>
                      <Table.Td>{course.duration ?? t("common.not_available")}</Table.Td>
                      <Table.Td>{truncateText(course.content) || t("common.not_available")}</Table.Td>
                      {canManageEducation ? (
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
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
                            <Button
                              size="xs"
                              variant="light"
                              color="red"
                              loading={deleteCourseMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteCourse(course);
                              }}
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

        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Group align="flex-end">
                <Title order={3}>
                  {selectedCourse ? displayName(selectedCourse) : t("diploma.enrollment.title")}
                </Title>
                {selectedCourse ? (
                  <Button size="xs" variant="subtle" onClick={() => setSelectedCourseId(null)}>
                    {t("common.all")}
                  </Button>
                ) : null}
                <Select
                  label={t("diploma.filters.student")}
                  placeholder={t("common.all")}
                  data={studentOptions}
                  value={studentFilter}
                  onChange={setStudentFilter}
                  clearable
                  searchable
                  w={240}
                />
              </Group>
              {canManageEducation ? (
                <Button size="sm" onClick={openCreateEnrollmentModal}>
                  {t("diploma.add")}
                </Button>
              ) : null}
            </Group>
            <ScrollArea>
              <Table miw={900} verticalSpacing="sm" striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("diploma.fields.student")}</Table.Th>
                    <Table.Th>{t("diploma.fields.course")}</Table.Th>
                    <Table.Th>{t("diploma.fields.program")}</Table.Th>
                    <Table.Th>{t("diploma.fields.enrollDate")}</Table.Th>
                    <Table.Th>{t("diploma.fields.installmentsCount")}</Table.Th>
                    <Table.Th>{t("diploma.fields.graduated")}</Table.Th>
                    {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {isLoadingEnrollments || studentsQuery.isLoading || coursesQuery.isLoading ? (
                    <Table.Tr>
                      <Table.Td colSpan={canManageEducation ? 7 : 6}>
                        <Group justify="center" py="lg">
                          <Loader size="sm" />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ) : enrollments.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={canManageEducation ? 7 : 6}>
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
                        <Table.Td>
                          {displayName(coursesById.get(enrollment.course_id ?? "")) || t("common.not_available")}
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
                            <Button size="xs" variant="light" onClick={() => openEditEnrollmentModal(enrollment)}>
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
          </Stack>
        </Paper>
      </SimpleGrid>

      <Modal
        opened={courseModalOpened}
        onClose={closeCourseModal}
        title={editingCourse ? t("diplomaCourse.edit") : t("diplomaCourse.add")}
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
                label={t("diplomaCourse.fields.name")}
                error={courseErrors.name?.message}
                {...courseForm.register("name")}
              />
              <TextInput
                label={t("diplomaCourse.fields.nameEn")}
                error={courseErrors.name_en?.message}
                {...courseForm.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Textarea
              label={t("diplomaCourse.fields.content")}
              error={courseErrors.content?.message}
              {...courseForm.register("content", { setValueAs: emptyToNull })}
            />
            <Group grow align="flex-start">
              <Controller
                control={courseForm.control}
                name="teacher_id"
                render={({ field }) => (
                  <Input.Wrapper label={t("diplomaCourse.fields.teacher")} error={courseErrors.teacher_id?.message}>
                    <TeacherSelect
                      value={field.value ?? null}
                      onChange={(nextValue) => field.onChange(nextValue)}
                    />
                  </Input.Wrapper>
                )}
              />
              <TextInput
                label={t("diplomaCourse.fields.duration")}
                error={courseErrors.duration?.message}
                {...courseForm.register("duration", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Controller
              control={courseForm.control}
              name="price_sgd"
              render={({ field }) => (
                <NumberInput
                  label={t("diplomaCourse.fields.priceSgd")}
                  value={field.value ?? ""}
                  onChange={(value) => field.onChange(numberOrNull(value))}
                  error={courseErrors.price_sgd?.message}
                  min={0}
                />
              )}
            />
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
        title={editingEnrollment ? t("diploma.edit") : t("diploma.add")}
        size="lg"
      >
        <form onSubmit={onEnrollmentSubmit}>
          <Stack gap="md">
            {enrollmentFormError ? (
              <Alert color="red" variant="light">
                {enrollmentFormError}
              </Alert>
            ) : null}
            {editingEnrollment ? null : (
              <Controller
                control={enrollmentForm.control}
                name="student_id"
                render={({ field }) => (
                  <Input.Wrapper
                    label={t("diploma.fields.student")}
                    error={enrollmentErrors.student_id?.message}
                    withAsterisk
                  >
                    <StudentSelect
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value ?? undefined)}
                    />
                  </Input.Wrapper>
                )}
              />
            )}
            <Controller
              control={enrollmentForm.control}
              name="course_id"
              render={({ field }) => (
                <Select
                  label={t("diploma.fields.course")}
                  data={courseOptions}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  error={enrollmentErrors.course_id?.message}
                  clearable
                  searchable
                />
              )}
            />
            {editingEnrollment ? null : (
              <Group grow align="flex-start">
                <TextInput
                  label={t("diploma.fields.program")}
                  error={enrollmentErrors.program?.message}
                  {...enrollmentForm.register("program")}
                />
                <TextInput
                  label={t("diploma.fields.enrollDate")}
                  placeholder="YYYY-MM-DD"
                  error={enrollmentErrors.enroll_date?.message}
                  {...enrollmentForm.register("enroll_date", { setValueAs: emptyToUndefined })}
                />
              </Group>
            )}
            <Group grow align="flex-start">
              <Controller
                control={enrollmentForm.control}
                name="installments_count"
                render={({ field }) => (
                  <NumberInput
                    label={t("diploma.fields.installmentsCount")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={enrollmentErrors.installments_count?.message}
                    min={0}
                    allowDecimal={false}
                  />
                )}
              />
              <Controller
                control={enrollmentForm.control}
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
