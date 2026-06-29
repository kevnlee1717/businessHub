import { courseTeachers, db, teachers } from "@bh/db";
import { and, eq, inArray } from "drizzle-orm";

export type CourseKind = "diploma" | "english" | "wsq";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbConnection = typeof db | DbTransaction;

export type SerializedCourseTeacher = {
  id: string;
  name: string;
  name_en: string | null;
};

export async function courseTeachersByCourseIds(
  courseKind: CourseKind,
  courseIds: string[]
): Promise<Map<string, SerializedCourseTeacher[]>> {
  if (courseIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      courseId: courseTeachers.courseId,
      teacher: {
        id: teachers.id,
        name: teachers.name,
        nameEn: teachers.nameEn
      }
    })
    .from(courseTeachers)
    .innerJoin(teachers, eq(courseTeachers.teacherId, teachers.id))
    .where(and(eq(courseTeachers.courseKind, courseKind), inArray(courseTeachers.courseId, courseIds)))
    .orderBy(courseTeachers.createdAt);

  const result = new Map<string, SerializedCourseTeacher[]>();

  for (const row of rows) {
    const existing = result.get(row.courseId) ?? [];
    existing.push({
      id: row.teacher.id,
      name: row.teacher.name,
      name_en: row.teacher.nameEn
    });
    result.set(row.courseId, existing);
  }

  return result;
}

export async function courseTeachersForCourse(
  courseKind: CourseKind,
  courseId: string
): Promise<SerializedCourseTeacher[]> {
  const teachersByCourse = await courseTeachersByCourseIds(courseKind, [courseId]);
  return teachersByCourse.get(courseId) ?? [];
}

export async function replaceCourseTeachers(
  tx: DbConnection,
  courseKind: CourseKind,
  courseId: string,
  teacherIds: string[]
): Promise<void> {
  await tx
    .delete(courseTeachers)
    .where(and(eq(courseTeachers.courseKind, courseKind), eq(courseTeachers.courseId, courseId)));

  const uniqueTeacherIds = [...new Set(teacherIds)];

  if (uniqueTeacherIds.length === 0) {
    return;
  }

  await tx.insert(courseTeachers).values(
    uniqueTeacherIds.map((teacherId) => ({
      teacherId,
      courseKind,
      courseId
    }))
  );
}

export async function deleteCourseTeacherLinks(
  tx: DbConnection,
  courseKind: CourseKind,
  courseId: string
): Promise<void> {
  await tx
    .delete(courseTeachers)
    .where(and(eq(courseTeachers.courseKind, courseKind), eq(courseTeachers.courseId, courseId)));
}
