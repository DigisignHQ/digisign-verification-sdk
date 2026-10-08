/** Default DigiSign sandbox API used to resolve internal verification links. */
export const DEFAULT_DIGISIGN_API_BASE_URL = "https://sandbox.usedigisign.dev";

/** Credentials and metadata returned for a recipient's verification session. */
export type SigningAccess = {
  /** Public identifier of the signature request. */
  request_public_id?: string;
  /** Public identifier of the recipient. */
  recipient_public_id?: string;
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

/** Recipient details returned by the request-details endpoint. */
export type SigningRequestRecipient = SigningRecipient & {
  /** Public identifier of the recipient. */
  public_id: string;
  /** Current recipient action status, such as `draft` or `signed`. */
  status: string;
  /** Recipient action, such as `sign` or `cc`. */
  action?: string;
  /** Whether an earlier recipient must act first. */
  waiting_for_order: boolean;
  /** Whether this recipient can currently take action. */
  requires_recipient_action: boolean;
  /** Timestamp at which the recipient first viewed the request. */
  viewed_at: string | null;
  /** Timestamp at which the recipient submitted their signature. */
  signed_at: string | null;
  /** Backend-generated short-link credentials, or null when unavailable. */
  signing_access: SigningAccess | null;
};

/** Request details returned by the backend for access resolution and polling. */
export type SigningRequestDetails = {
  /** Public identifier of the signature request. */
  public_id: string;
  /** Current request-level status, such as `pending` or `completed`. */
  status: string;
  /** Request expiration timestamp, when configured. */
  expiration: string | null;
  /** Whether the request is expired according to the backend. */
  expired?: boolean;
  /** Recipients and their current signing access details. */
  recipients: SigningRequestRecipient[];
};

/** Stable request and recipient state exposed by the SDK callbacks. */
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

  /** Whether the backend rejected a request because it uses the legacy SDK contract. */
  get isLegacySigningContract() {
    return this.status === 410;
  }
}

function requestEndpoint(baseUrl: string, requestPublicId: string) {
  return `${baseUrl.replace(/\/$/, "")}/v1/requests/${encodeURIComponent(requestPublicId)}`;
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

/**
 * Fetches request details, including recipient signing access and status.
 *
 * The backend generates the short verification link and returns it as
 * `recipients[].signing_access.link`.
 */
export function fetchSigningRequest({
  apiBaseUrl,
  requestPublicId,
  accessToken,
  workspaceId,
  organisationId,
  signal,
}: {
  apiBaseUrl: string;
  requestPublicId: string;
  accessToken: string;
  workspaceId: string;
  organisationId?: string;
  signal?: AbortSignal;
}) {
  return request<SigningRequestDetails>(
    requestEndpoint(apiBaseUrl, requestPublicId),
    {
      method: "GET",
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

/**
 * Converts the backend request-details response to the SDK's stable status
 * callback shape.
 */
export function toSigningStatus(
  request: SigningRequestDetails,
  recipientPublicId: string,
): SigningStatus {
  const recipient = request.recipients.find(({ public_id }) => public_id === recipientPublicId);
  if (!recipient) {
    throw new DigiSignApiError("DigiSign did not return the requested recipient.", {
      code: "RECIPIENT_NOT_FOUND",
    });
  }
  return {
    request_public_id: request.public_id,
    recipient_public_id: recipient.public_id,
    request_status: request.status,
    recipient_status: recipient.status,
    expired: request.expired ?? isExpired(request.expiration),
    waiting_for_order: recipient.waiting_for_order,
    requires_recipient_action: recipient.requires_recipient_action,
    viewed_at: recipient.viewed_at,
    signed_at: recipient.signed_at,
    expires_at: request.expiration,
  };
}

function isExpired(expiration: string | null) {
  return Boolean(expiration && new Date(expiration).getTime() <= Date.now());
}
