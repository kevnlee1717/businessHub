import { type FastifyReply, type FastifyRequest } from "fastify";
import { type Role, ROLE_PERMISSIONS, can } from "@bh/shared";

export type AuthUser = {
  id: string;
  role: Role;
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

const knownPermissions = new Set<string>(Object.values(ROLE_PERMISSIONS).flat());

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

    if (!roles.includes(request.user.role)) {
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

    if (!knownPermissions.has(perm) || !can(request.user.role, perm as Parameters<typeof can>[1])) {
      await reply.code(403).send({ error: "forbidden" });
    }
  };
}
