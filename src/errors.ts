/**
 * One field-level failure inside an RFC 9457 problem document. Present on
 * `422 validation_error` responses from the `/api/v1` surface.
 */
export interface ProblemFieldError {
  /** RFC 6901 JSON Pointer to the offending field, e.g. `/audience_type`. */
  pointer: string;
  /** Machine-readable reason this field failed. */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

/**
 * The RFC 9457 problem document served as `application/problem+json` by every
 * 4xx/5xx response on the `/api/v1` surface. Legacy `/api/*` endpoints keep
 * their `{ success: false, error: { message, code } }` envelope instead.
 */
export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  request_id?: string;
  errors?: ProblemFieldError[];
}

function isProblemFieldError(value: unknown): value is ProblemFieldError {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.pointer === "string" && typeof entry.code === "string" && typeof entry.message === "string";
}

/**
 * Recognize an RFC 9457 problem document in a parsed response body.
 *
 * Accepts it on either signal: the response declared
 * `application/problem+json`, or the body carries the `type` + `title` + `code`
 * triple the media type requires. Legacy error envelopes carry none of those,
 * so they are never mistaken for problem documents.
 */
export function asProblemDocument(body: unknown, contentType?: string): ProblemDocument | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.code !== "string") return undefined;

  const declared = typeof contentType === "string" && contentType.toLowerCase().includes("application/problem+json");
  const shaped = typeof candidate.type === "string" && typeof candidate.title === "string";
  if (!declared && !shaped) return undefined;

  const errors = Array.isArray(candidate.errors) ? candidate.errors.filter(isProblemFieldError) : undefined;
  return {
    type: typeof candidate.type === "string" ? candidate.type : "about:blank",
    title: typeof candidate.title === "string" ? candidate.title : "",
    status: typeof candidate.status === "number" ? candidate.status : 0,
    detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
    instance: typeof candidate.instance === "string" ? candidate.instance : undefined,
    code: candidate.code,
    request_id: typeof candidate.request_id === "string" ? candidate.request_id : undefined,
    errors: errors && errors.length > 0 ? errors : undefined,
  };
}

/**
 * Base error thrown by the Sendly SDK for any non-2xx HTTP response or
 * transport failure. Subclasses below map to specific HTTP status codes
 * so callers can `instanceof`-narrow without parsing the body.
 */
export class SendlyError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly body: unknown;
  /**
   * Correlation id from an RFC 9457 problem document's `request_id` (`/api/v1`
   * errors only). Quote it in support requests. Undefined on legacy `/api/*`
   * errors and transport failures.
   */
  public readonly requestId?: string;
  /**
   * Field-level failures from an RFC 9457 problem document's `errors` array —
   * populated on `422 validation_error` responses from `/api/v1`. Undefined
   * everywhere else.
   */
  public readonly fieldErrors?: ProblemFieldError[];

  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(message);
    this.name = "SendlyError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.body = body;

    // `problem` is supplied by errorFromResponse, which has already inspected
    // the response's content type; sniffing the body covers direct construction.
    const doc = problem ?? asProblemDocument(body);
    this.requestId = doc?.request_id;
    this.fieldErrors = doc?.errors;
  }
}

/** 400 or 422 — request body or query failed validation. */
export class SendlyValidationError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyValidationError";
  }
}

/** 401 — missing or invalid `Authorization` header. */
export class SendlyAuthenticationError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyAuthenticationError";
  }
}

/** 403 — authenticated but lacks permission for the operation. */
export class SendlyPermissionError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyPermissionError";
  }
}

/** 404 — resource does not exist or is not visible to the caller. */
export class SendlyNotFoundError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyNotFoundError";
  }
}

/** 409 — conflict (already exists, immutable, etc.). */
export class SendlyConflictError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyConflictError";
  }
}

/**
 * 429 — rate limited. Honor `Retry-After` if present.
 *
 * On `/api/v1` the `errorCode` separates two different situations:
 * `rate_limited` is the per-key burst limiter and clears on its own (the
 * draft-11 `RateLimit` header's `t=` is *delta* seconds, while
 * `X-RateLimit-Reset` is an *absolute* epoch-seconds instant); `quota_exhausted`
 * is the billing-period quota and is terminal until the period resets or the
 * plan is upgraded, so retrying it just burns requests.
 */
export class SendlyRateLimitError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyRateLimitError";
  }
}

/** 5xx — server-side failure. Generally retryable with backoff. */
export class SendlyServerError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown, problem?: ProblemDocument) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyServerError";
  }
}

/** Transport-level failure (DNS, connect, abort, parse). */
export class SendlyConnectionError extends SendlyError {
  constructor(message: string, body?: unknown) {
    super(0, "connection_error", message, body);
    this.name = "SendlyConnectionError";
  }
}

/**
 * Map an HTTP status + error body to the appropriate error subclass.
 *
 * Handles both dialects. A legacy `/api/*` envelope
 * (`{ success: false, error: { message, code } }`) is unpacked by the caller,
 * which passes `errorCode`/`message` in. An RFC 9457 problem document from
 * `/api/v1` is detected here and overrides both: `errorCode` becomes the
 * problem's stable registry `code` (`invalid_api_key`, `scope_missing`,
 * `validation_error`, `quota_exhausted`, …) and the message becomes
 * `detail ?? title`. Either way the subclass is chosen by HTTP status, so
 * existing `instanceof` checks keep working across both surfaces.
 */
export function errorFromResponse(
  statusCode: number,
  errorCode: string,
  message: string,
  body?: unknown,
  contentType?: string,
): SendlyError {
  const problem = asProblemDocument(body, contentType);
  const code = problem?.code ?? errorCode;
  const text = problem ? (problem.detail ?? (problem.title || message)) : message;

  if (statusCode === 400 || statusCode === 422) return new SendlyValidationError(statusCode, code, text, body, problem);
  if (statusCode === 401) return new SendlyAuthenticationError(statusCode, code, text, body, problem);
  if (statusCode === 403) return new SendlyPermissionError(statusCode, code, text, body, problem);
  if (statusCode === 404) return new SendlyNotFoundError(statusCode, code, text, body, problem);
  if (statusCode === 409) return new SendlyConflictError(statusCode, code, text, body, problem);
  if (statusCode === 429) return new SendlyRateLimitError(statusCode, code, text, body, problem);
  if (statusCode >= 500) return new SendlyServerError(statusCode, code, text, body, problem);
  return new SendlyError(statusCode, code, text, body, problem);
}
