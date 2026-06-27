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

export function listExternalParties(): Promise<{ external_parties: ExternalParty[] }> {
  return api<{ external_parties: ExternalParty[] }>("/external-parties");
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
