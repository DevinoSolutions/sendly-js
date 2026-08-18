"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AnalyticsResource: () => AnalyticsResource,
  CampaignsResource: () => CampaignsResource,
  ContactsResource: () => ContactsResource,
  DEFAULT_BASE_URL: () => DEFAULT_BASE_URL,
  DEFAULT_TOLERANCE_MS: () => DEFAULT_TOLERANCE_MS,
  DomainsResource: () => DomainsResource,
  EmailsResource: () => EmailsResource,
  EventsResource: () => EventsResource,
  ListsResource: () => ListsResource,
  SDK_VERSION: () => SDK_VERSION,
  SegmentsResource: () => SegmentsResource,
  Sendly: () => Sendly,
  SendlyAuthenticationError: () => SendlyAuthenticationError,
  SendlyConflictError: () => SendlyConflictError,
  SendlyConnectionError: () => SendlyConnectionError,
  SendlyError: () => SendlyError,
  SendlyNotFoundError: () => SendlyNotFoundError,
  SendlyPermissionError: () => SendlyPermissionError,
  SendlyRateLimitError: () => SendlyRateLimitError,
  SendlyServerError: () => SendlyServerError,
  SendlyValidationError: () => SendlyValidationError,
  SuppressionResource: () => SuppressionResource,
  TemplatesResource: () => TemplatesResource,
  UsageResource: () => UsageResource,
  VerifyResource: () => VerifyResource,
  WebhooksResource: () => WebhooksResource,
  WorkflowsResource: () => WorkflowsResource,
  asProblemDocument: () => asProblemDocument,
  constructEvent: () => constructEvent,
  paginateCursor: () => paginateCursor,
  verifySignature: () => verifySignature
});
module.exports = __toCommonJS(index_exports);

// src/resources/analytics.ts
var AnalyticsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /** Daily sending and engagement counts across the window. */
  async timeseries(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/analytics/timeseries",
      query
    });
  }
  /** Campaign totals for the window: how many ran, and their average rates. */
  async campaigns(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/analytics/campaigns",
      query
    });
  }
  /** Campaigns sent in the window ranked by open rate, capped at 50 rows. */
  async topCampaigns(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/analytics/top-campaigns",
      query
    });
  }
};

// src/pagination.ts
async function* paginateCursor(fetchPage, startAfter) {
  let after = startAfter;
  for (; ; ) {
    const page = await fetchPage(after);
    for (const item of page.data ?? []) {
      yield item;
    }
    const next = page.next_cursor;
    if (!page.has_more || next === null || next === void 0 || next === after) return;
    after = next;
  }
}

// src/resources/idempotency.ts
function idemHeader(opts) {
  if (!opts?.idempotencyKey) return void 0;
  return { "Idempotency-Key": opts.idempotencyKey };
}

// src/resources/campaigns.ts
var CampaignsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * List campaigns, newest first.
   *
   * Cursor-paginated: pass the previous response's `next_cursor` as `after` to
   * page forward, and stop when `has_more` is false. There is deliberately no
   * total count. Keep the filter and sort arguments identical across the whole
   * walk — changing them mid-pagination is rejected with `422 validation_error`
   * asking you to restart from the first page. Use {@link listAll} to let the
   * SDK drive the loop.
   */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/campaigns",
      query
    });
  }
  /** Iterate every campaign across pages, yielding one campaign at a time. */
  async *listAll(query) {
    yield* paginateCursor((after) => this.list({ ...query, after }), query?.after);
  }
  /**
   * Create a campaign. It lands in `DRAFT` — creating never sends; call
   * {@link send} for that.
   */
  async create(body, opts) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/campaigns",
      body,
      headers: idemHeader(opts)
    });
  }
  /** Retrieve a single campaign. */
  async get(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}`
    });
  }
  /** Patch a campaign. Only the fields you send are changed. */
  async update(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}`,
      body
    });
  }
  /** Delete a campaign. Resolves `{ id, deleted }`. */
  async delete(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}`
    });
  }
  /**
   * Send a campaign, or schedule it by passing `{ scheduled_for }`.
   *
   * Sending is the one irreversible campaign operation, so it takes an
   * idempotency key: reuse the same key only to retry the identical request.
   */
  async send(id, body, opts) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/send`,
      body,
      headers: idemHeader(opts)
    });
  }
  /** Cancel a scheduled or sending campaign. */
  async cancel(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/cancel`
    });
  }
  /** Pause a sending campaign. */
  async pause(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/pause`
    });
  }
  /** Resume a paused campaign. */
  async resume(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/resume`
    });
  }
  /** Delivery and engagement counters plus derived rates for one campaign. */
  async stats(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/stats`
    });
  }
};

// src/resources/contacts.ts
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
  /** Delete a contact. The API answers 200 with `{ success, data: { id } }`; the SDK resolves void. */
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
var EmailsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Send a single transactional email.
   *
   * Resolves the response's `data`: `{ emails, timestamp }`, where `emails`
   * has one entry per recipient (an array `to` fans out to several). Each
   * entry is `{ contact: { id, email }, email }` — `email` being the id of
   * the queued email record for that recipient (poll `emails.get(id)` for
   * its delivery status).
   */
  async send(body, opts) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/emails",
      body,
      headers: idemHeader(opts)
    });
    return this.client.unwrap(envelope);
  }
  /** Send a batch (up to 100) of transactional emails in one call. */
  async batch(body, opts) {
    return this.client.request({
      method: "POST",
      path: "/api/emails/batch",
      body,
      headers: idemHeader(opts)
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
   * Track a custom event for a contact via the legacy `/api/track` endpoint.
   * Both FULL (`sk_*`) and SENDING_ONLY (`pk_*`) keys are accepted, but
   * reserved system event names are rejected.
   *
   * Prefer {@link record} for new integrations — it is the same capability on
   * the versioned `/api/v1` surface.
   */
  async track(body) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/track",
      body
    });
    return this.client.unwrap(envelope);
  }
  /**
   * Record a custom event on the `/api/v1` surface.
   *
   * Named `record` rather than `track` because {@link track} already holds that
   * name for the legacy endpoint. The two do the same job; this one resolves
   * the bare created event (snake_case) and reports failures as RFC 9457
   * problem documents. Note that the spec documents `Idempotency-Key` on the
   * campaign write endpoints only, so a key passed here may simply be ignored
   * server-side.
   */
  async record(body, opts) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/events",
      body,
      headers: idemHeader(opts)
    });
  }
  /**
   * List recorded events, newest first, optionally filtered by `event_name`.
   *
   * Cursor-paginated on `limit` + `after` with no total count. Keep the filter
   * fixed across the whole walk — changing it mid-pagination returns
   * `422 validation_error` asking you to restart from the first page.
   */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/events",
      query
    });
  }
  /** Iterate every event across pages, yielding one event at a time. */
  async *listAll(query) {
    yield* paginateCursor((after) => this.list({ ...query, after }), query?.after);
  }
  /**
   * Every distinct event name in the project, most frequent first — the
   * vocabulary to filter {@link list} by or point a workflow trigger at.
   * Unpaginated: the set is bounded by what the integration emits.
   */
  async listNames() {
    return this.client.request({
      method: "GET",
      path: "/api/v1/events/names"
    });
  }
  /** Per-name event counts over an optional `{ from, to }` window. */
  async stats(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/events/stats",
      query
    });
  }
};

// src/resources/lists.ts
var ListsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Subscribe a contact to a list, creating the contact if it does not exist.
   * Pass `allowResubscribe` to re-subscribe someone who previously opted out.
   */
  async subscribe(id, body) {
    return this.client.request({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/subscribe`,
      body
    });
  }
  /** Unsubscribe a contact from a list. */
  async unsubscribe(id, body) {
    return this.client.request({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/unsubscribe`,
      body
    });
  }
};

// src/resources/segments.ts
var SegmentsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * List segments, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Hold the filter
   * and sort arguments steady for the whole walk — changing them mid-pagination
   * returns `422 validation_error` asking you to restart. {@link listAll}
   * drives the loop for you.
   */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/segments",
      query
    });
  }
  /** Iterate every segment across pages, yielding one segment at a time. */
  async *listAll(query) {
    yield* paginateCursor((after) => this.list({ ...query, after }), query?.after);
  }
  /** Create a segment. */
  async create(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/segments",
      body
    });
  }
  /** Retrieve a single segment. */
  async get(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/segments/${encodeURIComponent(id)}`
    });
  }
  /** Patch a segment. Only the fields you send are changed. */
  async update(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/segments/${encodeURIComponent(id)}`,
      body
    });
  }
  /**
   * Delete a segment. Resolves `{ id, deleted }`. A segment still referenced by
   * a campaign is refused with `409 conflict`.
   */
  async delete(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/segments/${encodeURIComponent(id)}`
    });
  }
  /** List the contacts currently matching a segment. Cursor-paginated. */
  async listContacts(id, query) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/segments/${encodeURIComponent(id)}/contacts`,
      query
    });
  }
  /** Iterate every contact in a segment across pages, one contact at a time. */
  async *listContactsAll(id, query) {
    yield* paginateCursor((after) => this.listContacts(id, { ...query, after }), query?.after);
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
  /** List templates with cursor pagination (`limit`/`cursor`) + optional type filter. */
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
  /** Delete a template. The API answers 200 with `{ success, data: { id } }` (409 if still referenced); the SDK resolves void. */
  async delete(id) {
    await this.client.request({
      method: "DELETE",
      path: `/api/templates/${encodeURIComponent(id)}`,
      noContent: true
    });
  }
};

// src/resources/usage.ts
var UsageResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Retrieve this month's email counts per source category against the monthly
   * cap, plus today's sends against the daily ceiling.
   *
   * Every figure is read from an enforcement path, so what this reports and
   * what refuses a send cannot disagree. Note the two windows differ: the
   * monthly counters roll over on the billing period, the daily one on the day.
   */
  async get() {
    return this.client.request({
      method: "GET",
      path: "/api/v1/usage"
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
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/verify",
      body
    });
    return this.client.unwrap(envelope);
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

// src/resources/workflows.ts
var WorkflowsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * List workflows.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Keep the filter
   * and sort arguments identical for the whole walk — changing them
   * mid-pagination returns `422 validation_error` asking you to restart.
   */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/workflows",
      query
    });
  }
  /** Iterate every workflow across pages, yielding one workflow at a time. */
  async *listAll(query) {
    yield* paginateCursor((after) => this.list({ ...query, after }), query?.after);
  }
  /** Create a workflow. */
  async create(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/workflows",
      body
    });
  }
  /** Retrieve a single workflow. */
  async get(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}`
    });
  }
  /** Patch a workflow. Only the fields you send are changed. */
  async update(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/workflows/${encodeURIComponent(id)}`,
      body
    });
  }
  /** Delete a workflow. Resolves `{ id, deleted }`. */
  async delete(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/workflows/${encodeURIComponent(id)}`
    });
  }
  /**
   * List a workflow's executions — one row per contact-run, newest first.
   * Cursor-paginated; filter by `status` to find stuck (`WAITING`) or failed
   * runs. Hold `status` fixed across the walk, as with every v1 cursor list.
   */
  async listExecutions(id, query) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/executions`,
      query
    });
  }
  /** Iterate every execution of a workflow across pages, one run at a time. */
  async *listExecutionsAll(id, query) {
    yield* paginateCursor((after) => this.listExecutions(id, { ...query, after }), query?.after);
  }
  /**
   * Enter one contact into an enabled workflow. Step processing is
   * asynchronous, so a successful call means the run was claimed — not that it
   * finished. A workflow whose re-entry policy already covers this contact
   * answers `409 conflict`.
   */
  async startExecution(id, body) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/executions`,
      body
    });
  }
  /**
   * Cancel a single in-flight execution.
   *
   * Addressed by execution id alone — this route is *not* nested under the
   * workflow, so no workflow id is needed.
   */
  async cancelExecution(executionId) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/workflows/executions/${encodeURIComponent(executionId)}/cancel`
    });
  }
  /**
   * Execution counts by status, completion rate, average duration, emails sent
   * and per-goal conversions for one workflow. All-time unless you pass
   * `{ from }`; there is no 90-day ceiling here, unlike `analytics.*`.
   */
  async stats(id, query) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/stats`,
      query
    });
  }
};

// src/errors.ts
function isProblemFieldError(value) {
  if (!value || typeof value !== "object") return false;
  const entry = value;
  return typeof entry.pointer === "string" && typeof entry.code === "string" && typeof entry.message === "string";
}
function asProblemDocument(body, contentType) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return void 0;
  const candidate = body;
  if (typeof candidate.code !== "string") return void 0;
  const declared = typeof contentType === "string" && contentType.toLowerCase().includes("application/problem+json");
  const shaped = typeof candidate.type === "string" && typeof candidate.title === "string";
  if (!declared && !shaped) return void 0;
  const errors = Array.isArray(candidate.errors) ? candidate.errors.filter(isProblemFieldError) : void 0;
  return {
    type: typeof candidate.type === "string" ? candidate.type : "about:blank",
    title: typeof candidate.title === "string" ? candidate.title : "",
    status: typeof candidate.status === "number" ? candidate.status : 0,
    detail: typeof candidate.detail === "string" ? candidate.detail : void 0,
    instance: typeof candidate.instance === "string" ? candidate.instance : void 0,
    code: candidate.code,
    request_id: typeof candidate.request_id === "string" ? candidate.request_id : void 0,
    errors: errors && errors.length > 0 ? errors : void 0
  };
}
var SendlyError = class extends Error {
  statusCode;
  errorCode;
  body;
  /**
   * Correlation id from an RFC 9457 problem document's `request_id` (`/api/v1`
   * errors only). Quote it in support requests. Undefined on legacy `/api/*`
   * errors and transport failures.
   */
  requestId;
  /**
   * Field-level failures from an RFC 9457 problem document's `errors` array —
   * populated on `422 validation_error` responses from `/api/v1`. Undefined
   * everywhere else.
   */
  fieldErrors;
  constructor(statusCode, errorCode, message, body, problem) {
    super(message);
    this.name = "SendlyError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.body = body;
    const doc = problem ?? asProblemDocument(body);
    this.requestId = doc?.request_id;
    this.fieldErrors = doc?.errors;
  }
};
var SendlyValidationError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body, problem) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyValidationError";
  }
};
var SendlyAuthenticationError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body, problem) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyAuthenticationError";
  }
};
var SendlyPermissionError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body, problem) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyPermissionError";
  }
};
var SendlyNotFoundError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body, problem) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyNotFoundError";
  }
};
var SendlyConflictError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body, problem) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyConflictError";
  }
};
var SendlyRateLimitError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body, problem) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyRateLimitError";
  }
};
var SendlyServerError = class extends SendlyError {
  constructor(statusCode, errorCode, message, body, problem) {
    super(statusCode, errorCode, message, body, problem);
    this.name = "SendlyServerError";
  }
};
var SendlyConnectionError = class extends SendlyError {
  constructor(message, body) {
    super(0, "connection_error", message, body);
    this.name = "SendlyConnectionError";
  }
};
function errorFromResponse(statusCode, errorCode, message, body, contentType) {
  const problem = asProblemDocument(body, contentType);
  const code = problem?.code ?? errorCode;
  const text = problem ? problem.detail ?? (problem.title || message) : message;
  if (statusCode === 400 || statusCode === 422) return new SendlyValidationError(statusCode, code, text, body, problem);
  if (statusCode === 401) return new SendlyAuthenticationError(statusCode, code, text, body, problem);
  if (statusCode === 403) return new SendlyPermissionError(statusCode, code, text, body, problem);
  if (statusCode === 404) return new SendlyNotFoundError(statusCode, code, text, body, problem);
  if (statusCode === 409) return new SendlyConflictError(statusCode, code, text, body, problem);
  if (statusCode === 429) return new SendlyRateLimitError(statusCode, code, text, body, problem);
  if (statusCode >= 500) return new SendlyServerError(statusCode, code, text, body, problem);
  return new SendlyError(statusCode, code, text, body, problem);
}

// src/client.ts
var SDK_VERSION = "0.3.0";
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
  lists;
  /** Campaigns on the versioned `/api/v1` surface. */
  campaigns;
  /** Segments on the versioned `/api/v1` surface. */
  segments;
  /** Automation workflows on the versioned `/api/v1` surface. */
  workflows;
  /** Sending analytics on the versioned `/api/v1` surface. */
  analytics;
  /** Usage against enforced limits, on the versioned `/api/v1` surface. */
  usage;
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
    this.lists = new ListsResource(this);
    this.campaigns = new CampaignsResource(this);
    this.segments = new SegmentsResource(this);
    this.workflows = new WorkflowsResource(this);
    this.analytics = new AnalyticsResource(this);
    this.usage = new UsageResource(this);
  }
  /**
   * Low-level request helper. Resources call this; consumers can call it
   * directly for endpoints not yet wrapped by a resource.
   *
   * Returns the parsed JSON body of a successful response verbatim. On the
   * legacy `/api/*` surface that is a `{ success: true, data: ... }` envelope
   * the caller unwraps via {@link unwrap}; on `/api/v1` it is already the bare
   * resource. Errors are thrown as {@link SendlyError} subclasses based on
   * status, in either dialect.
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
    const contentType = response.headers?.get("content-type") ?? void 0;
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
      throw errorFromResponse(response.status, errorCode, errorMessage, parsed, contentType);
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
    throw errorFromResponse(
      response.status,
      errorCode,
      errorMessage,
      body,
      response.headers?.get("content-type") ?? void 0
    );
  }
};

// src/webhook-utils.ts
var import_node_crypto = require("crypto");
var DEFAULT_TOLERANCE_MS = 5 * 60 * 1e3;
function verifySignature(payload, signature, timestamp, secret, options = {}) {
  const toleranceMs = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > toleranceMs) return false;
  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = (0, import_node_crypto.createHmac)("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length) return false;
  try {
    return (0, import_node_crypto.timingSafeEqual)(sigBuffer, expBuffer);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnalyticsResource,
  CampaignsResource,
  ContactsResource,
  DEFAULT_BASE_URL,
  DEFAULT_TOLERANCE_MS,
  DomainsResource,
  EmailsResource,
  EventsResource,
  ListsResource,
  SDK_VERSION,
  SegmentsResource,
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
  UsageResource,
  VerifyResource,
  WebhooksResource,
  WorkflowsResource,
  asProblemDocument,
  constructEvent,
  paginateCursor,
  verifySignature
});
