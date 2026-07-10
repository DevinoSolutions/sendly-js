// src/resources/contacts.ts
function idemHeader(opts) {
  if (!opts?.idempotencyKey) return void 0;
  return { "Idempotency-Key": opts.idempotencyKey };
}
var ContactsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /** Create a new contact (fails on duplicate). */
  async create(body, opts) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/contacts",
      body,
      headers: idemHeader(opts)
    });
    return this.client.unwrap(envelope);
  }
  /** Insert or update a contact identified by email. */
  async upsert(body, opts) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/contacts/upsert",
      body,
      headers: idemHeader(opts)
    });
    return this.client.unwrap(envelope);
  }
  /** Bulk-create contacts (up to API limit). Returns per-row results. */
  async bulkCreate(body, opts) {
    return this.client.request({
      method: "POST",
      path: "/api/contacts/bulk",
      body,
      headers: idemHeader(opts)
    });
  }
  /** Bulk-delete contacts by id or email. */
  async bulkDelete(body) {
    return this.client.request({
      method: "DELETE",
      path: "/api/contacts/bulk",
      body
    });
  }
  /** List contacts with search + cursor pagination. */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/contacts",
      query
    });
  }
  /** Fetch a single contact by id. */
  async get(id) {
    const envelope = await this.client.request({
      method: "GET",
      path: `/api/contacts/${encodeURIComponent(id)}`
    });
    return this.client.unwrap(envelope);
  }
  /** Patch a contact (partial update of `data`, `subscribed`, etc.). */
  async update(id, body) {
    const envelope = await this.client.request({
      method: "PATCH",
      path: `/api/contacts/${encodeURIComponent(id)}`,
      body
    });
    return this.client.unwrap(envelope);
  }
  /** Delete a contact. Returns 204. */
  async delete(id) {
    await this.client.request({
      method: "DELETE",
      path: `/api/contacts/${encodeURIComponent(id)}`,
      noContent: true
    });
  }
};

// src/resources/domains.ts
var DomainsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Register a new sending domain.
   *
   * Pass `region` to pin this domain to a specific AWS SES region (e.g.
   * `eu-west-1`). On the very first domain for a project this also locks the
   * project's region; subsequent calls must match.
   *
   * The response includes DNS records to set.
   */
  async create(body) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/domains",
      body
    });
    return this.client.unwrap(envelope);
  }
  /** List all domains for the project. */
  async list() {
    return this.client.request({
      method: "GET",
      path: "/api/domains"
    });
  }
  /** Fetch a single domain. */
  async get(id) {
    const envelope = await this.client.request({
      method: "GET",
      path: `/api/domains/${encodeURIComponent(id)}`
    });
    return this.client.unwrap(envelope);
  }
  /** Trigger SES verification for a domain. */
  async verify(id) {
    const envelope = await this.client.request({
      method: "POST",
      path: `/api/domains/${encodeURIComponent(id)}/verify`
    });
    return this.client.unwrap(envelope);
  }
  /** Read current SES verification status for a domain. */
  async getVerification(id) {
    const envelope = await this.client.request({
      method: "GET",
      path: `/api/domains/${encodeURIComponent(id)}/verify`
    });
    return this.client.unwrap(envelope);
  }
  /** Delete a domain. */
  async delete(id) {
    await this.client.request({
      method: "DELETE",
      path: `/api/domains/${encodeURIComponent(id)}`
    });
  }
};

// src/resources/emails.ts
function idemHeader2(opts) {
  if (!opts?.idempotencyKey) return void 0;
  return { "Idempotency-Key": opts.idempotencyKey };
}
var EmailsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /** Send a single transactional email. */
  async send(body, opts) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/emails",
      body,
      headers: idemHeader2(opts)
    });
    return this.client.unwrap(envelope);
  }
  /** Send a batch (up to 100) of transactional emails in one call. */
  async batch(body, opts) {
    return this.client.request({
      method: "POST",
      path: "/api/emails/batch",
      body,
      headers: idemHeader2(opts)
    });
  }
  /** List emails with cursor-based pagination + filters. */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/emails",
      query
    });
  }
  /** Fetch a single email and its delivery events. */
  async get(id) {
    return this.client.request({
      method: "GET",
      path: `/api/emails/${encodeURIComponent(id)}`
    });
  }
  /** Cancel a scheduled (PENDING) email before it fires. */
  async cancelSchedule(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/emails/${encodeURIComponent(id)}/schedule`
    });
  }
};

// src/resources/events.ts
var EventsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Track a custom event for a contact. Both FULL (`sk_*`) and SENDING_ONLY
   * (`pk_*`) keys are accepted, but reserved system event names are rejected.
   */
  async track(body) {
    return this.client.request({
      method: "POST",
      path: "/api/track",
      body
    });
  }
};

// src/resources/suppression.ts
var SuppressionResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /** Add an email to the project suppression list. */
  async add(body) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/suppression",
      body
    });
    return this.client.unwrap(envelope);
  }
  /** List suppressions with optional reason filter + cursor pagination. */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/suppression",
      query
    });
  }
  /** Check whether a given email is suppressed. */
  async get(email) {
    return this.client.request({
      method: "GET",
      path: `/api/suppression/${encodeURIComponent(email)}`
    });
  }
  /** Remove an email from the suppression list. Returns 204. */
  async remove(email) {
    await this.client.request({
      method: "DELETE",
      path: `/api/suppression/${encodeURIComponent(email)}`,
      noContent: true
    });
  }
};

// src/resources/templates.ts
var TemplatesResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /** Create a reusable email template. */
  async create(body) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/templates",
      body
    });
    return this.client.unwrap(envelope);
  }
  /** List templates with offset pagination + optional type filter. */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/templates",
      query
    });
  }
  /** Fetch a single template by id. */
  async get(id) {
    const envelope = await this.client.request({
      method: "GET",
      path: `/api/templates/${encodeURIComponent(id)}`
    });
    return this.client.unwrap(envelope);
  }
  /** Patch an existing template. */
  async update(id, body) {
    const envelope = await this.client.request({
      method: "PATCH",
      path: `/api/templates/${encodeURIComponent(id)}`,
      body
    });
    return this.client.unwrap(envelope);
  }
  /** Delete a template. Returns 204 unless still referenced. */
  async delete(id) {
    await this.client.request({
      method: "DELETE",
      path: `/api/templates/${encodeURIComponent(id)}`,
      noContent: true
    });
  }
};

// src/resources/verify.ts
var VerifyResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Validate an email address — checks syntax, MX records, disposable domains,
   * and plus-addressing. The endpoint is unauthenticated; the SDK still sends
   * its bearer header, which the server harmlessly ignores.
   */
  async email(body) {
    return this.client.request({
      method: "POST",
      path: "/api/verify",
      body
    });
  }
};

// src/resources/webhooks.ts
var WebhooksResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Create a new outbound webhook subscription. The response includes the
   * signing secret — store it now, it is only returned in full at creation
   * and rotation time.
   */
  async create(body) {
    return this.client.request({
      method: "POST",
      path: "/api/webhooks",
      body
    });
  }
  /** List all webhooks for the project. */
  async list() {
    return this.client.request({
      method: "GET",
      path: "/api/webhooks"
    });
  }
  /** Fetch a single webhook (without its signing secret). */
  async get(id) {
    return this.client.request({
      method: "GET",
      path: `/api/webhooks/${encodeURIComponent(id)}`
    });
  }
  /** Patch a webhook (URL, event types, active flag). */
  async update(id, body) {
    const envelope = await this.client.request({
      method: "PATCH",
      path: `/api/webhooks/${encodeURIComponent(id)}`,
      body
    });
    return this.client.unwrap(envelope);
  }
  /** Delete a webhook. */
  async delete(id) {
    await this.client.request({
      method: "DELETE",
      path: `/api/webhooks/${encodeURIComponent(id)}`
    });
  }
  /** Rotate the webhook signing secret. The response contains the new secret. */
  async rotateSecret(id) {
    return this.client.request({
      method: "POST",
      path: `/api/webhooks/${encodeURIComponent(id)}/rotate-secret`
    });
  }
  /** List recent delivery attempts for a webhook. */
  async listCalls(id, query) {
    return this.client.request({
      method: "GET",
      path: `/api/webhooks/${encodeURIComponent(id)}/calls`,
      query
    });
  }
};

// src/errors.ts
var SendlyError = class extends Error {
  statusCode;
  errorCode;
  body;
  constructor(statusCode, errorCode, message, body) {
    super(message);
    this.name = "SendlyError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.body = body;
  }
};
var SendlyValidationError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyValidationError";
  }
};
var SendlyAuthenticationError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyAuthenticationError";
  }
};
var SendlyPermissionError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyPermissionError";
  }
};
var SendlyNotFoundError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyNotFoundError";
  }
};
var SendlyConflictError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyConflictError";
  }
};
var SendlyRateLimitError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyRateLimitError";
  }
};
var SendlyServerError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body) {
    super(statusCode, errorCode, message, body);
    this.name = "SendlyServerError";
  }
};
var SendlyConnectionError = class extends SendlyError {
  constructor(message, body) {
    super(0, "connection_error", message, body);
    this.name = "SendlyConnectionError";
  }
};
function errorFromResponse(statusCode, errorCode, message, body) {
  if (statusCode === 400) return new SendlyValidationError(statusCode, errorCode, message, body);
  if (statusCode === 401) return new SendlyAuthenticationError(statusCode, errorCode, message, body);
  if (statusCode === 403) return new SendlyPermissionError(statusCode, errorCode, message, body);
  if (statusCode === 404) return new SendlyNotFoundError(statusCode, errorCode, message, body);
  if (statusCode === 409) return new SendlyConflictError(statusCode, errorCode, message, body);
  if (statusCode === 429) return new SendlyRateLimitError(statusCode, errorCode, message, body);
  if (statusCode >= 500) return new SendlyServerError(statusCode, errorCode, message, body);
  return new SendlyError(statusCode, errorCode, message, body);
}

// src/client.ts
var SDK_VERSION = "0.1.0";
var DEFAULT_BASE_URL = "https://api.sendly.now";
var Sendly = class {
  emails;
  contacts;
  domains;
  templates;
  webhooks;
  suppression;
  events;
  verify;
  apiKey;
  baseUrl;
  fetchImpl;
  timeout;
  defaultHeaders;
  constructor(options) {
    if (!options || !options.apiKey) {
      throw new SendlyError(0, "invalid_options", "Sendly: `apiKey` is required.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new SendlyError(
        0,
        "no_fetch",
        "Sendly: global `fetch` is not available. Pass `fetch` in options (Node <18 / non-fetch runtime)."
      );
    }
    this.timeout = options.timeout ?? 3e4;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.emails = new EmailsResource(this);
    this.contacts = new ContactsResource(this);
    this.domains = new DomainsResource(this);
    this.templates = new TemplatesResource(this);
    this.webhooks = new WebhooksResource(this);
    this.suppression = new SuppressionResource(this);
    this.events = new EventsResource(this);
    this.verify = new VerifyResource(this);
  }
  /**
   * Low-level request helper. Resources call this; consumers can call it
   * directly for endpoints not yet wrapped by a resource.
   *
   * Returns the parsed JSON body of a successful response — the API
   * contract is `{ success: true, data: ... }` (or empty `{ success: true }`).
   * Errors are thrown as {@link SendlyError} subclasses based on status.
   */
  async request(options) {
    const url = this.buildUrl(options.path, options.query);
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": `sendly-node/${SDK_VERSION}`,
      ...this.defaultHeaders,
      ...options.headers
    };
    let body;
    if (options.body !== void 0) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const init = {
      method: options.method,
      headers,
      body
    };
    if (this.timeout > 0) {
      init.signal = AbortSignal.timeout(this.timeout);
    }
    let response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SendlyConnectionError(`Sendly request failed: ${message}`, error);
    }
    if (response.status === 204 || options.noContent) {
      if (!response.ok) {
        await this.throwForError(response);
      }
      return void 0;
    }
    let parsed = void 0;
    const text = await response.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw errorFromResponse(
            response.status,
            "invalid_response",
            `Sendly returned non-JSON ${response.status}: ${text.slice(0, 200)}`,
            text
          );
        }
        return text;
      }
    }
    if (!response.ok) {
      const envelope = parsed;
      const errorMessage = envelope?.error?.message ?? `Sendly request failed with status ${response.status}`;
      const errorCode = envelope?.error?.code ?? `http_${response.status}`;
      throw errorFromResponse(response.status, errorCode, errorMessage, parsed);
    }
    return parsed;
  }
  /**
   * Resources receive the parsed envelope; they call this to unwrap the
   * `data` field when present, or pass through otherwise. Centralizing the
   * `{success, data}` -> `data` extraction here keeps resource code clean.
   */
  unwrap(envelope) {
    if (envelope && typeof envelope === "object" && "data" in envelope) {
      return envelope.data;
    }
    return envelope;
  }
  buildUrl(path, query) {
    if (!path.startsWith("/")) {
      throw new SendlyError(0, "invalid_path", `Sendly: path must start with "/" (got "${path}").`);
    }
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const parameters = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === void 0 || value === null || value === "") continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            if (v === void 0 || v === null || v === "") continue;
            parameters.append(key, String(v));
          }
        } else {
          parameters.append(key, String(value));
        }
      }
      const qs = parameters.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }
  async throwForError(response) {
    let body;
    try {
      const text = await response.text();
      body = text ? JSON.parse(text) : void 0;
    } catch {
      body = void 0;
    }
    const envelope = body;
    const errorMessage = envelope?.error?.message ?? `Sendly request failed with status ${response.status}`;
    const errorCode = envelope?.error?.code ?? `http_${response.status}`;
    throw errorFromResponse(response.status, errorCode, errorMessage, body);
  }
};

// src/webhook-utils.ts
import { createHmac, timingSafeEqual } from "crypto";
var DEFAULT_TOLERANCE_MS = 5 * 60 * 1e3;
function verifySignature(payload, signature, timestamp, secret, options = {}) {
  const toleranceMs = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > toleranceMs) return false;
  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length) return false;
  try {
    return timingSafeEqual(sigBuffer, expBuffer);
  } catch {
    return false;
  }
}
function constructEvent(payload, signature, timestamp, secret, options = {}) {
  if (!verifySignature(payload, signature, timestamp, secret, options)) {
    throw new Error("Invalid webhook signature");
  }
  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  return JSON.parse(body);
}
export {
  ContactsResource,
  DEFAULT_BASE_URL,
  DEFAULT_TOLERANCE_MS,
  DomainsResource,
  EmailsResource,
  EventsResource,
  SDK_VERSION,
  Sendly,
  SendlyAuthenticationError,
  SendlyConflictError,
  SendlyConnectionError,
  SendlyError,
  SendlyNotFoundError,
  SendlyPermissionError,
  SendlyRateLimitError,
  SendlyServerError,
  SendlyValidationError,
  SuppressionResource,
  TemplatesResource,
  VerifyResource,
  WebhooksResource,
  constructEvent,
  verifySignature
};
