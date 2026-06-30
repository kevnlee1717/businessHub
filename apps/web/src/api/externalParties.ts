import { api } from "./client";

export type ExternalParty = {
  id: string;
  party_id?: string | null;
  name: string;
  name_en?: string | null;
  contact?: string | null;
  note?: string | null;
  active: boolean;
  statement_token: string;
  created_at: string;
};

export type ExternalPartyInput = {
  party_id?: string | null;
  name: string;
  name_en?: string | null;
  contact?: string | null;
  note?: string | null;
  active?: boolean;
};

export type ExternalPartyUpdateInput = Partial<ExternalPartyInput>;

type PaginationParams = {
  page?: number | undefined;
  page_size?: number | undefined;
};

type PaginatedResponse = {
  total?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

function queryString(params: ({ party_id?: string | null } & PaginationParams) = {}) {
  const searchParams = new URLSearchParams();

  if (params.party_id) {
    searchParams.set("party_id", params.party_id);
  }

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.page_size !== undefined) {
    searchParams.set("page_size", String(params.page_size));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listExternalParties(
  params: ({ party_id?: string | null } & PaginationParams) = {}
): Promise<{ external_parties: ExternalParty[] } & PaginatedResponse> {
  return api<{ external_parties: ExternalParty[] } & PaginatedResponse>(
    `/external-parties${queryString(params)}`
  );
}

export function createExternalParty(body: ExternalPartyInput): Promise<{ external_party: ExternalParty }> {
  return api<{ external_party: ExternalParty }>("/external-parties", {
    method: "POST",
    body
  });
}

export function updateExternalParty(
  id: string,
  body: ExternalPartyUpdateInput
): Promise<{ external_party: ExternalParty }> {
  return api<{ external_party: ExternalParty }>(`/external-parties/${id}`, {
    method: "PATCH",
    body
  });
}

export function deleteExternalParty(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/external-parties/${id}`, {
    method: "DELETE"
  });
}

export function rotateStatementToken(id: string): Promise<{ external_party: ExternalParty }> {
  return api<{ external_party: ExternalParty }>(`/external-parties/${id}/rotate-token`, {
    method: "POST"
  });
}
