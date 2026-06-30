import { type TeacherCreateInput, type TeacherUpdateInput } from "@bh/shared";
import { api } from "./client";
import { type PaginationMeta, type PaginationParams } from "./education";

export type Teacher = {
  id: string;
  name: string;
  name_en?: string | null;
  phone?: string | null;
  note?: string | null;
  active: boolean;
  created_at: string;
};

export function listTeachers(
  activeOnly?: boolean,
  params: PaginationParams = {}
): Promise<{ teachers: Teacher[] } & PaginationMeta> {
  const searchParams = new URLSearchParams();
  if (activeOnly) {
    searchParams.set("active", "true");
  }
  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }

  const query = searchParams.toString();
  return api<{ teachers: Teacher[] } & PaginationMeta>(`/teachers${query ? `?${query}` : ""}`);
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
