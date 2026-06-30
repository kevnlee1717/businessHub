import { companies, db, employees } from "@bh/db";
import { changePasswordSchema, loginSchema, updateProfileSchema } from "@bh/shared";
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { loadAuthContext } from "../auth/context";
import { env } from "../env";
import { saveUpload } from "../lib/files";

const authCookieName = "bh_token";

function publicEmployee(employee: typeof employees.$inferSelect) {
  return {
    id: employee.id,
    name: employee.name,
    name_en: employee.nameEn,
    email: employee.email,
    phone: employee.phone,
    avatar: employee.avatarPath ? `/${employee.avatarPath}` : null,
    role: employee.role,
    must_change_password: employee.mustChangePassword
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ZodError(parsed.error.issues);
    }

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.email, parsed.data.email))
      .limit(1);

    if (!employee) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const passwordOk = await bcrypt.compare(parsed.data.password, employee.passwordHash);

    if (!passwordOk) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const token = await reply.jwtSign(
      {
        id: employee.id,
        role: employee.role,
        email: employee.email
      },
      { expiresIn: "7d" }
    );

    reply.setCookie(authCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.NODE_ENV === "production"
    });

    return { user: publicEmployee(employee) };
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(authCookieName, {
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production"
    });

    return { ok: true };
  });

  app.post("/auth/change-password", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ZodError(parsed.error.issues);
    }

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, request.user.id))
      .limit(1);

    if (!employee) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (!employee.mustChangePassword) {
      const currentPasswordOk =
        parsed.data.current_password &&
        (await bcrypt.compare(parsed.data.current_password, employee.passwordHash));

      if (!currentPasswordOk) {
        return reply.code(400).send({ error: "invalid_current_password" });
      }
    }

    const newHash = await bcrypt.hash(parsed.data.new_password, 10);

    await db
      .update(employees)
      .set({ passwordHash: newHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(employees.id, employee.id));

    return { ok: true };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, request.user.id))
      .limit(1);

    if (!employee) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const ctx = await loadAuthContext(request);
    const companyRows =
      ctx.companyIds === "all"
        ? await db
            .select({
              id: companies.id,
              name: companies.name
            })
            .from(companies)
            .orderBy(asc(companies.name))
        : ctx.companyIds.length > 0
          ? await db
              .select({
                id: companies.id,
                name: companies.name
              })
              .from(companies)
              .where(inArray(companies.id, ctx.companyIds))
              .orderBy(asc(companies.name))
          : [];

    return {
      user: publicEmployee(employee),
      permissions: ctx.permissions,
      dataScope: ctx.dataScope,
      companies: companyRows
    };
  });

  app.patch("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ZodError(parsed.error.issues);
    }

    const [dup] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.email, parsed.data.email), ne(employees.id, request.user.id)))
      .limit(1);

    if (dup) {
      return reply.code(409).send({ error: "email_taken" });
    }

    const nameEn = parsed.data.name_en?.trim() ? parsed.data.name_en.trim() : null;
    const phone = parsed.data.phone?.trim() ? parsed.data.phone.trim() : null;
    const [updated] = await db
      .update(employees)
      .set({ name: parsed.data.name, nameEn, email: parsed.data.email, phone, updatedAt: new Date() })
      .where(eq(employees.id, request.user.id))
      .returning();

    if (!updated) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return { user: publicEmployee(updated) };
  });

  app.post("/auth/avatar", { preHandler: app.authenticate }, async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: "no_file" });
    }

    if (!data.mimetype.startsWith("image/")) {
      return reply.code(400).send({ error: "invalid_file_type" });
    }

    const document = await saveUpload(data, {
      subjectType: "employee_avatar",
      subjectId: request.user.id,
      uploadedBy: request.user.id
    });

    if (!document) {
      return reply.code(500).send({ error: "upload_failed" });
    }

    const [updated] = await db
      .update(employees)
      .set({ avatarPath: document.storagePath, updatedAt: new Date() })
      .where(eq(employees.id, request.user.id))
      .returning();

    if (!updated) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return { user: publicEmployee(updated) };
  });
}
