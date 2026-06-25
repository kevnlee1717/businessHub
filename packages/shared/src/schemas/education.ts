import { z } from "zod";

const optionalText = z.string().trim().min(1).optional();
const nullableOptionalText = z.string().trim().min(1).nullable().optional();
const uuidField = z.string().uuid();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const studentCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  phone: optionalText,
  email: optionalText,
  note: nullableOptionalText
});

export const studentUpdateSchema = studentCreateSchema.partial();

export const diplomaEnrollmentCreateSchema = z.object({
  student_id: uuidField,
  program: z.string().trim().min(1),
  enroll_date: dateString.optional(),
  billing_id: uuidField.nullable().optional(),
  installments_count: z.number().int().min(0).nullable().optional(),
  graduated: z.boolean().optional()
});

export const diplomaEnrollmentUpdateSchema = diplomaEnrollmentCreateSchema.partial();

export const wsqCourseCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  content: nullableOptionalText,
  start_date: dateString.optional(),
  duration: optionalText,
  teacher_id: uuidField.nullable().optional(),
  price_sgd: z.union([z.string(), z.number()]).nullable().optional(),
  min_students: z.number().int().min(0).nullable().optional()
});

export const wsqCourseUpdateSchema = wsqCourseCreateSchema.partial();

export const wsqEnrollmentCreateSchema = z.object({
  student_id: uuidField,
  course_id: uuidField,
  billing_id: uuidField.nullable().optional()
});

export type StudentCreateInput = z.infer<typeof studentCreateSchema>;
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;
export type DiplomaEnrollmentCreateInput = z.infer<typeof diplomaEnrollmentCreateSchema>;
export type DiplomaEnrollmentUpdateInput = z.infer<typeof diplomaEnrollmentUpdateSchema>;
export type WsqCourseCreateInput = z.infer<typeof wsqCourseCreateSchema>;
export type WsqCourseUpdateInput = z.infer<typeof wsqCourseUpdateSchema>;
export type WsqEnrollmentCreateInput = z.infer<typeof wsqEnrollmentCreateSchema>;
