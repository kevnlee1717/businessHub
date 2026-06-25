import { db, employees } from "@bh/db";
import { loginSchema } from "@bh/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { env } from "../env";

const authCookieName = "bh_token";

function publicEmployee(employee: typeof employees.$inferSelect) {
  return {
    id: employee.id,
    name: employee.name,
    name_en: employee.nameEn,
    email: employee.email,
    role: employee.role
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

  app.get("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, request.user.id))
      .limit(1);

    if (!employee) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    return { user: publicEmployee(employee) };
  });
}
