/** Default DigiSign sandbox API used to resolve internal verification links. */
export const DEFAULT_DIGISIGN_API_BASE_URL = "https://sandbox.usedigisign.dev";

/** Credentials and metadata returned for a recipient's verification session. */
export type SigningAccess = {
  /** Public identifier of the signature request. */
  request_public_id: string;
  /** Public identifier of the recipient. */
  recipient_public_id: string;
  /** Recipient details supplied by the request owner. */
  recipient?: SigningRecipient;
  /** Message shown to the recipient. */
  message?: string;
  /** Private message shown only to this recipient. */
  private_message?: string;
  /** Security code associated with the request. */
  security_code?: string;
  /** DigiSign Web verification URL. */
  link: string;
  /** Short-lived authentication code used by the Web flow. */
  auth_code?: string;
  /** DigiSign Web authentication URL. */
  auth_link?: string;
  /** Time at which the access credentials expire. */
  expires_at?: string;
};

/** Basic recipient identity returned with signing access details. */
export type SigningRecipient = {
  /** Recipient display name, when supplied by the request owner. */
  name?: string;
  /** Recipient email address, when supplied by the request owner. */
  email?: string;
};

/** Current request and recipient state returned by the status endpoint. */
export type SigningStatus = {
  /** Public identifier of the signature request. */
  request_public_id: string;
  /** Public identifier of the recipient. */
  recipient_public_id: string;
  /** Current request-level status, such as `pending` or `completed`. */
  request_status: string;
  /** Current recipient-level status, such as `draft` or `signed`. */
  recipient_status: string;
  /** Whether the request has expired. */
  expired: boolean;
  /** Whether an earlier recipient must act first. */
  waiting_for_order: boolean;
  /** Whether this recipient can currently take action. */
  requires_recipient_action: boolean;
  /** Timestamp at which the recipient first viewed the request. */
  viewed_at: string | null;
  /** Timestamp at which the recipient submitted their signature. */
  signed_at: string | null;
  /** Request expiration timestamp, when configured. */
  expires_at: string | null;
};

type ApiErrorPayload = {
  code?: string;
  message?: string;
  error?: string;
  statusCode?: number;
};

type ApiEnvelope<T> = {
  data?: T;
  value?: T;
  code?: string;
  message?: string;
  error?: string;
  statusCode?: number;
  meta?: ApiErrorPayload;
};

/**
 * Structured error thrown when a DigiSign API request fails.
 *
 * The SDK uses this error internally to classify credit failures and expose
 * them through the `credit-error` verification event.
 */
export class DigiSignApiError extends Error {
  /** HTTP status returned by DigiSign, when available. */
  readonly status?: number;
  /** Stable DigiSign error code, when returned by the API. */
  readonly code?: string;

  /** Creates an API error with optional HTTP and DigiSign error metadata. */
  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "DigiSignApiError";
    this.status = options?.status;
    this.code = options?.code;
  }

  /** Whether the error represents an exhausted or insufficient credit balance. */
  get isInsufficientCredits() {
    return (
      this.status === 402 ||
      this.code?.toUpperCase() === "INSUFFICIENT_CREDITS" ||
      this.code?.toUpperCase() === "LOW_USAGE_CREDIT"
    );
  }
}

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
    const error = payload?.meta ?? payload;
    throw new DigiSignApiError(
      error?.message || error?.error || `DigiSign request failed (${response.status}).`,
      {
        status: response.status,
        code: error?.code,
      },
    );
  }
  const result = payload?.data ?? payload?.value;
  if (!result) throw new Error("DigiSign returned an empty response.");
  return result;
}

/** Fetches a recipient's short-lived Web verification credentials. */
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

/** Fetches the current request and recipient status for polling. */
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
