import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Input,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Switch,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import {
  diplomaCourseCreateSchema,
  diplomaCourseUpdateSchema,
  diplomaEnrollmentCreateSchema,
  diplomaEnrollmentUpdateSchema,
  type DiplomaCourseCreateInput,
  type DiplomaCourseUpdateInput,
  type DiplomaAssignmentAction,
  type DiplomaEnrollmentCreateInput,
  type DiplomaEnrollmentUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createDiplomaCourse,
  createDiplomaEnrollment,
  deleteDiplomaCourse,
  getDiplomaEnrollment,
  listDiplomaCourseEnrollments,
  listDiplomaCourses,
  listDiplomaEnrollments,
  listStudents,
  postAssignmentMessage,
  updateDiplomaPayment,
  updateDiplomaCourse,
  updateDiplomaEnrollment,
  uploadDiplomaCertificate,
  uploadDiplomaMedia,
  type DiplomaAssignment,
  type DiplomaCourse,
  type DiplomaEnrollment,
  type DiplomaPayment
} from "../../api/education";
import { fileUrl, searchDocuments, type DocumentMeta } from "../../api/dms";
import { listEmployees, type Employee } from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";
import { useCan } from "../../auth/permissions";
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
  month_index?: number | null | undefined;
};

type DiplomaFormValues = {
  student_id?: string | undefined;
  course_id?: string | null | undefined;
  program?: string | undefined;
  enroll_date?: string | undefined;
  installments_count?: number | null | undefined;
  deposit_amount?: string | number | null | undefined;
  deposit_paid_at?: string | null | undefined;
  graduated?: boolean | undefined;
};

const diplomaCoursesQueryKey = ["education", "diploma-courses"] as const;
const diplomaQueryKey = ["education", "diploma-enrollments"] as const;
const employeesQueryKey = ["hr", "employees"] as const;
const teacherRoles = new Set(["owner", "admin", "principal", "teacher"]);

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

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value?: string | null) {
  return value ? new Date(value).toISOString() : null;
}

function assignmentStatusColor(status: DiplomaAssignment["status"]) {
  switch (status) {
    case "passed":
      return "green";
    case "rejected":
      return "red";
    case "submitted":
      return "yellow";
    default:
      return "gray";
  }
}

function assignmentActionColor(action: DiplomaAssignmentAction) {
  switch (action) {
    case "approve":
      return "green";
    case "reject":
      return "red";
    case "submit":
      return "blue";
    default:
      return "gray";
  }
}

function getCourseDefaultValues(course?: DiplomaCourse): CourseFormValues {
  return {
    name: course?.name ?? "",
    name_en: course?.name_en ?? undefined,
    content: course?.content ?? null,
    teacher_id: course?.teacher_id ?? null,
    price_sgd: course?.price_sgd ?? null,
    duration: course?.duration ?? undefined,
    month_index: course?.month_index ?? null
  };
}

function getEnrollmentDefaultValues(enrollment?: DiplomaEnrollment): DiplomaFormValues {
  return {
    student_id: enrollment?.student_id ?? undefined,
    course_id: enrollment?.course_id ?? null,
    program: enrollment?.program ?? "",
    enroll_date: enrollment?.enroll_date ?? undefined,
    installments_count: enrollment?.installments_count ?? null,
    deposit_amount: enrollment?.deposit_amount ?? null,
    deposit_paid_at: toDateTimeLocalValue(enrollment?.deposit_paid_at),
    graduated: enrollment?.graduated ?? false
  };
}

function filterEnrollmentsByStudent(enrollments: DiplomaEnrollment[], studentId: string | null) {
  if (!studentId) {
    return enrollments;
  }

  return enrollments.filter((enrollment) => enrollment.student_id === studentId);
}

type AssignmentCardProps = {
  assignment: DiplomaAssignment;
  enrollmentId: string;
  employeesById: Map<string, Employee>;
  canReview: boolean;
};

function AssignmentCard({ assignment, enrollmentId, employeesById, canReview }: AssignmentCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const messageMutation = useMutation({
    mutationFn: (action: DiplomaAssignmentAction) =>
      postAssignmentMessage(assignment.id, {
        action,
        content: content.trim() ? content.trim() : null,
        files
      }),
    onSuccess: async () => {
      setContent("");
      setFiles([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...diplomaQueryKey, "detail", enrollmentId] }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
    }
  });

  async function submitMessage(action: DiplomaAssignmentAction) {
    if ((action === "submit" || action === "comment") && !content.trim() && files.length === 0) {
      return;
    }

    setError(null);
    try {
      await messageMutation.mutateAsync(action);
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : t("common.unknown_error"));
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text fw={600}>{assignment.course?.name ?? t("common.not_available")}</Text>
            <Text size="sm" c="dimmed">
              {assignment.course?.month_index
                ? t("diplomaCourse.monthValue", { month: assignment.course.month_index })
                : t("common.not_available")}
            </Text>
          </Stack>
          <Badge color={assignmentStatusColor(assignment.status)} variant="light">
            {t(`diplomaAssignment.status.${assignment.status}`)}
          </Badge>
        </Group>

        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}

        {assignment.messages.length === 0 ? (
          <Text c="dimmed" size="sm">
            {t("diplomaAssignment.empty")}
          </Text>
        ) : (
          <Stack gap="xs">
            {assignment.messages.map((message) => {
              const author = message.author_id ? employeesById.get(message.author_id) : undefined;
              return (
                <Paper key={message.id} withBorder radius="md" p="sm">
                  <Stack gap={6}>
                    <Group gap="xs">
                      <Badge size="sm" color={assignmentActionColor(message.action)} variant="light">
                        {t(`diplomaAssignment.action.${message.action}`)}
                      </Badge>
                      <Text size="sm" fw={500}>
                        {author ? displayName(author) : t("common.not_available")}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDateTime(message.created_at)}
                      </Text>
                    </Group>
                    {message.content ? <Text size="sm">{message.content}</Text> : null}
                    {message.files.length > 0 ? (
                      <Group gap="xs">
                        {message.files.map((file) => (
                          <Button
                            key={file.id}
                            component="a"
                            href={fileUrl(file.storage_path)}
                            target="_blank"
                            rel="noreferrer"
                            size="compact-xs"
                            variant="subtle"
                          >
                            {file.filename}
                          </Button>
                        ))}
                      </Group>
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}

        <Textarea
          label={t("diplomaAssignment.fields.content")}
          value={content}
          onChange={(event) => setContent(event.currentTarget.value)}
          autosize
          minRows={2}
        />
        <FileInput
          label={t("diplomaAssignment.fields.files")}
          value={files}
          onChange={(value) => setFiles(value ?? [])}
          multiple
          clearable
        />
        <Group justify="flex-end">
          <Button
            variant="light"
            onClick={() => void submitMessage("submit")}
            loading={messageMutation.isPending}
            disabled={!content.trim() && files.length === 0}
          >
            {t("diplomaAssignment.submit")}
          </Button>
          <Button
            variant="light"
            onClick={() => void submitMessage("comment")}
            loading={messageMutation.isPending}
            disabled={!content.trim() && files.length === 0}
          >
            {t("diplomaAssignment.comment")}
          </Button>
          {canReview ? (
            <>
              <Button
                color="green"
                variant="light"
                onClick={() => void submitMessage("approve")}
                loading={messageMutation.isPending}
              >
                {t("diplomaAssignment.approve")}
              </Button>
              <Button
                color="red"
                variant="light"
                onClick={() => void submitMessage("reject")}
                loading={messageMutation.isPending}
              >
                {t("diplomaAssignment.reject")}
              </Button>
            </>
          ) : null}
        </Group>
      </Stack>
    </Paper>
  );
}

type PaymentRowProps = {
  payment: DiplomaPayment;
  enrollmentId: string;
};

function PaymentRow({ payment, enrollmentId }: PaymentRowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<string | number | null>(payment.amount ?? null);
  const [paidAt, setPaidAt] = useState(toDateTimeLocalValue(payment.paid_at));
  const [note, setNote] = useState(payment.note ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(payment.amount ?? null);
    setPaidAt(toDateTimeLocalValue(payment.paid_at));
    setNote(payment.note ?? "");
  }, [payment.id, payment.amount, payment.paid_at, payment.note]);

  const paymentMutation = useMutation({
    mutationFn: (body: Parameters<typeof updateDiplomaPayment>[1]) => updateDiplomaPayment(payment.id, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...diplomaQueryKey, "detail", enrollmentId] }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
    }
  });

  async function updatePaid(nextPaid: boolean) {
    setError(null);
    try {
      await paymentMutation.mutateAsync({ paid: nextPaid });
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : t("common.unknown_error"));
    }
  }

  async function saveDraft() {
    setError(null);
    try {
      await paymentMutation.mutateAsync({
        amount,
        paid_at: toIsoDateTime(paidAt),
        note: note.trim() ? note.trim() : null
      });
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : t("common.unknown_error"));
    }
  }

  return (
    <Table.Tr>
      <Table.Td>{payment.period}</Table.Td>
      <Table.Td>
        <NumberInput value={amount ?? ""} onChange={setAmount} min={0} hideControls w={120} />
      </Table.Td>
      <Table.Td>
        <Switch
          checked={payment.paid}
          onChange={(event) => void updatePaid(event.currentTarget.checked)}
          disabled={paymentMutation.isPending}
        />
      </Table.Td>
      <Table.Td>
        <TextInput type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.currentTarget.value)} />
      </Table.Td>
      <Table.Td>
        <TextInput value={note} onChange={(event) => setNote(event.currentTarget.value)} />
      </Table.Td>
      <Table.Td>
        <Stack gap={4}>
          <Button size="xs" variant="light" onClick={() => void saveDraft()} loading={paymentMutation.isPending}>
            {t("common.save")}
          </Button>
          {error ? (
            <Text size="xs" c="red">
              {error}
            </Text>
          ) : null}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}

function DocumentLinks({ documents }: { documents: DocumentMeta[] }) {
  const { t } = useTranslation();

  if (documents.length === 0) {
    return <Text c="dimmed">{t("common.not_available")}</Text>;
  }

  return (
    <Group gap="xs">
      {documents.map((document) => (
        <Button
          key={document.id}
          component="a"
          href={fileUrl(document.storage_path)}
          target="_blank"
          rel="noreferrer"
          size="compact-xs"
          variant="subtle"
        >
          {document.filename}
        </Button>
      ))}
    </Group>
  );
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
  const [detailEnrollmentId, setDetailEnrollmentId] = useState<string | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [courseFormError, setCourseFormError] = useState<string | null>(null);
  const [enrollmentFormError, setEnrollmentFormError] = useState<string | null>(null);
  const canManageEducation = useCan("education.manage");
  const canReviewAssignments = Boolean(user && teacherRoles.has(user.role));

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

  const enrollmentDetailQuery = useQuery({
    queryKey: [...diplomaQueryKey, "detail", detailEnrollmentId],
    queryFn: () => getDiplomaEnrollment(detailEnrollmentId ?? ""),
    enabled: Boolean(detailEnrollmentId)
  });

  const certificateDocumentsQuery = useQuery({
    queryKey: ["documents", "diploma-certificate", detailEnrollmentId],
    queryFn: () =>
      searchDocuments({
        subject_type: "diploma_certificate",
        subject_id: detailEnrollmentId
      }),
    enabled: Boolean(detailEnrollmentId)
  });

  const mediaDocumentsQuery = useQuery({
    queryKey: ["documents", "diploma-media", detailEnrollmentId],
    queryFn: () =>
      searchDocuments({
        subject_type: "diploma_media",
        subject_id: detailEnrollmentId
      }),
    enabled: Boolean(detailEnrollmentId)
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

  const uploadCertificateMutation = useMutation({
    mutationFn: ({ enrollmentId, file }: { enrollmentId: string; file: File }) =>
      uploadDiplomaCertificate(enrollmentId, file),
    onSuccess: async (_data, variables) => {
      setCertificateFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...diplomaQueryKey, "detail", variables.enrollmentId] }),
        queryClient.invalidateQueries({ queryKey: ["documents", "diploma-certificate", variables.enrollmentId] }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
    }
  });

  const uploadMediaMutation = useMutation({
    mutationFn: ({ enrollmentId, files }: { enrollmentId: string; files: File[] }) =>
      uploadDiplomaMedia(enrollmentId, files),
    onSuccess: async (_data, variables) => {
      setMediaFiles([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...diplomaQueryKey, "detail", variables.enrollmentId] }),
        queryClient.invalidateQueries({ queryKey: ["documents", "diploma-media", variables.enrollmentId] }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
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
  const enrollmentDetail = enrollmentDetailQuery.data;
  const detailAssignments = [...(enrollmentDetail?.assignments ?? [])].sort(
    (left, right) => (left.course?.month_index ?? 99) - (right.course?.month_index ?? 99)
  );
  const detailPayments = [...(enrollmentDetail?.payments ?? [])].sort((left, right) =>
    left.period.localeCompare(right.period)
  );
  const certificateDocuments = certificateDocumentsQuery.data?.documents ?? [];
  const mediaDocuments = mediaDocumentsQuery.data?.documents ?? [];
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

  function openEnrollmentDetail(enrollmentId: string) {
    setDetailEnrollmentId(enrollmentId);
    setCertificateFile(null);
    setMediaFiles([]);
    setMaterialError(null);
  }

  function closeEnrollmentDetail() {
    setDetailEnrollmentId(null);
    setCertificateFile(null);
    setMediaFiles([]);
    setMaterialError(null);
  }

  async function uploadCertificate() {
    if (!detailEnrollmentId || !certificateFile) {
      return;
    }

    setMaterialError(null);
    try {
      await uploadCertificateMutation.mutateAsync({ enrollmentId: detailEnrollmentId, file: certificateFile });
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function uploadMedia() {
    if (!detailEnrollmentId || mediaFiles.length === 0) {
      return;
    }

    setMaterialError(null);
    try {
      await uploadMediaMutation.mutateAsync({ enrollmentId: detailEnrollmentId, files: mediaFiles });
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  const onCourseSubmit = courseForm.handleSubmit(async (values) => {
    setCourseFormError(null);

    try {
      const body = {
        ...values,
        teacher_id: values.teacher_id ?? null,
        price_sgd: values.price_sgd ?? null,
        month_index: values.month_index ?? null
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
            deposit_amount: values.deposit_amount ?? null,
            deposit_paid_at: toIsoDateTime(values.deposit_paid_at),
            graduated: values.graduated ?? false
          }
        });
        return;
      }

      await createEnrollmentMutation.mutateAsync({
        ...values,
        course_id: values.course_id ?? null,
        installments_count: values.installments_count ?? null,
        deposit_amount: values.deposit_amount ?? null,
        deposit_paid_at: toIsoDateTime(values.deposit_paid_at)
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
                  <Table.Th>{t("diplomaCourse.fields.monthIndex")}</Table.Th>
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
                    <Table.Td colSpan={canManageEducation ? 7 : 6}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : courses.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={canManageEducation ? 7 : 6}>
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
                        {course.month_index
                          ? t("diplomaCourse.monthValue", { month: course.month_index })
                          : t("common.not_available")}
                      </Table.Td>
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
                    <Table.Th>{t("diploma.fields.depositAmount")}</Table.Th>
                    <Table.Th>{t("diploma.fields.installmentsCount")}</Table.Th>
                    <Table.Th>{t("diploma.fields.graduated")}</Table.Th>
                    <Table.Th>{t("common.view")}</Table.Th>
                    {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {isLoadingEnrollments || studentsQuery.isLoading || coursesQuery.isLoading ? (
                    <Table.Tr>
                      <Table.Td colSpan={canManageEducation ? 9 : 8}>
                        <Group justify="center" py="lg">
                          <Loader size="sm" />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ) : enrollments.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={canManageEducation ? 9 : 8}>
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
                        <Table.Td>{enrollment.deposit_amount ?? t("common.not_available")}</Table.Td>
                        <Table.Td>{enrollment.installments_count ?? t("common.not_available")}</Table.Td>
                        <Table.Td>
                          <Badge color={enrollment.graduated ? "green" : "gray"} variant="light">
                            {enrollment.graduated ? t("common.yes") : t("common.no")}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="light" onClick={() => openEnrollmentDetail(enrollment.id)}>
                            {t("common.view")}
                          </Button>
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
            <Group grow align="flex-start">
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
              <Controller
                control={courseForm.control}
                name="month_index"
                render={({ field }) => (
                  <NumberInput
                    label={t("diplomaCourse.fields.monthIndex")}
                    description={t("diplomaCourse.monthHint")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={courseErrors.month_index?.message}
                    min={1}
                    max={6}
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
            <Group grow align="flex-start">
              <Controller
                control={enrollmentForm.control}
                name="deposit_amount"
                render={({ field }) => (
                  <NumberInput
                    label={t("diploma.fields.depositAmount")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={enrollmentErrors.deposit_amount?.message}
                    min={0}
                  />
                )}
              />
              <TextInput
                type="datetime-local"
                label={t("diploma.fields.depositPaidAt")}
                error={enrollmentErrors.deposit_paid_at?.message}
                {...enrollmentForm.register("deposit_paid_at")}
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

      <Modal
        opened={Boolean(detailEnrollmentId)}
        onClose={closeEnrollmentDetail}
        title={t("diploma.detail.title")}
        size="xl"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        {enrollmentDetailQuery.isLoading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : enrollmentDetailQuery.error ? (
          <Alert color="red" variant="light">
            {enrollmentDetailQuery.error instanceof Error
              ? enrollmentDetailQuery.error.message
              : t("common.unknown_error")}
          </Alert>
        ) : enrollmentDetail ? (
          <Stack gap="lg">
            <Paper withBorder radius="md" p="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={4}>{t("diploma.progress.title")}</Title>
                  <Badge color={enrollmentDetail.progress.graduated ? "green" : "gray"} variant="light">
                    {enrollmentDetail.progress.graduated ? t("diploma.progress.graduated") : t("diploma.progress.notGraduated")}
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      {t("diploma.progress.startPeriod")}
                    </Text>
                    <Text fw={600}>{enrollmentDetail.progress.start_period ?? t("common.not_available")}</Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      {t("diploma.progress.monthsRead")}
                    </Text>
                    <Text fw={600}>{t("diploma.progress.monthsReadValue", { read: enrollmentDetail.progress.months_read })}</Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      {t("diploma.progress.coursesPassed")}
                    </Text>
                    <Text fw={600}>
                      {t("diploma.progress.coursesPassedValue", {
                        passed: enrollmentDetail.progress.courses_passed,
                        total: enrollmentDetail.progress.courses_total
                      })}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      {t("diploma.progress.estimatedGraduationPeriod")}
                    </Text>
                    <Text fw={600}>
                      {enrollmentDetail.progress.estimated_graduation_period ?? t("common.not_available")}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      {t("diploma.progress.depositPaidAt")}
                    </Text>
                    <Text fw={600}>{formatDateTime(enrollmentDetail.progress.deposit_paid_at)}</Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">
                      {t("diploma.progress.payments")}
                    </Text>
                    <Text fw={600}>
                      {t("diploma.progress.paymentsValue", {
                        paid: enrollmentDetail.progress.payments_paid,
                        total: enrollmentDetail.progress.payments_total
                      })}
                    </Text>
                  </Stack>
                </SimpleGrid>
              </Stack>
            </Paper>

            <Stack gap="sm">
              <Title order={4}>{t("diplomaAssignment.title")}</Title>
              {detailAssignments.length === 0 ? (
                <Text c="dimmed">{t("diplomaAssignment.emptyAssignments")}</Text>
              ) : (
                detailAssignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    enrollmentId={enrollmentDetail.enrollment.id}
                    employeesById={employeesById}
                    canReview={canReviewAssignments}
                  />
                ))
              )}
            </Stack>

            <Stack gap="sm">
              <Title order={4}>{t("diplomaPayment.title")}</Title>
              <ScrollArea>
                <Table miw={900} verticalSpacing="sm" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("diplomaPayment.fields.period")}</Table.Th>
                      <Table.Th>{t("diplomaPayment.fields.amount")}</Table.Th>
                      <Table.Th>{t("diplomaPayment.fields.paid")}</Table.Th>
                      <Table.Th>{t("diplomaPayment.fields.paidAt")}</Table.Th>
                      <Table.Th>{t("diplomaPayment.fields.note")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {detailPayments.map((payment) => (
                      <PaymentRow key={payment.id} payment={payment} enrollmentId={enrollmentDetail.enrollment.id} />
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>

            <Paper withBorder radius="md" p="md">
              <Stack gap="md">
                <Title order={4}>{t("diplomaMaterial.title")}</Title>
                {materialError ? (
                  <Alert color="red" variant="light">
                    {materialError}
                  </Alert>
                ) : null}
                <Stack gap="xs">
                  <Text fw={600}>{t("diplomaMaterial.certificate")}</Text>
                  <DocumentLinks documents={certificateDocuments} />
                  {canManageEducation ? (
                    <Group align="flex-end">
                      <FileInput
                        label={t("diplomaMaterial.uploadCertificate")}
                        value={certificateFile}
                        onChange={setCertificateFile}
                        clearable
                        w={320}
                      />
                      <Button
                        variant="light"
                        onClick={() => void uploadCertificate()}
                        loading={uploadCertificateMutation.isPending}
                        disabled={!certificateFile}
                      >
                        {t("diplomaMaterial.upload")}
                      </Button>
                    </Group>
                  ) : null}
                </Stack>
                <Stack gap="xs">
                  <Text fw={600}>{t("diplomaMaterial.media")}</Text>
                  <DocumentLinks documents={mediaDocuments} />
                  {canManageEducation ? (
                    <Group align="flex-end">
                      <FileInput
                        label={t("diplomaMaterial.uploadMedia")}
                        value={mediaFiles}
                        onChange={(value) => setMediaFiles(value ?? [])}
                        multiple
                        clearable
                        w={320}
                      />
                      <Button
                        variant="light"
                        onClick={() => void uploadMedia()}
                        loading={uploadMediaMutation.isPending}
                        disabled={mediaFiles.length === 0}
                      >
                        {t("diplomaMaterial.upload")}
                      </Button>
                    </Group>
                  ) : null}
                </Stack>
              </Stack>
            </Paper>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
