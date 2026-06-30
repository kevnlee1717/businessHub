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
  diplomaProgramCreateSchema,
  diplomaProgramUpdateSchema,
  type DiplomaCourseCreateInput,
  type DiplomaCourseUpdateInput,
  type DiplomaAssignmentAction,
  type DiplomaEnrollmentCreateInput,
  type DiplomaEnrollmentUpdateInput,
  type DiplomaIntakeCreateInput,
  type DiplomaProgramCreateInput,
  type DiplomaProgramUpdateInput
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createDiplomaCourse,
  createDiplomaEnrollment,
  createDiplomaIntake,
  createDiplomaProgram,
  deleteDiplomaCourse,
  deleteDiplomaIntake,
  deleteDiplomaProgram,
  getDiplomaEnrollment,
  listDiplomaCourseEnrollments,
  listDiplomaCourses,
  listDiplomaEnrollments,
  listDiplomaIntakes,
  listDiplomaPrograms,
  listStudents,
  postAssignmentMessage,
  updateDiplomaPayment,
  updateDiplomaCourse,
  updateDiplomaEnrollment,
  updateDiplomaIntake,
  updateDiplomaProgram,
  uploadDiplomaCertificate,
  uploadDiplomaMedia,
  type DiplomaAssignment,
  type DiplomaCourse,
  type DiplomaEnrollment,
  type DiplomaIntake,
  type DiplomaPayment,
  type DiplomaProgram
} from "../../api/education";
import { fileUrl, searchDocuments, type DocumentMeta } from "../../api/dms";
import { listEmployees, type Employee } from "../../api/hr";
import { useCan } from "../../auth/permissions";
import { CreatableCombobox } from "../../components/CreatableCombobox";
import { StudentSelect } from "../../components/StudentSelect";
import { TablePagination } from "../../components/TablePagination";
import { TeacherMultiSelect } from "../../components/TeacherMultiSelect";
import { usePagination } from "../../hooks/usePagination";
import { displayStudentName, emptyToNull, emptyToUndefined, studentsQueryKey } from "./StudentsPage";

type CourseFormValues = {
  program_id?: string | null | undefined;
  name?: string | undefined;
  name_en?: string | undefined;
  content?: string | null | undefined;
  teacher_ids?: string[] | undefined;
  month_index?: number | null | undefined;
};

type DiplomaFormValues = {
  student_id?: string | undefined;
  program_id?: string | null | undefined;
  course_id?: string | null | undefined;
  intake_id?: string | null | undefined;
  program?: string | undefined;
  enroll_date?: string | undefined;
  installments_count?: number | null | undefined;
  deposit_amount?: string | number | null | undefined;
  deposit_paid_at?: string | null | undefined;
  graduated?: boolean | undefined;
};

type IntakeFormValues = {
  label: string;
  start_date: string;
  active: boolean;
};

type ProgramFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  active?: boolean | undefined;
  sort_order?: number | null | undefined;
  months?: number | null | undefined;
  price_sgd?: string | number | null | undefined;
};

type DiplomaPageSection = "programs" | "courses" | "enrollments" | "all";

type DiplomaPageProps = {
  section?: DiplomaPageSection;
};

const diplomaCoursesQueryKey = ["education", "diploma-courses"] as const;
const diplomaProgramsQueryKey = ["education", "diploma-programs"] as const;
const diplomaIntakesQueryKey = ["education", "diploma-intakes"] as const;
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

function displayTeachers(teachers?: { name: string; name_en?: string | null }[]) {
  return teachers?.map((teacher) => displayName(teacher)).filter(Boolean) ?? [];
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

function formatDate(value?: string | null) {
  return value || "-";
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

// 取日期部分 YYYY-MM-DD,用于 <input type="date">
function toDateValue(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
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
    program_id: course?.program_id ?? null,
    name: course?.name ?? "",
    name_en: course?.name_en ?? undefined,
    content: course?.content ?? null,
    teacher_ids: course?.teachers?.map((teacher) => teacher.id) ?? [],
    month_index: course?.month_index ?? null
  };
}

function getEnrollmentDefaultValues(enrollment?: DiplomaEnrollment): DiplomaFormValues {
  return {
    student_id: enrollment?.student_id ?? undefined,
    program_id: enrollment?.program_id ?? null,
    course_id: enrollment?.course_id ?? null,
    intake_id: enrollment?.intake_id ?? null,
    program: enrollment?.program ?? "-",
    enroll_date: enrollment?.enroll_date ?? undefined,
    installments_count: enrollment?.installments_count ?? 6,
    deposit_amount: enrollment?.deposit_amount ?? null,
    deposit_paid_at: toDateValue(enrollment?.deposit_paid_at),
    graduated: enrollment?.graduated ?? false
  };
}

function getProgramDefaultValues(program?: DiplomaProgram): ProgramFormValues {
  return {
    name: program?.name ?? "",
    name_en: program?.name_en ?? undefined,
    active: program?.active ?? true,
    sort_order: program?.sort_order ?? null,
    months: program?.months ?? null,
    price_sgd: program?.price_sgd ?? null
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

export function DiplomaPage({ section = "all" }: DiplomaPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseProgramFilter, setCourseProgramFilter] = useState<string | null>(null);
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [editingProgram, setEditingProgram] = useState<DiplomaProgram | null>(null);
  const [programModalOpened, setProgramModalOpened] = useState(false);
  const [editingCourse, setEditingCourse] = useState<DiplomaCourse | null>(null);
  const [courseModalOpened, setCourseModalOpened] = useState(false);
  const [intakeProgram, setIntakeProgram] = useState<DiplomaProgram | null>(null);
  const [intakeFormValues, setIntakeFormValues] = useState<IntakeFormValues>({
    label: "",
    start_date: "",
    active: true
  });
  const [intakeFormError, setIntakeFormError] = useState<string | null>(null);
  const [editingEnrollment, setEditingEnrollment] = useState<DiplomaEnrollment | null>(null);
  const [enrollmentModalOpened, setEnrollmentModalOpened] = useState(false);
  const [enrollmentSelectedProgramId, setEnrollmentSelectedProgramId] = useState<string | null>(null);
  const [detailEnrollmentId, setDetailEnrollmentId] = useState<string | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [programFormError, setProgramFormError] = useState<string | null>(null);
  const [courseFormError, setCourseFormError] = useState<string | null>(null);
  const [enrollmentFormError, setEnrollmentFormError] = useState<string | null>(null);
  const canManageEducation = useCan("education.manage");
  const canReviewAssignments = useCan("education.view");
  const showPrograms = section === "programs" || section === "all";
  const showCourses = section === "courses" || section === "all";
  const showEnrollments = section === "enrollments" || section === "all";
  const enrollmentCourseId = section === "enrollments" ? null : selectedCourseId;
  const {
    page: programsPage,
    pageSize: programsPageSize,
    setPage: setProgramsPage,
    setPageSize: setProgramsPageSize
  } = usePagination();
  const {
    page: coursesPage,
    pageSize: coursesPageSize,
    setPage: setCoursesPage,
    setPageSize: setCoursesPageSize
  } = usePagination();
  const {
    page: enrollmentsPage,
    pageSize: enrollmentsPageSize,
    setPage: setEnrollmentsPage,
    setPageSize: setEnrollmentsPageSize
  } = usePagination();

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: () => listStudents(),
    enabled: showEnrollments
  });

  const employeesQuery = useQuery({
    queryKey: employeesQueryKey,
    queryFn: () => listEmployees()
  });

  const coursesQuery = useQuery({
    queryKey: [...diplomaCoursesQueryKey, courseProgramFilter, coursesPage, coursesPageSize],
    queryFn: () => listDiplomaCourses(courseProgramFilter, { page: coursesPage, page_size: coursesPageSize }),
    placeholderData: keepPreviousData
  });

  const programsQuery = useQuery({
    queryKey: diplomaProgramsQueryKey,
    queryFn: () => listDiplomaPrograms()
  });

  const programsListQuery = useQuery({
    queryKey: [...diplomaProgramsQueryKey, "table", programsPage, programsPageSize],
    queryFn: () => listDiplomaPrograms({ page: programsPage, page_size: programsPageSize }),
    enabled: showPrograms,
    placeholderData: keepPreviousData
  });

  const enrollmentsQuery = useQuery({
    queryKey: [...diplomaQueryKey, studentFilter, enrollmentsPage, enrollmentsPageSize],
    queryFn: () =>
      listDiplomaEnrollments({
        student_id: studentFilter ?? undefined,
        page: enrollmentsPage,
        page_size: enrollmentsPageSize
      }),
    enabled: showEnrollments && !enrollmentCourseId,
    placeholderData: keepPreviousData
  });

  const courseEnrollmentsQuery = useQuery({
    queryKey: [...diplomaQueryKey, "course", enrollmentCourseId],
    queryFn: () => listDiplomaCourseEnrollments(enrollmentCourseId ?? ""),
    enabled: showEnrollments && Boolean(enrollmentCourseId)
  });

  const manageIntakesQuery = useQuery({
    queryKey: [...diplomaIntakesQueryKey, intakeProgram?.id],
    queryFn: () => listDiplomaIntakes(intakeProgram?.id ?? ""),
    enabled: Boolean(intakeProgram)
  });

  const enrollmentIntakesQuery = useQuery({
    queryKey: [...diplomaIntakesQueryKey, enrollmentSelectedProgramId],
    queryFn: () => listDiplomaIntakes(enrollmentSelectedProgramId ?? ""),
    enabled: enrollmentModalOpened && Boolean(enrollmentSelectedProgramId)
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
  const selectedCourseProgramId = useWatch({
    control: courseForm.control,
    name: "program_id"
  });

  const selectedProgramCoursesQuery = useQuery({
    queryKey: [...diplomaCoursesQueryKey, selectedCourseProgramId],
    queryFn: () => listDiplomaCourses(selectedCourseProgramId),
    enabled: courseModalOpened && Boolean(selectedCourseProgramId)
  });

  const programForm = useForm<ProgramFormValues>({
    resolver: zodResolver(
      editingProgram ? diplomaProgramUpdateSchema : diplomaProgramCreateSchema
    ) as Resolver<ProgramFormValues>,
    defaultValues: getProgramDefaultValues(editingProgram ?? undefined)
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

  const createProgramMutation = useMutation({
    mutationFn: createDiplomaProgram,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: diplomaProgramsQueryKey });
      closeProgramModal();
    }
  });

  const updateProgramMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DiplomaProgramUpdateInput }) => updateDiplomaProgram(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: diplomaProgramsQueryKey });
      closeProgramModal();
    }
  });

  const deleteProgramMutation = useMutation({
    mutationFn: deleteDiplomaProgram,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: diplomaProgramsQueryKey }),
        queryClient.invalidateQueries({ queryKey: diplomaCoursesQueryKey }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
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

  const createIntakeMutation = useMutation({
    mutationFn: ({ programId, body }: { programId: string; body: DiplomaIntakeCreateInput }) =>
      createDiplomaIntake(programId, body),
    onSuccess: async (_data, variables) => {
      setIntakeFormValues({ label: "", start_date: "", active: true });
      await queryClient.invalidateQueries({ queryKey: [...diplomaIntakesQueryKey, variables.programId] });
    }
  });

  const createEnrollmentIntakeMutation = useMutation({
    mutationFn: ({ programId, body }: { programId: string; body: DiplomaIntakeCreateInput }) =>
      createDiplomaIntake(programId, body)
  });

  const updateIntakeMutation = useMutation({
    mutationFn: ({ id, programId, active }: { id: string; programId: string; active: boolean }) =>
      updateDiplomaIntake(programId, id, { active }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...diplomaIntakesQueryKey, variables.programId] }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
    }
  });

  const deleteIntakeMutation = useMutation({
    mutationFn: ({ programId, id }: { programId: string; id: string }) => deleteDiplomaIntake(programId, id),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...diplomaIntakesQueryKey, variables.programId] }),
        queryClient.invalidateQueries({ queryKey: diplomaQueryKey })
      ]);
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
  const programs = programsQuery.data?.programs ?? [];
  const programRows = programsListQuery.data?.programs ?? [];
  const students = studentsQuery.data?.students ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const courseEnrollments = courseEnrollmentsQuery.data?.enrollments ?? [];
  const filteredCourseEnrollments = filterEnrollmentsByStudent(courseEnrollments, studentFilter);
  // Course enrollment panels need the full child list so student filtering stays local; paginate after filtering.
  const enrollments = enrollmentCourseId
    ? filteredCourseEnrollments.slice((enrollmentsPage - 1) * enrollmentsPageSize, enrollmentsPage * enrollmentsPageSize)
    : (enrollmentsQuery.data?.enrollments ?? []);
  const totalPrograms = programsListQuery.data?.total ?? programRows.length;
  const totalCourses = coursesQuery.data?.total ?? courses.length;
  const totalEnrollments = enrollmentCourseId
    ? filteredCourseEnrollments.length
    : (enrollmentsQuery.data?.total ?? enrollments.length);
  const selectedCourse = courses.find((course) => course.id === enrollmentCourseId) ?? null;
  const studentOptions = students.map((student) => ({
    value: student.id,
    label: displayStudentName(student)
  }));
  const programOptions = programs.map((program) => ({
    value: program.id,
    label: displayName(program),
    disabled: !program.active
  }));
  const programFilterOptions = programs.map((program) => ({
    value: program.id,
    label: displayName(program)
  }));
  const managedIntakes = manageIntakesQuery.data?.intakes ?? [];
  const enrollmentIntakeOptions = (enrollmentIntakesQuery.data?.intakes ?? [])
    .filter((intake) => intake.active || intake.id === editingEnrollment?.intake_id)
    .map((intake) => ({
      value: intake.id,
      label: intake.start_date ? `${intake.label} (${intake.start_date})` : intake.label
    }));
  const studentsById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const coursesById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const programsById = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs]);
  const selectedCourseProgram = programsById.get(selectedCourseProgramId ?? "");
  const selectedProgramCourses = selectedProgramCoursesQuery.data?.courses ?? [];
  const occupiedCourseMonths = useMemo(
    () =>
      new Set(
        selectedProgramCourses
          .filter((course) => course.id !== editingCourse?.id && course.month_index !== null && course.month_index !== undefined)
          .map((course) => course.month_index as number)
      ),
    [editingCourse?.id, selectedProgramCourses]
  );
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
  const programErrors = programForm.formState.errors;
  const enrollmentErrors = enrollmentForm.formState.errors;
  const isSavingProgram = createProgramMutation.isPending || updateProgramMutation.isPending;
  const isSavingCourse = createCourseMutation.isPending || updateCourseMutation.isPending;
  const isSavingEnrollment = createEnrollmentMutation.isPending || updateEnrollmentMutation.isPending;
  const isLoadingEnrollments = enrollmentCourseId ? courseEnrollmentsQuery.isLoading : enrollmentsQuery.isLoading;
  const loadError =
    (showEnrollments ? studentsQuery.error : null) ??
    employeesQuery.error ??
    programsQuery.error ??
    programsListQuery.error ??
    coursesQuery.error ??
    (showEnrollments ? (enrollmentsQuery.error ?? courseEnrollmentsQuery.error) : null);

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

  function openCreateProgramModal() {
    setEditingProgram(null);
    setProgramFormError(null);
    programForm.reset(getProgramDefaultValues());
    setProgramModalOpened(true);
  }

  function openEditProgramModal(program: DiplomaProgram) {
    setEditingProgram(program);
    setProgramFormError(null);
    programForm.reset(getProgramDefaultValues(program));
    setProgramModalOpened(true);
  }

  function closeProgramModal() {
    setProgramModalOpened(false);
    setEditingProgram(null);
    setProgramFormError(null);
    programForm.reset(getProgramDefaultValues());
  }

  function openIntakesModal(program: DiplomaProgram) {
    setIntakeProgram(program);
    setIntakeFormValues({ label: "", start_date: "", active: true });
    setIntakeFormError(null);
  }

  function closeIntakesModal() {
    setIntakeProgram(null);
    setIntakeFormValues({ label: "", start_date: "", active: true });
    setIntakeFormError(null);
  }

  function openCreateEnrollmentModal() {
    setEditingEnrollment(null);
    setEnrollmentFormError(null);
    const initialProgramId = enrollmentCourseId ? coursesById.get(enrollmentCourseId)?.program_id ?? null : null;
    setEnrollmentSelectedProgramId(initialProgramId);
    enrollmentForm.reset({
      ...getEnrollmentDefaultValues(),
      student_id: studentFilter ?? undefined,
      course_id: enrollmentCourseId ?? null,
      program_id: initialProgramId
    });
    setEnrollmentModalOpened(true);
  }

  function openEditEnrollmentModal(enrollment: DiplomaEnrollment) {
    setEditingEnrollment(enrollment);
    setEnrollmentFormError(null);
    setEnrollmentSelectedProgramId(enrollment.program_id ?? null);
    enrollmentForm.reset(getEnrollmentDefaultValues(enrollment));
    setEnrollmentModalOpened(true);
  }

  function closeEnrollmentModal() {
    setEnrollmentModalOpened(false);
    setEditingEnrollment(null);
    setEnrollmentSelectedProgramId(null);
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
        program_id: values.program_id ?? null,
        teacher_ids: values.teacher_ids ?? [],
        month_index: values.month_index ?? null
      };

      if (editingCourse) {
        await updateCourseMutation.mutateAsync({ id: editingCourse.id, body });
        return;
      }

      await createCourseMutation.mutateAsync(body as DiplomaCourseCreateInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "diploma_month_taken") {
        setCourseFormError(t("diplomaCourse.errors.monthTaken"));
      } else if (message === "diploma_month_out_of_range") {
        setCourseFormError(t("diplomaCourse.errors.monthOutOfRange"));
      } else {
        setCourseFormError(message || t("common.unknown_error"));
      }
    }
  });

  const onProgramSubmit = programForm.handleSubmit(async (values) => {
    setProgramFormError(null);

    try {
      const body = {
        name: values.name,
        name_en: values.name_en,
        active: values.active ?? true,
        sort_order: values.sort_order ?? undefined,
        months: values.months ?? null,
        price_sgd: values.price_sgd ?? null
      };

      if (editingProgram) {
        await updateProgramMutation.mutateAsync({ id: editingProgram.id, body });
        return;
      }

      await createProgramMutation.mutateAsync(body as DiplomaProgramCreateInput);
    } catch (error) {
      setProgramFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onEnrollmentSubmit = enrollmentForm.handleSubmit(async (values) => {
    setEnrollmentFormError(null);

    try {
      if (editingEnrollment) {
        await updateEnrollmentMutation.mutateAsync({
          id: editingEnrollment.id,
          body: {
            program_id: values.program_id ?? undefined,
            course_id: values.course_id ?? null,
            intake_id: values.intake_id ?? null,
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
        program_id: values.program_id ?? "",
        course_id: values.course_id ?? null,
        intake_id: values.intake_id ?? null,
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

  async function handleDeleteProgram(program: DiplomaProgram) {
    if (!window.confirm(t("diplomaProgram.confirmDelete", { name: displayName(program) }))) {
      return;
    }

    await deleteProgramMutation.mutateAsync(program.id);
  }

  async function handleToggleProgram(program: DiplomaProgram) {
    await updateProgramMutation.mutateAsync({
      id: program.id,
      body: {
        active: !program.active
      }
    });
  }

  async function handleCreateIntake() {
    if (!intakeProgram) {
      return;
    }

    setIntakeFormError(null);
    try {
      await createIntakeMutation.mutateAsync({
        programId: intakeProgram.id,
        body: {
          program_id: intakeProgram.id,
          label: intakeFormValues.label.trim(),
          start_date: intakeFormValues.start_date || null,
          active: intakeFormValues.active
        } satisfies DiplomaIntakeCreateInput
      });
    } catch (error) {
      setIntakeFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function handleToggleIntake(intake: DiplomaIntake) {
    if (!intakeProgram) {
      return;
    }

    setIntakeFormError(null);
    try {
      await updateIntakeMutation.mutateAsync({
        id: intake.id,
        programId: intakeProgram.id,
        active: !intake.active
      });
    } catch (error) {
      setIntakeFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function handleDeleteIntake(intake: DiplomaIntake) {
    if (!intakeProgram) {
      return;
    }

    await deleteIntakeMutation.mutateAsync({ programId: intakeProgram.id, id: intake.id });
  }

  async function handleCreateEnrollmentIntake(label: string) {
    if (!enrollmentSelectedProgramId) {
      return "";
    }

    const result = await createEnrollmentIntakeMutation.mutateAsync({
      programId: enrollmentSelectedProgramId,
      body: {
        program_id: enrollmentSelectedProgramId,
        label
      }
    });
    await queryClient.invalidateQueries({
      queryKey: [...diplomaIntakesQueryKey, enrollmentSelectedProgramId]
    });
    return result.intake.id;
  }

  function updateCourseProgramFilter(value: string | null) {
    setCourseProgramFilter(value);
    setCoursesPage(1);
  }

  function updateStudentFilter(value: string | null) {
    setStudentFilter(value);
    setEnrollmentsPage(1);
  }

  function showAllEnrollments() {
    setSelectedCourseId(null);
    setEnrollmentsPage(1);
  }

  const ContentLayout = section === "all" ? SimpleGrid : Stack;
  const contentLayoutProps =
    section === "all"
      ? { cols: { base: 1, xl: 2 }, spacing: "md" }
      : { gap: "md" };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("diploma.title")}</Title>
        {canManageEducation ? (
          <Group gap="xs">
            {showPrograms ? <Button onClick={openCreateProgramModal}>{t("diplomaProgram.add")}</Button> : null}
            {showCourses ? <Button onClick={openCreateCourseModal}>{t("diplomaCourse.add")}</Button> : null}
          </Group>
        ) : null}
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <ContentLayout {...contentLayoutProps}>
        {showPrograms ? (
          <Paper withBorder radius="md">
            <ScrollArea>
              <Table miw={760} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("diplomaProgram.fields.name")}</Table.Th>
                    <Table.Th>{t("diplomaProgram.fields.nameEn")}</Table.Th>
                    <Table.Th>{t("diplomaProgram.fields.sortOrder")}</Table.Th>
                    <Table.Th>{t("diplomaProgram.fields.status")}</Table.Th>
                    {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {programsListQuery.isLoading ? (
                    <Table.Tr>
                      <Table.Td colSpan={canManageEducation ? 5 : 4}>
                        <Group justify="center" py="lg">
                          <Loader size="sm" />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ) : programRows.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={canManageEducation ? 5 : 4}>
                        <Text ta="center" c="dimmed" py="lg">
                          {t("diplomaProgram.empty")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    programRows.map((program) => (
                      <Table.Tr key={program.id}>
                        <Table.Td>{program.name}</Table.Td>
                        <Table.Td>{program.name_en ?? t("common.not_available")}</Table.Td>
                        <Table.Td>{program.sort_order ?? t("common.not_available")}</Table.Td>
                        <Table.Td>
                          <Badge color={program.active ? "green" : "gray"} variant="light">
                            {program.active ? t("common.active") : t("diplomaProgram.inactive")}
                          </Badge>
                        </Table.Td>
                        {canManageEducation ? (
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Button size="xs" variant="light" onClick={() => openIntakesModal(program)}>
                                {t("diploma.intakes.manage")}
                              </Button>
                              <Button size="xs" variant="light" onClick={() => openEditProgramModal(program)}>
                                {t("common.edit")}
                              </Button>
                              <Button
                                size="xs"
                                variant="light"
                                color={program.active ? "yellow" : "green"}
                                loading={updateProgramMutation.isPending}
                                onClick={() => void handleToggleProgram(program)}
                              >
                                {program.active ? t("diplomaProgram.disable") : t("diplomaProgram.enable")}
                              </Button>
                              <Button
                                size="xs"
                                variant="light"
                                color="red"
                                loading={deleteProgramMutation.isPending}
                                onClick={() => void handleDeleteProgram(program)}
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
            <TablePagination
              total={totalPrograms}
              page={programsPage}
              pageSize={programsPageSize}
              onPageChange={setProgramsPage}
              onPageSizeChange={setProgramsPageSize}
            />
          </Paper>
        ) : null}

        {showCourses ? (
          <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Title order={3}>{t("education.tabs.courses")}</Title>
              <Select
                label={t("diplomaCourse.filters.program")}
                placeholder={t("common.all")}
                data={programFilterOptions}
                value={courseProgramFilter}
                onChange={updateCourseProgramFilter}
                clearable
                searchable
                w={240}
              />
            </Group>
          <ScrollArea>
            <Table miw={900} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("diplomaCourse.fields.name")}</Table.Th>
                  <Table.Th>{t("diplomaCourse.fields.program")}</Table.Th>
                  <Table.Th>{t("diplomaCourse.fields.monthIndex")}</Table.Th>
                  <Table.Th>{t("diplomaCourse.fields.teacher")}</Table.Th>
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
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setEnrollmentsPage(1);
                      }}
                      style={{
                        cursor: "pointer",
                        backgroundColor:
                          course.id === selectedCourseId ? "var(--mantine-color-blue-light)" : undefined
                      }}
                    >
                      <Table.Td>{displayName(course)}</Table.Td>
                      <Table.Td>
                        {displayName(programsById.get(course.program_id ?? "")) || t("common.not_available")}
                      </Table.Td>
                      <Table.Td>
                        {course.month_index
                          ? t("diplomaCourse.monthValue", { month: course.month_index })
                          : t("common.not_available")}
                      </Table.Td>
                      <Table.Td>
                        {displayTeachers(course.teachers).length > 0 ? (
                          <Group gap={4}>
                            {displayTeachers(course.teachers).map((teacher) => (
                              <Badge key={teacher} size="sm" variant="light">
                                {teacher}
                              </Badge>
                            ))}
                          </Group>
                        ) : (
                          t("common.not_available")
                        )}
                      </Table.Td>
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
          <TablePagination
            total={totalCourses}
            page={coursesPage}
            pageSize={coursesPageSize}
            onPageChange={setCoursesPage}
            onPageSizeChange={setCoursesPageSize}
          />
          </Stack>
          </Paper>
        ) : null}

        {showEnrollments ? (
          <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Group align="flex-end">
                <Title order={3}>
                  {selectedCourse ? displayName(selectedCourse) : t("diploma.enrollment.title")}
                </Title>
                {selectedCourse ? (
                  <Button size="xs" variant="subtle" onClick={showAllEnrollments}>
                    {t("common.all")}
                  </Button>
                ) : null}
                <Select
                  label={t("diploma.filters.student")}
                  placeholder={t("common.all")}
                  data={studentOptions}
                  value={studentFilter}
                  onChange={updateStudentFilter}
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
              <Table miw={900} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("diploma.fields.student")}</Table.Th>
                    <Table.Th>{t("diploma.fields.program")}</Table.Th>
                    <Table.Th>{t("diploma.fields.intake")}</Table.Th>
                    <Table.Th>{t("diploma.fields.enrollDate")}</Table.Th>
                    <Table.Th>{t("diploma.fields.depositAmount")}</Table.Th>
                    <Table.Th>{t("diploma.fields.installmentsCount")}</Table.Th>
                    <Table.Th>{t("diploma.fields.graduated")}</Table.Th>
                    <Table.Th>{t("common.view")}</Table.Th>
                    {canManageEducation ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {isLoadingEnrollments || studentsQuery.isLoading || programsQuery.isLoading ? (
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
                          {displayName(programsById.get(enrollment.program_id ?? "")) ||
                            enrollment.program ||
                            t("common.not_available")}
                        </Table.Td>
                        <Table.Td>{enrollment.intake_label ?? t("common.not_available")}</Table.Td>
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
            <TablePagination
              total={totalEnrollments}
              page={enrollmentsPage}
              pageSize={enrollmentsPageSize}
              onPageChange={setEnrollmentsPage}
              onPageSizeChange={setEnrollmentsPageSize}
            />
          </Stack>
          </Paper>
        ) : null}
      </ContentLayout>

      <Modal
        opened={programModalOpened}
        onClose={closeProgramModal}
        title={editingProgram ? t("diplomaProgram.edit") : t("diplomaProgram.add")}
        size="lg"
      >
        <form onSubmit={onProgramSubmit}>
          <Stack gap="md">
            {programFormError ? (
              <Alert color="red" variant="light">
                {programFormError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("diplomaProgram.fields.name")}
                error={programErrors.name?.message}
                {...programForm.register("name")}
              />
              <TextInput
                label={t("diplomaProgram.fields.nameEn")}
                error={programErrors.name_en?.message}
                {...programForm.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={programForm.control}
                name="price_sgd"
                render={({ field }) => (
                  <NumberInput
                    label={t("diplomaProgram.fields.priceSgd")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={programErrors.price_sgd?.message}
                    min={0}
                  />
                )}
              />
              <Controller
                control={programForm.control}
                name="months"
                render={({ field }) => (
                  <NumberInput
                    label={t("diplomaProgram.fields.months")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={programErrors.months?.message}
                    min={1}
                    allowDecimal={false}
                  />
                )}
              />
              <Controller
                control={programForm.control}
                name="sort_order"
                render={({ field }) => (
                  <NumberInput
                    label={t("diplomaProgram.fields.sortOrder")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(numberOrNull(value))}
                    error={programErrors.sort_order?.message}
                    allowDecimal={false}
                  />
                )}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={programForm.control}
                name="active"
                render={({ field }) => (
                  <Checkbox
                    label={t("common.active")}
                    checked={field.value ?? true}
                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                    mt={30}
                  />
                )}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeProgramModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingProgram}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

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
                name="program_id"
                render={({ field }) => (
                  <Select
                    label={t("diplomaCourse.fields.program")}
                    data={programOptions}
                    value={field.value ?? null}
                    onChange={(value) => {
                      field.onChange(value);
                      courseForm.setValue("month_index", null);
                    }}
                    error={courseErrors.program_id?.message}
                    clearable
                    searchable
                  />
                )}
              />
              <Controller
                control={courseForm.control}
                name="teacher_ids"
                render={({ field }) => (
                  <Input.Wrapper label={t("diplomaCourse.fields.teacher")} error={courseErrors.teacher_ids?.message}>
                    <TeacherMultiSelect
                      value={field.value ?? []}
                      onChange={(nextValue) => field.onChange(nextValue)}
                    />
                  </Input.Wrapper>
                )}
              />
            </Group>
            <Controller
              control={courseForm.control}
              name="month_index"
              render={({ field }) => {
                const months = selectedCourseProgram?.months ?? null;

                return (
                  <Input.Wrapper label={t("diplomaCourse.fields.monthIndex")} error={courseErrors.month_index?.message}>
                    {!selectedCourseProgramId || !months ? (
                      <Text size="sm" c="dimmed">
                        {t("diplomaCourse.monthPicker.selectProgramFirst")}
                      </Text>
                    ) : (
                      <Group gap="xs" wrap="wrap">
                        {Array.from({ length: months }, (_, index) => {
                          const month = index + 1;
                          const occupied = occupiedCourseMonths.has(month);
                          const selected = field.value === month;

                          return (
                            <Button
                              key={month}
                              type="button"
                              size="xs"
                              variant={selected ? "filled" : occupied ? "light" : "outline"}
                              color={occupied ? "gray" : "blue"}
                              disabled={occupied || selectedProgramCoursesQuery.isLoading}
                              onClick={() => field.onChange(month)}
                            >
                              {month}
                            </Button>
                          );
                        })}
                      </Group>
                    )}
                  </Input.Wrapper>
                );
              }}
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
        opened={Boolean(intakeProgram)}
        onClose={closeIntakesModal}
        title={`${t("diploma.intakes.title")} - ${intakeProgram ? displayName(intakeProgram) : ""}`}
        size="lg"
      >
        <Stack gap="md">
          {intakeFormError ? (
            <Alert color="red" variant="light">
              {intakeFormError}
            </Alert>
          ) : null}
          <Group grow align="flex-end">
            <TextInput
              label={t("diploma.intakes.label")}
              value={intakeFormValues.label}
              onChange={(event) => setIntakeFormValues((current) => ({ ...current, label: event.currentTarget.value }))}
              withAsterisk
            />
            <TextInput
              type="date"
              label={t("diploma.intakes.startDate")}
              value={intakeFormValues.start_date}
              onChange={(event) =>
                setIntakeFormValues((current) => ({ ...current, start_date: event.currentTarget.value }))
              }
            />
            <Checkbox
              label={t("common.active")}
              checked={intakeFormValues.active}
              onChange={(event) =>
                setIntakeFormValues((current) => ({ ...current, active: event.currentTarget.checked }))
              }
            />
            <Button
              onClick={() => void handleCreateIntake()}
              loading={createIntakeMutation.isPending}
              disabled={!intakeFormValues.label.trim()}
            >
              {t("diploma.intakes.add")}
            </Button>
          </Group>
          <ScrollArea>
            <Table miw={640} verticalSpacing="sm" withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("diploma.intakes.label")}</Table.Th>
                  <Table.Th>{t("diploma.intakes.startDate")}</Table.Th>
                  <Table.Th>{t("common.active")}</Table.Th>
                  <Table.Th>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {manageIntakesQuery.isLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : managedIntakes.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text ta="center" c="dimmed" py="lg">
                        {t("diploma.intakes.empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  managedIntakes.map((intake) => (
                    <Table.Tr key={intake.id}>
                      <Table.Td>{intake.label}</Table.Td>
                      <Table.Td>{formatDate(intake.start_date)}</Table.Td>
                      <Table.Td>
                        <Switch
                          checked={intake.active}
                          onChange={() => void handleToggleIntake(intake)}
                          disabled={updateIntakeMutation.isPending}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => void handleDeleteIntake(intake)}
                          loading={deleteIntakeMutation.isPending}
                        >
                          {t("common.delete")}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
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
              name="program_id"
              render={({ field }) => (
                <Select
                  label={t("diploma.fields.program")}
                  data={programOptions}
                  value={field.value ?? null}
                  onChange={(value) => {
                    field.onChange(value);
                    setEnrollmentSelectedProgramId(value);
                    enrollmentForm.setValue("intake_id", null);
                  }}
                  error={enrollmentErrors.program_id?.message}
                  clearable
                  searchable
                />
              )}
            />
            <Controller
              control={enrollmentForm.control}
              name="intake_id"
              render={({ field }) => (
                <CreatableCombobox
                  label={t("diploma.fields.intake")}
                  placeholder={
                    enrollmentSelectedProgramId
                      ? t("diploma.intakes.placeholder")
                      : t("diploma.intakes.selectProgramFirst")
                  }
                  options={enrollmentIntakeOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value)}
                  onCreate={handleCreateEnrollmentIntake}
                  creating={createEnrollmentIntakeMutation.isPending}
                  disabled={!enrollmentSelectedProgramId}
                  createDisabled={!enrollmentSelectedProgramId}
                  error={enrollmentErrors.intake_id?.message}
                />
              )}
            />
            {editingEnrollment ? null : (
              <TextInput
                type="date"
                label={t("diploma.fields.enrollDate")}
                error={enrollmentErrors.enroll_date?.message}
                {...enrollmentForm.register("enroll_date", { setValueAs: emptyToUndefined })}
              />
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
                    min={1}
                    max={6}
                    clampBehavior="strict"
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
                type="date"
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
                      {t("diploma.fields.intake")}
                    </Text>
                    <Text fw={600}>{enrollmentDetail.enrollment.intake_label ?? t("common.not_available")}</Text>
                  </Stack>
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
