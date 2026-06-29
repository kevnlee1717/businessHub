import { type TeacherCreateInput, type TeacherUpdateInput } from "@bh/shared";
import { api } from "./client";

export type Teacher = {
  id: string;
  name: string;
  name_en?: string | null;
  phone?: string | null;
  note?: string | null;
  active: boolean;
  created_at: string;
};

export function listTeachers(activeOnly?: boolean): Promise<{ teachers: Teacher[] }> {
  return api<{ teachers: Teacher[] }>(`/teachers${activeOnly ? "?active=true" : ""}`);
}

export function createTeacher(body: TeacherCreateInput): Promise<{ teacher: Teacher }> {
  return api<{ teacher: Teacher }>("/teachers", {
    method: "POST",
    body
  });
}

export function updateTeacher(id: string, body: TeacherUpdateInput): Promise<{ teacher: Teacher }> {
  return api<{ teacher: Teacher }>(`/teachers/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteTeacher(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/teachers/${id}`, {
    method: "DELETE"
  });
}
