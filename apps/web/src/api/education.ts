import {
  type CourseDesignItemCreateInput,
  type CourseDesignItemUpdateInput,
  type CourseDesignTaskCreateInput,
  type CourseDesignTaskUpdateInput,
  type DiplomaModuleCreateInput,
  type DiplomaModuleUpdateInput,
  type DiplomaCourseCreateInput,
  type DiplomaCourseUpdateInput,
  type DiplomaIntakeCreateInput,
  type DiplomaIntakeUpdateInput,
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
import { ApiError, UnauthorizedError, api } from "./client";

export type PaginationParams = {
  page?: number | undefined;
  page_size?: number | undefined;
};

export type PaginationMeta = {
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

function appendPaginationParams(searchParams: URLSearchParams, params?: PaginationParams) {
  if (params?.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params?.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }
}

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

export type CourseTeacher = {
  id: string;
  name: string;
  name_en?: string | null;
};

export type DiplomaCourse = {
  id: string;
  name: string;
  name_en?: string | null;
  active: boolean;
  sort_order?: number | null;
  months?: number | null;
  price_sgd?: string | null;
  created_at: string;
};

export type DiplomaEnrollment = {
  id: string;
  student_id: string;
  course_id?: string | null;
  module_id?: string | null;
  intake_id?: string | null;
  intake_label?: string | null;
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

export type DiplomaIntake = {
  id: string;
  course_id: string;
  module_id?: string | null;
  label: string;
  start_date?: string | null;
  active: boolean;
  sort_order?: number | null;
  created_at: string;
};

export type DiplomaModule = {
  id: string;
  course_id?: string | null;
  name: string;
  name_en?: string | null;
  content?: string | null;
  teacher_id?: string | null;
  teachers?: CourseTeacher[];
  price_sgd?: string | null;
  weeks?: number | null;
  sort_order?: number | null;
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
  module_id?: string | null;
  status: DiplomaAssignmentStatus;
  passed_at?: string | null;
  module?: {
    id: string;
    name: string;
    name_en?: string | null;
    sort_order?: number | null;
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
} & PaginationMeta;

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
} & PaginationMeta;

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
  modules_total: number;
  modules_passed: number;
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
  teachers?: CourseTeacher[];
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
  teachers?: CourseTeacher[];
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

export type CourseDesignTaskStatus = "todo" | "doing" | "review" | "done";

export type CourseDesignTask = {
  id: string;
  title: string;
  owner: string;
  status: CourseDesignTaskStatus;
  deliverable?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CourseDesignSection = "level" | "pricing" | "addon" | "daily" | "tier" | "ref_app" | "screen";
export type CourseDesignItemStatus = "draft" | "approved";

export type CourseDesignItem = {
  id: string;
  section: CourseDesignSection;
  status: CourseDesignItemStatus;
  sort_order: number;
  fields: Record<string, unknown>;
  image_key?: string | null;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type EnglishClassListParams = {
  level_id?: string | undefined;
  teacher_id?: string | undefined;
} & PaginationParams;

export type EnglishEnrollmentListParams = {
  class_id?: string | undefined;
  student_id?: string | undefined;
} & PaginationParams;

export function listStudents(params: PaginationParams = {}): Promise<{ students: Student[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ students: Student[] } & PaginationMeta>(`/students${query ? `?${query}` : ""}`);
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

export type DiplomaEnrollmentListParams = PaginationParams & {
  student_id?: string | undefined;
};

export function listDiplomaEnrollments(
  params: DiplomaEnrollmentListParams = {}
): Promise<{ enrollments: DiplomaEnrollment[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();

  if (params.student_id) {
    searchParams.set("student_id", params.student_id);
  }
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ enrollments: DiplomaEnrollment[] } & PaginationMeta>(`/diploma-enrollments${query ? `?${query}` : ""}`);
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

async function parseFormDataResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function formDataErrorMessage(data: unknown, fallback: string) {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });
  const data = await parseFormDataResponse(response);

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    throw new ApiError(formDataErrorMessage(data, response.statusText), response.status);
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

export function getAcademyCollection(period?: string, params: PaginationParams = {}): Promise<AcademyCollection> {
  const searchParams = new URLSearchParams();
  if (period) {
    searchParams.set("period", period);
  }
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<AcademyCollection>(`/academy/collection${query ? `?${query}` : ""}`);
}

export function getAcademyOverdue(asOf?: string, params: PaginationParams = {}): Promise<AcademyOverdue> {
  const searchParams = new URLSearchParams();
  if (asOf) {
    searchParams.set("as_of", asOf);
  }
  appendPaginationParams(searchParams, params);

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

export function listDiplomaCourses(
  params: PaginationParams = {}
): Promise<{ courses: DiplomaCourse[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ courses: DiplomaCourse[] } & PaginationMeta>(`/diploma-courses${query ? `?${query}` : ""}`);
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

export function listDiplomaModules(
  courseId?: string | null,
  params: PaginationParams = {}
): Promise<{ modules: DiplomaModule[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();
  if (courseId) {
    searchParams.set("course_id", courseId);
  }
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ modules: DiplomaModule[] } & PaginationMeta>(`/diploma-modules${query ? `?${query}` : ""}`);
}

export function createDiplomaModule(body: DiplomaModuleCreateInput): Promise<{ module: DiplomaModule }> {
  return api<{ module: DiplomaModule }>("/diploma-modules", {
    method: "POST",
    body
  });
}

export function updateDiplomaModule(
  id: string,
  body: DiplomaModuleUpdateInput
): Promise<{ module: DiplomaModule }> {
  return api<{ module: DiplomaModule }>(`/diploma-modules/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteDiplomaModule(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/diploma-modules/${id}`, {
    method: "DELETE"
  });
}

export function listDiplomaIntakes(courseId: string): Promise<{ intakes: DiplomaIntake[] }> {
  return api<{ intakes: DiplomaIntake[] }>(`/diploma-courses/${courseId}/intakes`);
}

export function createDiplomaIntake(
  courseId: string,
  body: DiplomaIntakeCreateInput
): Promise<{ intake: DiplomaIntake }> {
  return api<{ intake: DiplomaIntake }>(`/diploma-courses/${courseId}/intakes`, {
    method: "POST",
    body
  });
}

export function updateDiplomaIntake(
  courseId: string,
  id: string,
  body: DiplomaIntakeUpdateInput
): Promise<{ intake: DiplomaIntake }> {
  return api<{ intake: DiplomaIntake }>(`/diploma-courses/${courseId}/intakes/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteDiplomaIntake(courseId: string, id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/diploma-courses/${courseId}/intakes/${id}`, {
    method: "DELETE"
  });
}

export function listDiplomaModuleEnrollments(moduleId: string): Promise<{ enrollments: DiplomaEnrollment[] }> {
  return api<{ enrollments: DiplomaEnrollment[] }>(`/diploma-modules/${moduleId}/enrollments`);
}

export function listWsqCourses(params: PaginationParams = {}): Promise<{ courses: WsqCourse[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ courses: WsqCourse[] } & PaginationMeta>(`/wsq-courses${query ? `?${query}` : ""}`);
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

export function listEnglishLevels(params: PaginationParams = {}): Promise<{ levels: EnglishLevel[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ levels: EnglishLevel[] } & PaginationMeta>(`/english-levels${query ? `?${query}` : ""}`);
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

export function listCourseDesignTasks(): Promise<{ tasks: CourseDesignTask[] }> {
  return api<{ tasks: CourseDesignTask[] }>("/course-design-tasks");
}

export function createCourseDesignTask(body: CourseDesignTaskCreateInput): Promise<{ task: CourseDesignTask }> {
  return api<{ task: CourseDesignTask }>("/course-design-tasks", {
    method: "POST",
    body
  });
}

export function updateCourseDesignTask(
  id: string,
  body: CourseDesignTaskUpdateInput
): Promise<{ task: CourseDesignTask }> {
  return api<{ task: CourseDesignTask }>(`/course-design-tasks/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteCourseDesignTask(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/course-design-tasks/${id}`, {
    method: "DELETE"
  });
}

export function listCourseDesignItems(): Promise<{ items: CourseDesignItem[] }> {
  return api<{ items: CourseDesignItem[] }>("/course-design-items");
}

export function createCourseDesignItem(body: CourseDesignItemCreateInput): Promise<{ item: CourseDesignItem }> {
  return api<{ item: CourseDesignItem }>("/course-design-items", {
    method: "POST",
    body
  });
}

export function updateCourseDesignItem(
  id: string,
  body: CourseDesignItemUpdateInput
): Promise<{ item: CourseDesignItem }> {
  return api<{ item: CourseDesignItem }>(`/course-design-items/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteCourseDesignItem(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/course-design-items/${id}`, {
    method: "DELETE"
  });
}

export function uploadCourseDesignItemImage(id: string, file: File): Promise<{ item: CourseDesignItem }> {
  const formData = new FormData();
  formData.append("file", file);
  return postFormData<{ item: CourseDesignItem }>(`/course-design-items/${id}/image`, formData);
}

export function listEnglishClasses(
  params: EnglishClassListParams = {}
): Promise<{ classes: EnglishClass[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();

  if (params.level_id) {
    searchParams.set("level_id", params.level_id);
  }

  if (params.teacher_id) {
    searchParams.set("teacher_id", params.teacher_id);
  }
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ classes: EnglishClass[] } & PaginationMeta>(`/english-classes${query ? `?${query}` : ""}`);
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
): Promise<{ enrollments: EnglishEnrollment[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();

  if (params.class_id) {
    searchParams.set("class_id", params.class_id);
  }

  if (params.student_id) {
    searchParams.set("student_id", params.student_id);
  }
  appendPaginationParams(searchParams, params);

  const query = searchParams.toString();
  return api<{ enrollments: EnglishEnrollment[] } & PaginationMeta>(`/english-enrollments${query ? `?${query}` : ""}`);
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
