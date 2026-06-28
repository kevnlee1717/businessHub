import { type Role } from "@bh/shared";

const baseUrl = "/api";

export class UnauthorizedError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type User = {
  id: string;
  name: string;
  name_en: string | null;
  email: string;
  role?: Role | null;
  must_change_password: boolean;
};

export type DataScope = "all" | "company" | "self";

export type CompanyAccess = {
  id: string;
  name: string;
};

export type MeResponse = {
  user: User;
  permissions: string[];
  dataScope: DataScope;
  companies: CompanyAccess[];
};

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers: optionHeaders, ...init } = options;
  const headers = new Headers(optionHeaders);

  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const fetchInit: RequestInit = {
    ...init,
    headers,
    credentials: "include"
  };
  if (body !== undefined) {
    fetchInit.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, fetchInit);

  const data = await parseResponse(response);

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : response.statusText;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export async function login(email: string, password: string): Promise<{ user: User }> {
  return api<{ user: User }>("/auth/login", {
    method: "POST",
    body: { email, password }
  });
}

export async function logout(): Promise<{ ok: true }> {
  return api<{ ok: true }>("/auth/logout", {
    method: "POST"
  });
}

export async function getMe(): Promise<MeResponse> {
  return api<MeResponse>("/auth/me");
}

export async function changePassword(input: { current_password?: string; new_password: string }): Promise<{ ok: true }> {
  return api<{ ok: true }>("/auth/change-password", {
    method: "POST",
    body: input
  });
}
