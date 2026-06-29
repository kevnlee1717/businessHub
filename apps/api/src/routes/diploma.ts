import {
  db,
  diplomaAssignmentMessages,
  diplomaAssignments,
  diplomaCourses,
  diplomaEnrollments,
  diplomaIntakes,
  diplomaPayments,
  diplomaPrograms,
  documents
} from "@bh/db";
import {
  diplomaAssignmentMessageSchema,
  diplomaEnrollmentCreateSchema,
  diplomaEnrollmentUpdateSchema,
  diplomaPaymentUpdateSchema
} from "@bh/shared";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { type FastifyInstance } from "fastify";
import { ctxCan } from "../auth/context";
import { requirePerm } from "../auth/jwt";
import { saveUpload } from "../lib/files";
import { idParamsSchema, parseWithSchema, sendNotFound, toNumeric } from "./hrUtils";

function serializeDiploma(
  enrollment: typeof diplomaEnrollments.$inferSelect,
  intake?: Pick<typeof diplomaIntakes.$inferSelect, "id" | "label"> | null
) {
  return {
    id: enrollment.id,
    student_id: enrollment.studentId,
    program_id: enrollment.programId,
    course_id: enrollment.courseId,
    intake_id: enrollment.intakeId,
    intake_label: intake?.label ?? null,
    program: enrollment.program,
    enroll_date: enrollment.enrollDate,
    billing_id: enrollment.billingId,
    installments_count: enrollment.installmentsCount,
    start_period: enrollment.startPeriod,
    deposit_paid_at: enrollment.depositPaidAt,
    deposit_amount: enrollment.depositAmount,
    certificate_document_id: enrollment.certificateDocumentId,
    media_document_ids: enrollment.mediaDocumentIds,
    graduated: enrollment.graduated,
    created_at: enrollment.createdAt
  };
}

function serializeDocument(row: Pick<typeof documents.$inferSelect, "id" | "filename" | "storagePath">) {
  return {
    id: row.id,
    filename: row.filename,
    storage_path: row.storagePath
  };
}

function serializeAssignment(
  row: typeof diplomaAssignments.$inferSelect,
  course?: Pick<typeof diplomaCourses.$inferSelect, "id" | "name" | "monthIndex"> | null,
  messages: ReturnType<typeof serializeAssignmentMessage>[] = []
) {
  return {
    id: row.id,
    enrollment_id: row.enrollmentId,
    course_id: row.courseId,
    status: row.status,
    passed_at: row.passedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    course: course
      ? {
          id: course.id,
          name: course.name,
          month_index: course.monthIndex
        }
      : null,
    messages
  };
}

function serializeAssignmentMessage(
  row: typeof diplomaAssignmentMessages.$inferSelect,
  files: Pick<typeof documents.$inferSelect, "id" | "filename" | "storagePath">[] = []
) {
  return {
    id: row.id,
    assignment_id: row.assignmentId,
    author_id: row.authorId,
    action: row.action,
    content: row.content,
    document_ids: row.documentIds,
    files: files.map(serializeDocument),
    created_at: row.createdAt
  };
}

function serializePayment(row: typeof diplomaPayments.$inferSelect) {
  return {
    id: row.id,
    enrollment_id: row.enrollmentId,
    period: row.period,
    amount: row.amount,
    paid: row.paid,
    paid_at: row.paidAt,
    note: row.note,
    created_at: row.createdAt
  };
}

const diplomaEnrollmentQuerySchema = z.object({
  student_id: z.string().uuid().optional()
});

function getStartPeriod(enrollDate?: string) {
  const base = enrollDate ?? formatLocalDate(new Date());
  const [yearText, monthText, dayText] = base.split("-");
  const yearValue = Number(yearText);
  const monthValue = Number(monthText);
  const dayValue = Number(dayText);
  const monthOffset = dayValue <= 7 ? 0 : 1;
  return addMonthsToPeriod(`${yearValue}-${String(monthValue).padStart(2, "0")}`, monthOffset);
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonthsToPeriod(period: string, months: number) {
  const [yearText, monthText] = period.split("-");
  const yearValue = Number(yearText);
  const monthValue = Number(monthText);
  const totalMonths = yearValue * 12 + (monthValue - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthsRead(startPeriod: string | null) {
  if (!startPeriod) {
    return 0;
  }

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [startYearText, startMonthText] = startPeriod.split("-");
  const [currentYearText, currentMonthText] = currentPeriod.split("-");
  const startYear = Number(startYearText);
  const startMonth = Number(startMonthText);
  const currentYear = Number(currentYearText);
  const currentMonth = Number(currentMonthText);
  const months = (currentYear - startYear) * 12 + (currentMonth - startMonth) + 1;

  return Math.max(0, Math.min(6, months));
}

async function getMessageFilesById(messageRows: (typeof diplomaAssignmentMessages.$inferSelect)[]) {
  const documentIds = [...new Set(messageRows.flatMap((message) => message.documentIds))];
  const fileRows =
    documentIds.length === 0
      ? []
      : await db
          .select({
            id: documents.id,
            filename: documents.filename,
            storagePath: documents.storagePath
          })
          .from(documents)
          .where(inArray(documents.id, documentIds));

  return new Map(fileRows.map((file) => [file.id, file]));
}

export async function registerDiplomaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/diploma-enrollments", { preHandler: requirePerm("education.view") }, async (request) => {
    const query = parseWithSchema(diplomaEnrollmentQuerySchema, request.query);
    const rows = query.student_id
      ? await db
          .select({
            enrollment: diplomaEnrollments,
            intake: {
              id: diplomaIntakes.id,
              label: diplomaIntakes.label
            }
          })
          .from(diplomaEnrollments)
          .leftJoin(diplomaIntakes, eq(diplomaEnrollments.intakeId, diplomaIntakes.id))
          .where(eq(diplomaEnrollments.studentId, query.student_id))
          .orderBy(diplomaEnrollments.createdAt)
      : await db
          .select({
            enrollment: diplomaEnrollments,
            intake: {
              id: diplomaIntakes.id,
              label: diplomaIntakes.label
            }
          })
          .from(diplomaEnrollments)
          .leftJoin(diplomaIntakes, eq(diplomaEnrollments.intakeId, diplomaIntakes.id))
          .orderBy(diplomaEnrollments.createdAt);

    return { enrollments: rows.map((row) => serializeDiploma(row.enrollment, row.intake)) };
  });

  app.get("/diploma-enrollments/:id", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [enrollmentRow] = await db
      .select({
        enrollment: diplomaEnrollments,
        intake: {
          id: diplomaIntakes.id,
          label: diplomaIntakes.label
        }
      })
      .from(diplomaEnrollments)
      .leftJoin(diplomaIntakes, eq(diplomaEnrollments.intakeId, diplomaIntakes.id))
      .where(eq(diplomaEnrollments.id, id))
      .limit(1);

    if (!enrollmentRow) {
      return sendNotFound(reply);
    }

    const enrollment = enrollmentRow.enrollment;

    const assignmentRows = await db
      .select({
        assignment: diplomaAssignments,
        course: {
          id: diplomaCourses.id,
          name: diplomaCourses.name,
          monthIndex: diplomaCourses.monthIndex
        }
      })
      .from(diplomaAssignments)
      .leftJoin(diplomaCourses, eq(diplomaAssignments.courseId, diplomaCourses.id))
      .where(eq(diplomaAssignments.enrollmentId, id))
      .orderBy(asc(diplomaCourses.monthIndex), asc(diplomaAssignments.createdAt));

    const assignmentIds = assignmentRows.map((row) => row.assignment.id);
    const messageRows =
      assignmentIds.length === 0
        ? []
        : await db
            .select()
            .from(diplomaAssignmentMessages)
            .where(inArray(diplomaAssignmentMessages.assignmentId, assignmentIds))
            .orderBy(asc(diplomaAssignmentMessages.createdAt));
    const filesById = await getMessageFilesById(messageRows);
    const messagesByAssignmentId = new Map<string, ReturnType<typeof serializeAssignmentMessage>[]>();

    for (const message of messageRows) {
      const files = message.documentIds
        .map((documentId) => filesById.get(documentId))
        .filter((file): file is NonNullable<ReturnType<typeof filesById.get>> => Boolean(file));
      const serialized = serializeAssignmentMessage(message, files);
      const messages = messagesByAssignmentId.get(message.assignmentId) ?? [];
      messages.push(serialized);
      messagesByAssignmentId.set(message.assignmentId, messages);
    }

    const paymentRows = await db
      .select()
      .from(diplomaPayments)
      .where(eq(diplomaPayments.enrollmentId, id))
      .orderBy(asc(diplomaPayments.period));
    const [coursesTotalRow] = enrollment.programId
      ? await db
          .select({ count: sql<number>`count(*)::int` })
          .from(diplomaCourses)
          .where(eq(diplomaCourses.programId, enrollment.programId))
      : await db.select({ count: sql<number>`count(*)::int` }).from(diplomaCourses);
    const coursesTotal = coursesTotalRow?.count ?? 0;
    const coursesPassed = assignmentRows.filter((row) => row.assignment.status === "passed").length;
    const paymentsPaid = paymentRows.filter((payment) => payment.paid).length;

    return {
      enrollment: serializeDiploma(enrollment, enrollmentRow.intake),
      progress: {
        start_period: enrollment.startPeriod,
        months_read: monthsRead(enrollment.startPeriod),
        courses_total: coursesTotal,
        courses_passed: coursesPassed,
        graduated: enrollment.graduated,
        estimated_graduation_period: enrollment.startPeriod ? addMonthsToPeriod(enrollment.startPeriod, 5) : null,
        deposit_paid_at: enrollment.depositPaidAt,
        payments_paid: paymentsPaid,
        payments_total: paymentRows.length
      },
      assignments: assignmentRows.map((row) =>
        serializeAssignment(row.assignment, row.course, messagesByAssignmentId.get(row.assignment.id) ?? [])
      ),
      payments: paymentRows.map(serializePayment)
    };
  });

  app.post("/diploma-enrollments", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const body = parseWithSchema(diplomaEnrollmentCreateSchema, request.body);
    const startPeriod = getStartPeriod(body.enroll_date);
    const enrollment = await db.transaction(async (tx) => {
      const [program] = await tx.select().from(diplomaPrograms).where(eq(diplomaPrograms.id, body.program_id)).limit(1);

      if (!program) {
        throw new Error("diploma_program_not_found");
      }

      const [createdEnrollment] = await tx
        .insert(diplomaEnrollments)
        .values({
          studentId: body.student_id,
          programId: body.program_id,
          courseId: body.course_id,
          intakeId: body.intake_id,
          program: program.name,
          enrollDate: body.enroll_date,
          billingId: body.billing_id,
          installmentsCount: body.installments_count,
          startPeriod,
          depositAmount: toNumeric(body.deposit_amount),
          depositPaidAt: body.deposit_paid_at ? new Date(body.deposit_paid_at) : null,
          graduated: body.graduated
        })
        .returning();

      if (!createdEnrollment) {
        throw new Error("diploma_enrollment_create_failed");
      }

      const courses = await tx
        .select()
        .from(diplomaCourses)
        .where(eq(diplomaCourses.programId, body.program_id))
        .orderBy(asc(diplomaCourses.monthIndex), asc(diplomaCourses.createdAt));

      if (courses.length > 0) {
        await tx.insert(diplomaAssignments).values(
          courses.map((course) => ({
            enrollmentId: createdEnrollment.id,
            courseId: course.id,
            status: "pending" as const
          }))
        );
      }

      const installmentsCount = Math.max(1, program.months ?? 6);
      const programPrice = program.priceSgd === null || program.priceSgd === undefined ? null : Number(program.priceSgd);
      const otherInstallmentAmount =
        programPrice === null || Number.isNaN(programPrice) ? null : Math.floor(programPrice / installmentsCount);
      const firstInstallmentAmount =
        programPrice === null || otherInstallmentAmount === null
          ? null
          : programPrice - (installmentsCount - 1) * otherInstallmentAmount;

      await tx.insert(diplomaPayments).values(
        Array.from({ length: installmentsCount }, (_, index) => ({
          enrollmentId: createdEnrollment.id,
          period: addMonthsToPeriod(startPeriod, index),
          amount:
            firstInstallmentAmount === null || otherInstallmentAmount === null
              ? null
              : (index === 0 ? firstInstallmentAmount : otherInstallmentAmount).toFixed(2),
          paid: false
        }))
      );

      return createdEnrollment;
    });

    if (!enrollment) {
      throw new Error("diploma_enrollment_create_failed");
    }

    return reply.code(201).send({ enrollment: serializeDiploma(enrollment) });
  });

  app.patch("/diploma-enrollments/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaEnrollmentUpdateSchema, request.body);
    const enrollment = await db.transaction(async (tx) => {
      let programName = body.program;

      if (body.program_id !== undefined) {
        const [program] = await tx.select().from(diplomaPrograms).where(eq(diplomaPrograms.id, body.program_id)).limit(1);

        if (!program) {
          return null;
        }

        programName = program.name;
      }

      const [updated] = await tx
        .update(diplomaEnrollments)
        .set({
          studentId: body.student_id,
          programId: body.program_id,
          courseId: body.course_id,
          intakeId: body.intake_id,
          program: programName,
          enrollDate: body.enroll_date,
          billingId: body.billing_id,
          installmentsCount: body.installments_count,
          depositAmount: toNumeric(body.deposit_amount),
          depositPaidAt: body.deposit_paid_at === undefined ? undefined : body.deposit_paid_at ? new Date(body.deposit_paid_at) : null,
          graduated: body.graduated
        })
        .where(eq(diplomaEnrollments.id, id))
        .returning();

      return updated ?? undefined;
    });

    if (!enrollment) {
      return sendNotFound(reply);
    }

    return { enrollment: serializeDiploma(enrollment) };
  });

  app.post("/diploma-assignments/:id/messages", { preHandler: requirePerm("education.view") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [assignment] = await db.select().from(diplomaAssignments).where(eq(diplomaAssignments.id, id)).limit(1);

    if (!assignment) {
      return sendNotFound(reply);
    }

    let action: string | undefined;
    let content: string | null | undefined;
    const uploadedDocuments: (typeof documents.$inferSelect)[] = [];

    for await (const part of request.parts()) {
      if (part.type === "file") {
        const document = await saveUpload(part, {
          subjectType: "diploma_assignment",
          subjectId: id,
          uploadedBy: request.user.id
        });
        if (!document) {
          throw new Error("diploma_assignment_upload_failed");
        }
        uploadedDocuments.push(document);
        continue;
      }

      if (part.fieldname === "action") {
        action = String(part.value);
      }
      if (part.fieldname === "content") {
        const value = String(part.value).trim();
        content = value ? value : null;
      }
    }

    const body = parseWithSchema(diplomaAssignmentMessageSchema, { action, content });
    if ((body.action === "approve" || body.action === "reject") && !(await ctxCan(request, "education.manage"))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const result = await db.transaction(async (tx) => {
      const [message] = await tx
        .insert(diplomaAssignmentMessages)
        .values({
          assignmentId: id,
          authorId: request.user.id,
          action: body.action,
          content: body.content,
          documentIds: uploadedDocuments.map((document) => document.id)
        })
        .returning();

      if (!message) {
        throw new Error("diploma_assignment_message_failed");
      }

      let nextAssignment = assignment;
      const now = new Date();
      if (body.action === "submit" || body.action === "approve" || body.action === "reject") {
        const [updatedAssignment] = await tx
          .update(diplomaAssignments)
          .set({
            status: body.action === "submit" ? "submitted" : body.action === "approve" ? "passed" : "rejected",
            passedAt: body.action === "approve" ? now : body.action === "reject" ? null : assignment.passedAt,
            updatedAt: now
          })
          .where(eq(diplomaAssignments.id, id))
          .returning();

        if (!updatedAssignment) {
          throw new Error("diploma_assignment_update_failed");
        }
        nextAssignment = updatedAssignment;
      }

      if (body.action === "approve") {
        const siblingAssignments = await tx
          .select({ status: diplomaAssignments.status })
          .from(diplomaAssignments)
          .where(eq(diplomaAssignments.enrollmentId, assignment.enrollmentId));
        if (siblingAssignments.length > 0 && siblingAssignments.every((row) => row.status === "passed")) {
          await tx.update(diplomaEnrollments).set({ graduated: true }).where(eq(diplomaEnrollments.id, assignment.enrollmentId));
        }
      }

      return { assignment: nextAssignment, message };
    });

    return reply.code(201).send({
      assignment: serializeAssignment(result.assignment),
      message: serializeAssignmentMessage(result.message, uploadedDocuments)
    });
  });

  app.patch("/diploma-payments/:id", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const body = parseWithSchema(diplomaPaymentUpdateSchema, request.body);
    const [existingPayment] = await db.select().from(diplomaPayments).where(eq(diplomaPayments.id, id)).limit(1);

    if (!existingPayment) {
      return sendNotFound(reply);
    }

    const [payment] = await db
      .update(diplomaPayments)
      .set({
        paid: body.paid,
        paidAt:
          body.paid_at === undefined
            ? body.paid === true && !existingPayment.paidAt
              ? new Date()
              : undefined
            : body.paid_at
              ? new Date(body.paid_at)
              : null,
        amount: toNumeric(body.amount),
        note: body.note
      })
      .where(eq(diplomaPayments.id, id))
      .returning();

    if (!payment) {
      return sendNotFound(reply);
    }

    return { payment: serializePayment(payment) };
  });

  app.post("/diploma-enrollments/:id/certificate", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existingEnrollment] = await db.select().from(diplomaEnrollments).where(eq(diplomaEnrollments.id, id)).limit(1);

    if (!existingEnrollment) {
      return sendNotFound(reply);
    }

    let uploadedDocument: typeof documents.$inferSelect | undefined;
    for await (const part of request.parts()) {
      if (part.type !== "file") {
        continue;
      }
      if (uploadedDocument) {
        part.file.resume();
        continue;
      }

      uploadedDocument = await saveUpload(part, {
        subjectType: "diploma_certificate",
        subjectId: id,
        uploadedBy: request.user.id
      });
    }

    if (!uploadedDocument) {
      return reply.code(400).send({ error: "file_required" });
    }

    const [enrollment] = await db
      .update(diplomaEnrollments)
      .set({ certificateDocumentId: uploadedDocument.id })
      .where(eq(diplomaEnrollments.id, id))
      .returning();

    if (!enrollment) {
      return sendNotFound(reply);
    }

    return { enrollment: serializeDiploma(enrollment), document: serializeDocument(uploadedDocument) };
  });

  app.post("/diploma-enrollments/:id/media", { preHandler: requirePerm("education.manage") }, async (request, reply) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const [existingEnrollment] = await db.select().from(diplomaEnrollments).where(eq(diplomaEnrollments.id, id)).limit(1);

    if (!existingEnrollment) {
      return sendNotFound(reply);
    }

    const uploadedDocuments: (typeof documents.$inferSelect)[] = [];
    for await (const part of request.parts()) {
      if (part.type !== "file") {
        continue;
      }

      const document = await saveUpload(part, {
        subjectType: "diploma_media",
        subjectId: id,
        uploadedBy: request.user.id
      });
      if (!document) {
        throw new Error("diploma_media_upload_failed");
      }
      uploadedDocuments.push(document);
    }

    if (uploadedDocuments.length === 0) {
      return reply.code(400).send({ error: "file_required" });
    }

    const [enrollment] = await db
      .update(diplomaEnrollments)
      .set({ mediaDocumentIds: [...existingEnrollment.mediaDocumentIds, ...uploadedDocuments.map((document) => document.id)] })
      .where(eq(diplomaEnrollments.id, id))
      .returning();

    if (!enrollment) {
      return sendNotFound(reply);
    }

    return { enrollment: serializeDiploma(enrollment) };
  });
}
