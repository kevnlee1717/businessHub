import { z } from "zod";
import { diplomaAssignmentActions } from "../enums";

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

export const teacherCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  phone: optionalText,
  note: optionalText,
  active: z.boolean().optional()
});

export const teacherUpdateSchema = teacherCreateSchema.partial();

export const diplomaProgramCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  active: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

export const diplomaProgramUpdateSchema = diplomaProgramCreateSchema.partial();

export const diplomaEnrollmentCreateSchema = z.object({
  student_id: uuidField,
  program_id: uuidField,
  course_id: uuidField.nullable().optional(),
  intake_id: uuidField.nullable().optional(),
  program: optionalText,
  enroll_date: dateString.optional(),
  billing_id: uuidField.nullable().optional(),
  installments_count: z.number().int().min(1).max(6).nullable().optional(),
  deposit_amount: z.union([z.string(), z.number()]).nullable().optional(),
  deposit_paid_at: z.string().datetime().nullable().optional(),
  graduated: z.boolean().optional()
});

export const diplomaEnrollmentUpdateSchema = diplomaEnrollmentCreateSchema.partial();

export const diplomaCourseCreateSchema = z.object({
  program_id: uuidField.nullable().optional(),
  name: z.string().trim().min(1),
  name_en: optionalText,
  content: nullableOptionalText,
  teacher_id: uuidField.nullable().optional(),
  teacher_ids: z.array(uuidField).optional(),
  price_sgd: z.union([z.string(), z.number()]).nullable().optional(),
  duration: optionalText,
  month_index: z.number().int().min(1).max(6).nullable().optional()
});

export const diplomaCourseUpdateSchema = diplomaCourseCreateSchema.partial();

export const diplomaIntakeCreateSchema = z.object({
  program_id: uuidField,
  label: z.string().trim().min(1),
  start_date: dateString.nullable().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().nullable().optional()
});

export const diplomaIntakeUpdateSchema = z.object({
  label: z.string().trim().min(1).optional(),
  start_date: dateString.nullable().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().nullable().optional()
});

export const diplomaPaymentUpdateSchema = z.object({
  paid: z.boolean().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  amount: z.union([z.string(), z.number()]).nullable().optional(),
  note: nullableOptionalText
});

export const diplomaAssignmentMessageSchema = z.object({
  action: z.enum(diplomaAssignmentActions),
  content: nullableOptionalText
});

export const wsqCourseCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  content: nullableOptionalText,
  start_date: dateString.optional(),
  duration: optionalText,
  teacher_id: uuidField.nullable().optional(),
  teacher_ids: z.array(uuidField).optional(),
  price_sgd: z.union([z.string(), z.number()]).nullable().optional(),
  min_students: z.number().int().min(0).nullable().optional()
});

export const wsqCourseUpdateSchema = wsqCourseCreateSchema.partial();

export const wsqEnrollmentCreateSchema = z.object({
  student_id: uuidField,
  course_id: uuidField,
  billing_id: uuidField.nullable().optional()
});

export const englishLevelCreateSchema = z.object({
  name: z.string().trim().min(1),
  name_en: optionalText,
  level: z.number().int().nullable().optional(),
  price_sgd: z.union([z.string(), z.number()]).nullable().optional(),
  duration: optionalText
});

export const englishLevelUpdateSchema = englishLevelCreateSchema.partial();

export const englishClassCreateSchema = z.object({
  level_id: uuidField.nullable().optional(),
  teacher_id: uuidField.nullable().optional(),
  teacher_ids: z.array(uuidField).optional(),
  schedule: optionalText,
  start_date: dateString.optional(),
  end_date: dateString.optional()
});

export const englishClassUpdateSchema = englishClassCreateSchema.partial();

export const englishEnrollmentCreateSchema = z.object({
  student_id: uuidField,
  class_id: uuidField.nullable().optional(),
  level_id: uuidField.nullable().optional(),
  enroll_date: dateString.optional(),
  billing_id: uuidField.nullable().optional()
});

export const englishAttendanceMarkSchema = z.object({
  session_date: dateString,
  present: z.boolean()
});

export const englishClassAttendanceSchema = z.object({
  session_date: dateString,
  present_enrollment_ids: z.array(uuidField)
});

export type StudentCreateInput = z.infer<typeof studentCreateSchema>;
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;
export type TeacherCreateInput = z.infer<typeof teacherCreateSchema>;
export type TeacherUpdateInput = z.infer<typeof teacherUpdateSchema>;
export type DiplomaProgramCreateInput = z.infer<typeof diplomaProgramCreateSchema>;
export type DiplomaProgramUpdateInput = z.infer<typeof diplomaProgramUpdateSchema>;
export type DiplomaCourseCreateInput = z.infer<typeof diplomaCourseCreateSchema>;
export type DiplomaCourseUpdateInput = z.infer<typeof diplomaCourseUpdateSchema>;
export type DiplomaIntakeCreateInput = z.infer<typeof diplomaIntakeCreateSchema>;
export type DiplomaIntakeUpdateInput = z.infer<typeof diplomaIntakeUpdateSchema>;
export type DiplomaEnrollmentCreateInput = z.infer<typeof diplomaEnrollmentCreateSchema>;
export type DiplomaEnrollmentUpdateInput = z.infer<typeof diplomaEnrollmentUpdateSchema>;
export type DiplomaPaymentUpdateInput = z.infer<typeof diplomaPaymentUpdateSchema>;
export type DiplomaAssignmentMessageInput = z.infer<typeof diplomaAssignmentMessageSchema>;
export type WsqCourseCreateInput = z.infer<typeof wsqCourseCreateSchema>;
export type WsqCourseUpdateInput = z.infer<typeof wsqCourseUpdateSchema>;
export type WsqEnrollmentCreateInput = z.infer<typeof wsqEnrollmentCreateSchema>;
export type EnglishLevelCreateInput = z.infer<typeof englishLevelCreateSchema>;
export type EnglishLevelUpdateInput = z.infer<typeof englishLevelUpdateSchema>;
export type EnglishClassCreateInput = z.infer<typeof englishClassCreateSchema>;
export type EnglishClassUpdateInput = z.infer<typeof englishClassUpdateSchema>;
export type EnglishEnrollmentCreateInput = z.infer<typeof englishEnrollmentCreateSchema>;
export type EnglishAttendanceMarkInput = z.infer<typeof englishAttendanceMarkSchema>;
export type EnglishClassAttendanceInput = z.infer<typeof englishClassAttendanceSchema>;
