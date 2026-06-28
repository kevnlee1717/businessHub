import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
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
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  englishClassCreateSchema,
  englishClassUpdateSchema,
  englishLevelCreateSchema,
  englishLevelUpdateSchema,
  type EnglishClassCreateInput,
  type EnglishClassUpdateInput,
  type EnglishEnrollmentCreateInput,
  type EnglishLevelCreateInput,
  type EnglishLevelUpdateInput
} from "@bh/shared";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createEnglishClass,
  createEnglishEnrollment,
  createEnglishLevel,
  deleteEnglishEnrollment,
  getEnrollmentAttendance,
  listClassEnrollments,
  listEnglishClasses,
  listEnglishLevels,
  listStudents,
  markClassAttendance,
  updateEnglishClass,
  updateEnglishLevel,
  type EnglishClass,
  type EnglishEnrollment,
  type EnglishLevel
} from "../../api/education";
import { listEmployees } from "../../api/hr";
import { useCan } from "../../auth/permissions";
import { StudentSelect } from "../../components/StudentSelect";
import { TeacherSelect } from "../../components/TeacherSelect";
import { displayStudentName, emptyToUndefined, studentsQueryKey } from "./StudentsPage";

type LevelFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  level?: number | null | undefined;
  price_sgd?: string | number | null | undefined;
  duration?: string | undefined;
};

type ClassFormValues = {
  level_id?: string | null | undefined;
  teacher_id?: string | null | undefined;
  schedule?: string | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
};

const englishLevelsQueryKey = ["education", "english-levels"] as const;
const englishClassesQueryKey = ["education", "english-classes"] as const;
const englishEnrollmentsQueryKey = ["education", "english-enrollments"] as const;
const englishAttendanceQueryKey = ["education", "english-attendance"] as const;
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

function getLevelDefaultValues(level?: EnglishLevel): LevelFormValues {
  return {
    name: level?.name ?? "",
    name_en: level?.name_en ?? undefined,
    level: level?.level ?? null,
    price_sgd: level?.price_sgd ?? null,
    duration: level?.duration ?? undefined
  };
}

function getClassDefaultValues(englishClass?: EnglishClass): ClassFormValues {
  return {
    level_id: englishClass?.level_id ?? null,
    teacher_id: englishClass?.teacher_id ?? null,
    schedule: englishClass?.schedule ?? undefined,
    start_date: englishClass?.start_date ?? undefined,
    end_date: englishClass?.end_date ?? undefined
  };
}

export function EnglishPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingLevel, setEditingLevel] = useState<EnglishLevel | null>(null);
  const [levelModalOpened, setLevelModalOpened] = useState(false);
  const [levelFormError, setLevelFormError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState<EnglishClass | null>(null);
  const [classModalOpened, setClassModalOpened] = useState(false);
  const [classFormError, setClassFormError] = useState<string | null>(null);
  const [enrollmentStudentId, setEnrollmentStudentId] = useState<string | null>(null);
  const [attendanceDate, setAttendanceDate] = useState("");
  const [presentEnrollmentIds, setPresentEnrollmentIds] = useState<Set<string>>(new Set());
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const canManageEducation = useCan("education.manage");

  const levelsQuery = useQuery({
    queryKey: englishLevelsQueryKey,
    queryFn: listEnglishLevels
  });
  const classesQuery = useQuery({
    queryKey: [...englishClassesQueryKey, levelFilter],
    queryFn: () => listEnglishClasses(levelFilter ? { level_id: levelFilter } : {})
  });
  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: listStudents
  });
  const employeesQuery = useQuery({
    queryKey: employeesQueryKey,
    queryFn: listEmployees
  });
  const enrollmentsQuery = useQuery({
    queryKey: [...englishEnrollmentsQueryKey, selectedClassId],
    queryFn: () => listClassEnrollments(selectedClassId ?? ""),
    enabled: Boolean(selectedClassId)
  });
  const attendanceSummaryQueries = useQueries({
    queries: (enrollmentsQuery.data?.enrollments ?? []).map((enrollment) => ({
      queryKey: [...englishAttendanceQueryKey, enrollment.id],
      queryFn: () => getEnrollmentAttendance(enrollment.id),
      enabled: Boolean(selectedClassId)
    }))
  });

  const levelForm = useForm<LevelFormValues>({
    resolver: zodResolver(
      editingLevel ? englishLevelUpdateSchema : englishLevelCreateSchema
    ) as Resolver<LevelFormValues>,
    defaultValues: getLevelDefaultValues()
  });
  const classForm = useForm<ClassFormValues>({
    resolver: zodResolver(
      editingClass ? englishClassUpdateSchema : englishClassCreateSchema
    ) as Resolver<ClassFormValues>,
    defaultValues: getClassDefaultValues()
  });

  const createLevelMutation = useMutation({
    mutationFn: createEnglishLevel,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: englishLevelsQueryKey });
      closeLevelModal();
    }
  });
  const updateLevelMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EnglishLevelUpdateInput }) => updateEnglishLevel(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: englishLevelsQueryKey });
      closeLevelModal();
    }
  });
  const createClassMutation = useMutation({
    mutationFn: createEnglishClass,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: englishClassesQueryKey });
      setSelectedClassId(data.class.id);
      closeClassModal();
    }
  });
  const updateClassMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EnglishClassUpdateInput }) => updateEnglishClass(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: englishClassesQueryKey });
      closeClassModal();
    }
  });
  const createEnrollmentMutation = useMutation({
    mutationFn: createEnglishEnrollment,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: [...englishEnrollmentsQueryKey, variables.class_id] });
      setEnrollmentStudentId(null);
    }
  });
  const deleteEnrollmentMutation = useMutation({
    mutationFn: deleteEnglishEnrollment,
    onSuccess: async (_data, enrollmentId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...englishEnrollmentsQueryKey, selectedClassId] }),
        queryClient.invalidateQueries({ queryKey: [...englishAttendanceQueryKey, enrollmentId] })
      ]);
    }
  });
  const markClassAttendanceMutation = useMutation({
    mutationFn: ({ classId, body }: { classId: string; body: { session_date: string; present_enrollment_ids: string[] } }) =>
      markClassAttendance(classId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...englishEnrollmentsQueryKey, selectedClassId] }),
        queryClient.invalidateQueries({ queryKey: englishAttendanceQueryKey })
      ]);
    }
  });

  const levels = levelsQuery.data?.levels ?? [];
  const classes = classesQuery.data?.classes ?? [];
  const students = studentsQuery.data?.students ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const enrollments = enrollmentsQuery.data?.enrollments ?? [];
  const selectedClass = classes.find((englishClass) => englishClass.id === selectedClassId) ?? null;
  const levelById = useMemo(() => new Map(levels.map((level) => [level.id, level])), [levels]);
  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const summaryByEnrollmentId = useMemo(() => {
    const summaries = new Map<string, { total_sessions: number; attended_sessions: number }>();
    enrollments.forEach((enrollment, index) => {
      const summary = attendanceSummaryQueries[index]?.data?.summary;
      if (summary) {
        summaries.set(enrollment.id, summary);
      }
    });
    return summaries;
  }, [attendanceSummaryQueries, enrollments]);
  const levelOptions = levels.map((level) => ({ value: level.id, label: displayName(level) }));
  const levelErrors = levelForm.formState.errors;
  const classErrors = classForm.formState.errors;
  const isSavingLevel = createLevelMutation.isPending || updateLevelMutation.isPending;
  const isSavingClass = createClassMutation.isPending || updateClassMutation.isPending;
  const loadError =
    levelsQuery.error ?? classesQuery.error ?? studentsQuery.error ?? employeesQuery.error ?? enrollmentsQuery.error;

  useEffect(() => {
    if (classesQuery.isLoading) {
      return;
    }

    if (selectedClassId && classes.some((englishClass) => englishClass.id === selectedClassId)) {
      return;
    }

    setSelectedClassId(classes[0]?.id ?? null);
  }, [classes, classesQuery.isLoading, selectedClassId]);

  useEffect(() => {
    setPresentEnrollmentIds(new Set());
    setEnrollmentStudentId(null);
    setAttendanceError(null);
    setEnrollmentError(null);
  }, [selectedClassId]);

  function openCreateLevelModal() {
    setEditingLevel(null);
    setLevelFormError(null);
    levelForm.reset(getLevelDefaultValues());
    setLevelModalOpened(true);
  }

  function openEditLevelModal(level: EnglishLevel) {
    setEditingLevel(level);
    setLevelFormError(null);
    levelForm.reset(getLevelDefaultValues(level));
    setLevelModalOpened(true);
  }

  function closeLevelModal() {
    setLevelModalOpened(false);
    setEditingLevel(null);
    setLevelFormError(null);
    levelForm.reset(getLevelDefaultValues());
  }

  function openCreateClassModal() {
    setEditingClass(null);
    setClassFormError(null);
    classForm.reset({ ...getClassDefaultValues(), level_id: levelFilter });
    setClassModalOpened(true);
  }

  function openEditClassModal(englishClass: EnglishClass) {
    setEditingClass(englishClass);
    setClassFormError(null);
    classForm.reset(getClassDefaultValues(englishClass));
    setClassModalOpened(true);
  }

  function closeClassModal() {
    setClassModalOpened(false);
    setEditingClass(null);
    setClassFormError(null);
    classForm.reset(getClassDefaultValues());
  }

  const onLevelSubmit = levelForm.handleSubmit(async (values) => {
    setLevelFormError(null);

    try {
      const body = {
        ...values,
        level: values.level ?? null,
        price_sgd: values.price_sgd ?? null
      };

      if (editingLevel) {
        await updateLevelMutation.mutateAsync({ id: editingLevel.id, body });
        return;
      }

      await createLevelMutation.mutateAsync(body as EnglishLevelCreateInput);
    } catch (error) {
      setLevelFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onClassSubmit = classForm.handleSubmit(async (values) => {
    setClassFormError(null);

    try {
      const body = {
        ...values,
        level_id: values.level_id ?? null,
        teacher_id: values.teacher_id ?? null
      };

      if (editingClass) {
        await updateClassMutation.mutateAsync({ id: editingClass.id, body });
        return;
      }

      await createClassMutation.mutateAsync(body as EnglishClassCreateInput);
    } catch (error) {
      setClassFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function handleCreateEnrollment() {
    if (!selectedClassId || !enrollmentStudentId) {
      return;
    }

    setEnrollmentError(null);

    try {
      await createEnrollmentMutation.mutateAsync({
        student_id: enrollmentStudentId,
        class_id: selectedClassId
      } as EnglishEnrollmentCreateInput);
    } catch (error) {
      setEnrollmentError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function handleDeleteEnrollment(enrollment: EnglishEnrollment) {
    setEnrollmentError(null);

    try {
      await deleteEnrollmentMutation.mutateAsync(enrollment.id);
    } catch (error) {
      setEnrollmentError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  function togglePresent(enrollmentId: string, checked: boolean) {
    setPresentEnrollmentIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(enrollmentId);
      } else {
        next.delete(enrollmentId);
      }
      return next;
    });
  }

  async function handleSubmitClassAttendance() {
    if (!selectedClassId) {
      return;
    }

    setAttendanceError(null);

    try {
      await markClassAttendanceMutation.mutateAsync({
        classId: selectedClassId,
        body: {
          session_date: attendanceDate,
          present_enrollment_ids: Array.from(presentEnrollmentIds)
        }
      });
    } catch (error) {
      setAttendanceError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="md">
      <Title order={2}>{t("english.title")}</Title>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Tabs defaultValue="levels">
        <Tabs.List>
          <Tabs.Tab value="levels">{t("english.tabs.levels")}</Tabs.Tab>
          <Tabs.Tab value="classes">{t("english.tabs.classes")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="levels" pt="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3}>{t("englishLevel.title")}</Title>
              {canManageEducation ? <Button onClick={openCreateLevelModal}>{t("englishLevel.add")}</Button> : null}
            </Group>

            <Paper withBorder radius="md">
              <ScrollArea>
                <Table miw={780} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("englishLevel.fields.name")}</Table.Th>
                      <Table.Th>{t("englishLevel.fields.level")}</Table.Th>
                      <Table.Th>{t("englishLevel.fields.priceSgd")}</Table.Th>
                      <Table.Th>{t("englishLevel.fields.duration")}</Table.Th>
                      {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {levelsQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={canManageEducation ? 5 : 4}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : levels.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={canManageEducation ? 5 : 4}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("englishLevel.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      levels.map((level) => (
                        <Table.Tr key={level.id}>
                          <Table.Td>{displayName(level)}</Table.Td>
                          <Table.Td>{level.level ?? t("common.not_available")}</Table.Td>
                          <Table.Td>{level.price_sgd ?? t("common.not_available")}</Table.Td>
                          <Table.Td>{level.duration ?? t("common.not_available")}</Table.Td>
                          {canManageEducation ? (
                            <Table.Td>
                              <Button size="xs" variant="light" onClick={() => openEditLevelModal(level)}>
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
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="classes" pt="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Group align="flex-end">
                <Title order={3}>{t("englishClass.title")}</Title>
                <Select
                  label={t("englishClass.filters.level")}
                  placeholder={t("common.all")}
                  data={levelOptions}
                  value={levelFilter}
                  onChange={setLevelFilter}
                  clearable
                  searchable
                  w={260}
                />
              </Group>
              {canManageEducation ? <Button onClick={openCreateClassModal}>{t("englishClass.add")}</Button> : null}
            </Group>

            <Paper withBorder radius="md">
              <ScrollArea>
                <Table miw={900} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("englishClass.fields.level")}</Table.Th>
                      <Table.Th>{t("englishClass.fields.teacher")}</Table.Th>
                      <Table.Th>{t("englishClass.fields.schedule")}</Table.Th>
                      <Table.Th>{t("englishClass.fields.dateRange")}</Table.Th>
                      {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {classesQuery.isLoading || levelsQuery.isLoading || employeesQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={canManageEducation ? 5 : 4}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : classes.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={canManageEducation ? 5 : 4}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("englishClass.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      classes.map((englishClass) => (
                        <Table.Tr
                          key={englishClass.id}
                          onClick={() => setSelectedClassId(englishClass.id)}
                          style={{
                            cursor: "pointer",
                            backgroundColor:
                              englishClass.id === selectedClassId ? "var(--mantine-color-blue-light)" : undefined
                          }}
                        >
                          <Table.Td>
                            {displayName(levelById.get(englishClass.level_id ?? "")) || t("common.not_available")}
                          </Table.Td>
                          <Table.Td>
                            {displayName(employeeById.get(englishClass.teacher_id ?? "")) || t("common.not_available")}
                          </Table.Td>
                          <Table.Td>{englishClass.schedule ?? t("common.not_available")}</Table.Td>
                          <Table.Td>
                            {englishClass.start_date ?? t("common.not_available")} -{" "}
                            {englishClass.end_date ?? t("common.not_available")}
                          </Table.Td>
                          {canManageEducation ? (
                            <Table.Td>
                              <Button
                                size="xs"
                                variant="light"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditClassModal(englishClass);
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
                  <Title order={3}>
                    {selectedClass
                      ? displayName(levelById.get(selectedClass.level_id ?? "")) || t("englishClass.panel")
                      : t("englishClass.panel")}
                  </Title>
                  {selectedClass ? <Text c="dimmed">{selectedClass.schedule ?? t("common.not_available")}</Text> : null}
                </Group>

                {selectedClass ? (
                  <Stack gap="md">
                    <Group align="flex-end">
                      <Input.Wrapper label={t("englishEnrollment.fields.student")} w={300}>
                        <StudentSelect
                          value={enrollmentStudentId}
                          onChange={setEnrollmentStudentId}
                        />
                      </Input.Wrapper>
                      {canManageEducation ? (
                        <Button
                          onClick={handleCreateEnrollment}
                          loading={createEnrollmentMutation.isPending}
                          disabled={!enrollmentStudentId}
                        >
                          {t("englishEnrollment.add")}
                        </Button>
                      ) : null}
                    </Group>

                    {enrollmentError ? (
                      <Alert color="red" variant="light">
                        {enrollmentError}
                      </Alert>
                    ) : null}

                    <ScrollArea>
                      <Table miw={700} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t("englishEnrollment.fields.student")}</Table.Th>
                            <Table.Th>{t("englishAttendance.summary")}</Table.Th>
                            {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {enrollmentsQuery.isLoading || studentsQuery.isLoading ? (
                            <Table.Tr>
                              <Table.Td colSpan={canManageEducation ? 3 : 2}>
                                <Group justify="center" py="lg">
                                  <Loader size="sm" />
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ) : enrollments.length === 0 ? (
                            <Table.Tr>
                              <Table.Td colSpan={canManageEducation ? 3 : 2}>
                                <Text ta="center" c="dimmed" py="lg">
                                  {t("englishEnrollment.empty")}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            enrollments.map((enrollment) => {
                              const summary = summaryByEnrollmentId.get(enrollment.id);
                              return (
                                <Table.Tr key={enrollment.id}>
                                  <Table.Td>
                                    {displayStudentName(studentById.get(enrollment.student_id)) ||
                                      t("common.not_available")}
                                  </Table.Td>
                                  <Table.Td>
                                    {summary
                                      ? t("englishAttendance.summaryValue", {
                                          attended: summary.attended_sessions,
                                          total: summary.total_sessions
                                        })
                                      : t("common.not_available")}
                                  </Table.Td>
                                  {canManageEducation ? (
                                    <Table.Td>
                                      <Button
                                        size="xs"
                                        variant="light"
                                        color="red"
                                        loading={deleteEnrollmentMutation.isPending}
                                        onClick={() => handleDeleteEnrollment(enrollment)}
                                      >
                                        {t("englishEnrollment.remove")}
                                      </Button>
                                    </Table.Td>
                                  ) : null}
                                </Table.Tr>
                              );
                            })
                          )}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>

                    <Stack gap="sm">
                      <Group align="flex-end">
                        <TextInput
                          label={t("englishAttendance.fields.sessionDate")}
                          placeholder="YYYY-MM-DD"
                          value={attendanceDate}
                          onChange={(event) => setAttendanceDate(event.currentTarget.value)}
                          w={220}
                        />
                        {canManageEducation ? (
                          <Button
                            onClick={handleSubmitClassAttendance}
                            loading={markClassAttendanceMutation.isPending}
                            disabled={!attendanceDate || enrollments.length === 0}
                          >
                            {t("englishAttendance.submit")}
                          </Button>
                        ) : null}
                      </Group>

                      {attendanceError ? (
                        <Alert color="red" variant="light">
                          {attendanceError}
                        </Alert>
                      ) : null}

                      <Paper withBorder radius="md" p="sm">
                        <Stack gap="xs">
                          <Text fw={600}>{t("englishAttendance.title")}</Text>
                          {enrollments.length === 0 ? (
                            <Text c="dimmed">{t("englishEnrollment.empty")}</Text>
                          ) : (
                            enrollments.map((enrollment) => (
                              <Checkbox
                                key={enrollment.id}
                                label={
                                  displayStudentName(studentById.get(enrollment.student_id)) ||
                                  t("common.not_available")
                                }
                                checked={presentEnrollmentIds.has(enrollment.id)}
                                onChange={(event) => togglePresent(enrollment.id, event.currentTarget.checked)}
                                disabled={!canManageEducation}
                              />
                            ))
                          )}
                        </Stack>
                      </Paper>
                    </Stack>
                  </Stack>
                ) : (
                  <Text c="dimmed">{t("englishClass.selectHint")}</Text>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={levelModalOpened}
        onClose={closeLevelModal}
        title={editingLevel ? t("englishLevel.edit") : t("englishLevel.add")}
        size="lg"
      >
        <form onSubmit={onLevelSubmit}>
          <Stack gap="md">
            {levelFormError ? (
              <Alert color="red" variant="light">
                {levelFormError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("englishLevel.fields.name")}
                error={levelErrors.name?.message}
                {...levelForm.register("name")}
              />
              <TextInput
                label={t("englishLevel.fields.nameEn")}
                error={levelErrors.name_en?.message}
                {...levelForm.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={levelForm.control}
                name="level"
                render={({ field }) => (
                  <NumberInput
                    label={t("englishLevel.fields.level")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={levelErrors.level?.message}
                    allowDecimal={false}
                  />
                )}
              />
              <Controller
                control={levelForm.control}
                name="price_sgd"
                render={({ field }) => (
                  <NumberInput
                    label={t("englishLevel.fields.priceSgd")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={levelErrors.price_sgd?.message}
                    min={0}
                  />
                )}
              />
            </Group>
            <TextInput
              label={t("englishLevel.fields.duration")}
              error={levelErrors.duration?.message}
              {...levelForm.register("duration", { setValueAs: emptyToUndefined })}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeLevelModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingLevel}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={classModalOpened}
        onClose={closeClassModal}
        title={editingClass ? t("englishClass.edit") : t("englishClass.add")}
        size="lg"
      >
        <form onSubmit={onClassSubmit}>
          <Stack gap="md">
            {classFormError ? (
              <Alert color="red" variant="light">
                {classFormError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <Controller
                control={classForm.control}
                name="level_id"
                render={({ field }) => (
                  <Select
                    label={t("englishClass.fields.level")}
                    data={levelOptions}
                    value={field.value ?? null}
                    onChange={field.onChange}
                    error={classErrors.level_id?.message}
                    clearable
                    searchable
                  />
                )}
              />
              <Controller
                control={classForm.control}
                name="teacher_id"
                render={({ field }) => (
                  <Input.Wrapper label={t("englishClass.fields.teacher")} error={classErrors.teacher_id?.message}>
                    <TeacherSelect
                      value={field.value ?? null}
                      onChange={(nextValue) => field.onChange(nextValue)}
                    />
                  </Input.Wrapper>
                )}
              />
            </Group>
            <TextInput
              label={t("englishClass.fields.schedule")}
              placeholder={t("englishClass.schedulePlaceholder")}
              error={classErrors.schedule?.message}
              {...classForm.register("schedule", { setValueAs: emptyToUndefined })}
            />
            <Group grow align="flex-start">
              <TextInput
                label={t("englishClass.fields.startDate")}
                placeholder="YYYY-MM-DD"
                error={classErrors.start_date?.message}
                {...classForm.register("start_date", { setValueAs: emptyToUndefined })}
              />
              <TextInput
                label={t("englishClass.fields.endDate")}
                placeholder="YYYY-MM-DD"
                error={classErrors.end_date?.message}
                {...classForm.register("end_date", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeClassModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingClass}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
