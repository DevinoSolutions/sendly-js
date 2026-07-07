/**
 * Base error thrown by the Sendly SDK for any non-2xx HTTP response or
 * transport failure. Subclasses below map to specific HTTP status codes
 * so callers can `instanceof`-narrow without parsing the body.
 */
export class SendlyError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly body: unknown;

  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(message);
    this.name = "SendlyError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.body = body;
  }
}

/** 400 — request body or query failed validation. */
export class SendlyValidationError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyValidationError";
  }
}

/** 401 — missing or invalid `Authorization` header. */
export class SendlyAuthenticationError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyAuthenticationError";
  }
}

/** 403 — authenticated but lacks permission for the operation. */
export class SendlyPermissionError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyPermissionError";
  }
}

/** 404 — resource does not exist or is not visible to the caller. */
export class SendlyNotFoundError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyNotFoundError";
  }
}

/** 409 — conflict (already exists, immutable, etc.). */
export class SendlyConflictError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyConflictError";
  }
}

/** 429 — rate limited. Honor `Retry-After` if present. */
export class SendlyRateLimitError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyRateLimitError";
  }
}

/** 5xx — server-side failure. Generally retryable with backoff. */
export class SendlyServerError extends SendlyError {
  constructor(statusCode: number, errorCode: string, message: string, body?: unknown) {
    super(statusCode, errorCode, message, body);
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

/** Map an HTTP status + error envelope to the appropriate error subclass. */
export function errorFromResponse(statusCode: number, errorCode: string, message: string, body?: unknown): SendlyError {
  if (statusCode === 400) return new SendlyValidationError(statusCode, errorCode, message, body);
  if (statusCode === 401) return new SendlyAuthenticationError(statusCode, errorCode, message, body);
  if (statusCode === 403) return new SendlyPermissionError(statusCode, errorCode, message, body);
  if (statusCode === 404) return new SendlyNotFoundError(statusCode, errorCode, message, body);
  if (statusCode === 409) return new SendlyConflictError(statusCode, errorCode, message, body);
  if (statusCode === 429) return new SendlyRateLimitError(statusCode, errorCode, message, body);
  if (statusCode >= 500) return new SendlyServerError(statusCode, errorCode, message, body);
  return new SendlyError(statusCode, errorCode, message, body);
}
