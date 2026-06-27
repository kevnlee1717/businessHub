import {
  type DiplomaCourseCreateInput,
  type DiplomaCourseUpdateInput,
  type DiplomaAssignmentAction,
  type DiplomaAssignmentMessageInput,
  type DiplomaAssignmentStatus,
  type DiplomaEnrollmentCreateInput,
  type DiplomaEnrollmentUpdateInput,
  type DiplomaPaymentUpdateInput,
  type EnglishAttendanceMarkInput,
  type EnglishClassAttendanceInput,
  type EnglishClassCreateInput,
  type EnglishClassUpdateInput,
  type EnglishEnrollmentCreateInput,
  type EnglishLevelCreateInput,
  type EnglishLevelUpdateInput,
  type StudentCreateInput,
  type StudentUpdateInput,
  type WsqCourseCreateInput,
  type WsqCourseUpdateInput,
  type WsqEnrollmentCreateInput
} from "@bh/shared";
import { api } from "./client";

export type Student = {
  id: string;
  name: string;
  name_en?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
};

export type DiplomaEnrollment = {
  id: string;
  student_id: string;
  course_id?: string | null;
  program: string;
  enroll_date?: string | null;
  billing_id?: string | null;
  installments_count?: number | null;
  start_period?: string | null;
  deposit_amount?: string | null;
  deposit_paid_at?: string | null;
  certificate_document_id?: string | null;
  media_document_ids?: string[];
  graduated: boolean;
  created_at: string;
};

export type DiplomaCourse = {
  id: string;
  name: string;
  name_en?: string | null;
  content?: string | null;
  teacher_id?: string | null;
  price_sgd?: string | null;
  duration?: string | null;
  month_index?: number | null;
  created_at: string;
};

export type DiplomaAssignmentFile = {
  id: string;
  filename: string;
  storage_path: string;
};

export type DiplomaAssignmentMessage = {
  id: string;
  assignment_id: string;
  author_id?: string | null;
  action: DiplomaAssignmentAction;
  content?: string | null;
  document_ids?: string[];
  files: DiplomaAssignmentFile[];
  created_at: string;
};

export type DiplomaAssignment = {
  id: string;
  enrollment_id: string;
  course_id?: string | null;
  status: DiplomaAssignmentStatus;
  passed_at?: string | null;
  course?: {
    id: string;
    name: string;
    name_en?: string | null;
    month_index?: number | null;
  } | null;
  messages: DiplomaAssignmentMessage[];
  created_at?: string;
  updated_at?: string;
};

export type DiplomaPayment = {
  id: string;
  enrollment_id: string;
  period: string;
  amount?: string | null;
  paid: boolean;
  paid_at?: string | null;
  note?: string | null;
  created_at: string;
};

export type AcademyCollectionSummary = {
  expected_total: number | string;
  collected_total: number | string;
  outstanding_total: number | string;
  collection_rate: number | string;
  due_count: number;
  paid_count: number;
  unpaid_count: number;
};

export type AcademyCollectionRow = {
  payment_id: string;
  enrollment_id: string;
  student_id: string;
  student_name: string;
  program: string;
  amount: number | string;
  paid: boolean;
  paid_at?: string | null;
  period: string;
};

export type AcademyCollection = {
  period: string;
  summary: AcademyCollectionSummary;
  rows: AcademyCollectionRow[];
};

export type AcademyOverdueRow = {
  payment_id: string;
  student_name: string;
  program: string;
  period: string;
  amount: number | string;
  overdue_months: number;
  enroll_date?: string | null;
  phone?: string | null;
};

export type AcademyOverdue = {
  as_of_period: string;
  total_outstanding: number | string;
  rows: AcademyOverdueRow[];
};

export type AcademyHealth = {
  period: string;
  active_students: number;
  monthly_fixed_cost: number | string;
  expected_tuition: number | string;
  collected_tuition: number | string;
  avg_monthly_tuition_per_student: number | string;
  breakeven_students: number | null;
  gap: number | null;
};

export type DiplomaEnrollmentProgress = {
  start_period?: string | null;
  months_read: number;
  courses_total: number;
  courses_passed: number;
  graduated: boolean;
  estimated_graduation_period?: string | null;
  deposit_paid_at?: string | null;
  payments_paid: number;
  payments_total: number;
};

export type DiplomaEnrollmentDetail = {
  enrollment: DiplomaEnrollment;
  progress: DiplomaEnrollmentProgress;
  assignments: DiplomaAssignment[];
  payments: DiplomaPayment[];
};

export type PostAssignmentMessageInput = DiplomaAssignmentMessageInput & {
  files?: File[];
};

export type WsqCourse = {
  id: string;
  name: string;
  name_en?: string | null;
  content?: string | null;
  start_date?: string | null;
  duration?: string | null;
  teacher_id?: string | null;
  price_sgd?: string | null;
  min_students?: number | null;
  enrollment_count: number;
  can_open: boolean;
  created_at: string;
};

export type WsqEnrollment = {
  id: string;
  student_id: string;
  course_id: string;
  billing_id?: string | null;
  created_at: string;
};

export type EnglishLevel = {
  id: string;
  name: string;
  name_en?: string | null;
  level?: number | null;
  price_sgd?: string | null;
  duration?: string | null;
  created_at: string;
};

export type EnglishClass = {
  id: string;
  level_id?: string | null;
  teacher_id?: string | null;
  schedule?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
};

export type EnglishEnrollment = {
  id: string;
  student_id: string;
  class_id?: string | null;
  level_id?: string | null;
  enroll_date?: string | null;
  billing_id?: string | null;
  created_at: string;
};

export type EnglishAttendance = {
  id: string;
  enrollment_id: string;
  session_date: string;
  present: boolean;
  created_at: string;
};

export type EnglishAttendanceSummary = {
  total_sessions: number;
  attended_sessions: number;
};

export type EnglishClassListParams = {
  level_id?: string;
  teacher_id?: string;
};

export type EnglishEnrollmentListParams = {
  class_id?: string;
  student_id?: string;
};

export function listStudents(): Promise<{ students: Student[] }> {
  return api<{ students: Student[] }>("/students");
}

export function createStudent(body: StudentCreateInput): Promise<{ student: Student }> {
  return api<{ student: Student }>("/students", {
    method: "POST",
    body
  });
}

export function updateStudent(id: string, body: StudentUpdateInput): Promise<{ student: Student }> {
  return api<{ student: Student }>(`/students/${id}`, {
    method: "PATCH",
    body
  });
}

export function listDiplomaEnrollments(student_id?: string): Promise<{ enrollments: DiplomaEnrollment[] }> {
  const searchParams = new URLSearchParams();

  if (student_id) {
    searchParams.set("student_id", student_id);
  }

  const query = searchParams.toString();
  return api<{ enrollments: DiplomaEnrollment[] }>(`/diploma-enrollments${query ? `?${query}` : ""}`);
}

export function createDiplomaEnrollment(
  body: DiplomaEnrollmentCreateInput
): Promise<{ enrollment: DiplomaEnrollment }> {
  return api<{ enrollment: DiplomaEnrollment }>("/diploma-enrollments", {
    method: "POST",
    body
  });
}

export function updateDiplomaEnrollment(
  id: string,
  body: DiplomaEnrollmentUpdateInput
): Promise<{ enrollment: DiplomaEnrollment }> {
  return api<{ enrollment: DiplomaEnrollment }>(`/diploma-enrollments/${id}`, {
    method: "PATCH",
    body
  });
}

export function getDiplomaEnrollment(id: string): Promise<DiplomaEnrollmentDetail> {
  return api<DiplomaEnrollmentDetail>(`/diploma-enrollments/${id}`);
}

async function multipartApi<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : response.statusText;
    throw new Error(message);
  }

  return data as T;
}

export function postAssignmentMessage(
  assignmentId: string,
  input: PostAssignmentMessageInput
): Promise<{ assignment: DiplomaAssignment; message: DiplomaAssignmentMessage }> {
  const formData = new FormData();

  formData.append("action", input.action);
  if (input.content?.trim()) {
    formData.append("content", input.content.trim());
  }
  for (const file of input.files ?? []) {
    formData.append("files", file);
  }

  return multipartApi<{ assignment: DiplomaAssignment; message: DiplomaAssignmentMessage }>(
    `/diploma-assignments/${assignmentId}/messages`,
    formData
  );
}

export function updateDiplomaPayment(
  id: string,
  body: DiplomaPaymentUpdateInput
): Promise<{ payment: DiplomaPayment }> {
  return api<{ payment: DiplomaPayment }>(`/diploma-payments/${id}`, {
    method: "PATCH",
    body
  });
}

export function getAcademyCollection(period?: string): Promise<AcademyCollection> {
  const searchParams = new URLSearchParams();
  if (period) {
    searchParams.set("period", period);
  }

  const query = searchParams.toString();
  return api<AcademyCollection>(`/academy/collection${query ? `?${query}` : ""}`);
}

export function getAcademyOverdue(asOf?: string): Promise<AcademyOverdue> {
  const searchParams = new URLSearchParams();
  if (asOf) {
    searchParams.set("as_of", asOf);
  }

  const query = searchParams.toString();
  return api<AcademyOverdue>(`/academy/overdue${query ? `?${query}` : ""}`);
}

export function getAcademyHealth(period?: string): Promise<AcademyHealth> {
  const searchParams = new URLSearchParams();
  if (period) {
    searchParams.set("period", period);
  }

  const query = searchParams.toString();
  return api<AcademyHealth>(`/academy/health${query ? `?${query}` : ""}`);
}

export function markDiplomaPaymentPaid(id: string, paid: boolean): Promise<{ payment: DiplomaPayment }> {
  return updateDiplomaPayment(id, { paid });
}

export function uploadDiplomaCertificate(
  enrollmentId: string,
  file: File
): Promise<{ enrollment: DiplomaEnrollment; document: DiplomaAssignmentFile }> {
  const formData = new FormData();
  formData.append("file", file);

  return multipartApi<{ enrollment: DiplomaEnrollment; document: DiplomaAssignmentFile }>(
    `/diploma-enrollments/${enrollmentId}/certificate`,
    formData
  );
}

export function uploadDiplomaMedia(enrollmentId: string, files: File[]): Promise<{ enrollment: DiplomaEnrollment }> {
  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file);
  }

  return multipartApi<{ enrollment: DiplomaEnrollment }>(`/diploma-enrollments/${enrollmentId}/media`, formData);
}

export function listDiplomaCourses(): Promise<{ courses: DiplomaCourse[] }> {
  return api<{ courses: DiplomaCourse[] }>("/diploma-courses");
}

export function createDiplomaCourse(body: DiplomaCourseCreateInput): Promise<{ course: DiplomaCourse }> {
  return api<{ course: DiplomaCourse }>("/diploma-courses", {
    method: "POST",
    body
  });
}

export function updateDiplomaCourse(
  id: string,
  body: DiplomaCourseUpdateInput
): Promise<{ course: DiplomaCourse }> {
  return api<{ course: DiplomaCourse }>(`/diploma-courses/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteDiplomaCourse(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/diploma-courses/${id}`, {
    method: "DELETE"
  });
}

export function listDiplomaCourseEnrollments(courseId: string): Promise<{ enrollments: DiplomaEnrollment[] }> {
  return api<{ enrollments: DiplomaEnrollment[] }>(`/diploma-courses/${courseId}/enrollments`);
}

export function listWsqCourses(): Promise<{ courses: WsqCourse[] }> {
  return api<{ courses: WsqCourse[] }>("/wsq-courses");
}

export function createWsqCourse(body: WsqCourseCreateInput): Promise<{ course: WsqCourse }> {
  return api<{ course: WsqCourse }>("/wsq-courses", {
    method: "POST",
    body
  });
}

export function updateWsqCourse(id: string, body: WsqCourseUpdateInput): Promise<{ course: WsqCourse }> {
  return api<{ course: WsqCourse }>(`/wsq-courses/${id}`, {
    method: "PATCH",
    body
  });
}

export function listWsqCourseEnrollments(courseId: string): Promise<{ enrollments: WsqEnrollment[] }> {
  return api<{ enrollments: WsqEnrollment[] }>(`/wsq-courses/${courseId}/enrollments`);
}

export function createWsqEnrollment(body: WsqEnrollmentCreateInput): Promise<{ enrollment: WsqEnrollment }> {
  return api<{ enrollment: WsqEnrollment }>("/wsq-enrollments", {
    method: "POST",
    body
  });
}

export function deleteWsqEnrollment(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/wsq-enrollments/${id}`, {
    method: "DELETE"
  });
}

export function listEnglishLevels(): Promise<{ levels: EnglishLevel[] }> {
  return api<{ levels: EnglishLevel[] }>("/english-levels");
}

export function createEnglishLevel(body: EnglishLevelCreateInput): Promise<{ level: EnglishLevel }> {
  return api<{ level: EnglishLevel }>("/english-levels", {
    method: "POST",
    body
  });
}

export function updateEnglishLevel(
  id: string,
  body: EnglishLevelUpdateInput
): Promise<{ level: EnglishLevel }> {
  return api<{ level: EnglishLevel }>(`/english-levels/${id}`, {
    method: "PATCH",
    body
  });
}

export function listEnglishClasses(
  params: EnglishClassListParams = {}
): Promise<{ classes: EnglishClass[] }> {
  const searchParams = new URLSearchParams();

  if (params.level_id) {
    searchParams.set("level_id", params.level_id);
  }

  if (params.teacher_id) {
    searchParams.set("teacher_id", params.teacher_id);
  }

  const query = searchParams.toString();
  return api<{ classes: EnglishClass[] }>(`/english-classes${query ? `?${query}` : ""}`);
}

export function createEnglishClass(body: EnglishClassCreateInput): Promise<{ class: EnglishClass }> {
  return api<{ class: EnglishClass }>("/english-classes", {
    method: "POST",
    body
  });
}

export function updateEnglishClass(
  id: string,
  body: EnglishClassUpdateInput
): Promise<{ class: EnglishClass }> {
  return api<{ class: EnglishClass }>(`/english-classes/${id}`, {
    method: "PATCH",
    body
  });
}

export function listClassEnrollments(classId: string): Promise<{ enrollments: EnglishEnrollment[] }> {
  return api<{ enrollments: EnglishEnrollment[] }>(`/english-classes/${classId}/enrollments`);
}

export function listEnglishEnrollments(
  params: EnglishEnrollmentListParams = {}
): Promise<{ enrollments: EnglishEnrollment[] }> {
  const searchParams = new URLSearchParams();

  if (params.class_id) {
    searchParams.set("class_id", params.class_id);
  }

  if (params.student_id) {
    searchParams.set("student_id", params.student_id);
  }

  const query = searchParams.toString();
  return api<{ enrollments: EnglishEnrollment[] }>(`/english-enrollments${query ? `?${query}` : ""}`);
}

export function createEnglishEnrollment(
  body: EnglishEnrollmentCreateInput
): Promise<{ enrollment: EnglishEnrollment }> {
  return api<{ enrollment: EnglishEnrollment }>("/english-enrollments", {
    method: "POST",
    body
  });
}

export function deleteEnglishEnrollment(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/english-enrollments/${id}`, {
    method: "DELETE"
  });
}

export function markEnrollmentAttendance(
  enrollmentId: string,
  body: EnglishAttendanceMarkInput
): Promise<{ attendance: EnglishAttendance }> {
  return api<{ attendance: EnglishAttendance }>(`/english-enrollments/${enrollmentId}/attendance`, {
    method: "POST",
    body
  });
}

export function getEnrollmentAttendance(
  enrollmentId: string
): Promise<{ attendance: EnglishAttendance[]; summary: EnglishAttendanceSummary }> {
  return api<{ attendance: EnglishAttendance[]; summary: EnglishAttendanceSummary }>(
    `/english-enrollments/${enrollmentId}/attendance`
  );
}

export function markClassAttendance(
  classId: string,
  body: EnglishClassAttendanceInput
): Promise<{ marked: number }> {
  return api<{ marked: number }>(`/english-classes/${classId}/attendance`, {
    method: "POST",
    body
  });
}
