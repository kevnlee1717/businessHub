import { type FastifyReply, type FastifyRequest } from "fastify";
import { type Permission, type Role } from "@bh/shared";
import { loadAuthContext } from "./context";

export type AuthUser = {
  id: string;
  role: Role | null;
  email: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "unauthorized" });
  }
}

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await request.server.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    if (!request.user.role || !roles.includes(request.user.role)) {
      await reply.code(403).send({ error: "forbidden" });
    }
  };
}

export function requirePerm(perm: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await request.server.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const ctx = await loadAuthContext(request);

    if (!ctx.permissions.includes(perm as Permission)) {
      await reply.code(403).send({ error: "forbidden" });
    }
  };
}
