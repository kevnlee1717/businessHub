import {
  type DiplomaEnrollmentCreateInput,
  type DiplomaEnrollmentUpdateInput,
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
  program: string;
  enroll_date?: string | null;
  billing_id?: string | null;
  installments_count?: number | null;
  graduated: boolean;
  created_at: string;
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
