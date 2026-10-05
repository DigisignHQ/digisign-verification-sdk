export const DEFAULT_DIGISIGN_API_BASE_URL = "https://sandbox.usedigisign.dev";

export type SigningAccess = {
  request_public_id: string;
  recipient_public_id: string;
  recipient?: { name?: string; email?: string };
  message?: string;
  private_message?: string;
  security_code?: string;
  link: string;
  auth_code?: string;
  auth_link?: string;
  expires_at?: string;
};

export type SigningStatus = {
  request_public_id: string;
  recipient_public_id: string;
  request_status: string;
  recipient_status: string;
  expired: boolean;
  waiting_for_order: boolean;
  requires_recipient_action: boolean;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
};

type ApiEnvelope<T> = { data?: T; value?: T; meta?: { message?: string } };

function endpoint(
  baseUrl: string,
  requestPublicId: string,
  recipientPublicId: string,
  suffix: string,
) {
  return `${baseUrl.replace(/\/$/, "")}/v1/requests/${encodeURIComponent(requestPublicId)}/recipients/${encodeURIComponent(recipientPublicId)}/${suffix}`;
}

async function request<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal,
    headers: { Accept: "application/json", ...init.headers },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiEnvelope<T> | undefined;
  if (!response.ok) {
    throw new Error(payload?.meta?.message || `DigiSign request failed (${response.status}).`);
  }
  const result = payload?.data ?? payload?.value;
  if (!result) throw new Error("DigiSign returned an empty response.");
  return result;
}

export function fetchSigningAccess({
  apiBaseUrl,
  requestPublicId,
  recipientPublicId,
  accessToken,
  workspaceId,
  organisationId,
  signal,
}: {
  apiBaseUrl: string;
  requestPublicId: string;
  recipientPublicId: string;
  accessToken: string;
  workspaceId: string;
  organisationId?: string;
  signal?: AbortSignal;
}) {
  return request<SigningAccess>(
    endpoint(apiBaseUrl, requestPublicId, recipientPublicId, "signing-access"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-ws-identifier": workspaceId,
        ...(organisationId ? { "x-o10n-identifier": organisationId } : {}),
        "Cache-Control": "no-store",
      },
    },
    signal,
  );
}

export function fetchSigningStatus({
  apiBaseUrl,
  requestPublicId,
  recipientPublicId,
  accessToken,
  workspaceId,
  organisationId,
  signal,
}: {
  apiBaseUrl: string;
  requestPublicId: string;
  recipientPublicId: string;
  accessToken: string;
  workspaceId: string;
  organisationId?: string;
  signal?: AbortSignal;
}) {
  return request<SigningStatus>(
    endpoint(apiBaseUrl, requestPublicId, recipientPublicId, "signing-status"),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-ws-identifier": workspaceId,
        ...(organisationId ? { "x-o10n-identifier": organisationId } : {}),
        "Cache-Control": "no-cache",
      },
    },
    signal,
  );
}
