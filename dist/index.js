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
  /**
   * The recipients this campaign did not reach, and why.
   *
   * {@link stats} says how many sends failed; only this says who. `reason`
   * comes from a fixed vocabulary rather than the underlying error text, so it
   * is stable enough to branch on — and it is `null` on rows recorded before
   * reasons were captured.
   *
   * Cursor-paginated like every other v1 list, but uniquely it also carries
   * `total`: {@link retryFailed} acts on that number, and `has_more` alone
   * cannot tell you whether 3 or 30,000 sends failed.
   */
  async listFailures(id, query) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/failures`,
      query
    });
  }
  /** Iterate every failed send across pages, yielding one recipient at a time. */
  async *listFailuresAll(id, query) {
    yield* paginateCursor((after) => this.listFailures(id, { ...query, after }), query?.after);
  }
  /**
   * Re-drive only the recipients whose send failed. Nobody who already received
   * the campaign is mailed a second time — each ledger row is claimed before it
   * is touched, and a row whose email exists already is re-queued, not re-sent.
   *
   * The walk runs in the background, so this resolves as soon as it is queued,
   * reporting `queued`: how many failed rows it was started for. Only a `SENT`
   * campaign qualifies (`400 validation_error` otherwise), and a retry already
   * running answers `409 conflict`. Takes no body.
   */
  async retryFailed(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/retry-failed`
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
  /**
   * List contacts on the `/api/v1` surface.
   *
   * Cursor-paginated on `limit` + `after` with no total count, narrowed by
   * `search` (case-insensitive substring on the address) and `subscribed`.
   * Hold the filters steady for the whole walk — the cursor encodes them, and
   * changing one mid-pagination returns `422 validation_error` asking you to
   * restart. {@link listAllV1} drives the loop for you.
   */
  async listV1(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/contacts",
      query
    });
  }
  /** Iterate every v1 contact across pages, yielding one contact at a time. */
  async *listAllV1(query) {
    yield* paginateCursor((after) => this.listV1({ ...query, after }), query?.after);
  }
  /**
   * Create a contact. Only `email` is required — `subscribed` defaults to true
   * server-side, and `custom_fields` is arbitrary JSON that templates can read
   * back as `{{ variables }}`.
   */
  async createV1(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/contacts",
      body
    });
  }
  /**
   * Retrieve a single contact by id. v1 has no lookup-by-address route — reach
   * a contact you only know the email of through {@link listV1}'s `search`.
   */
  async getV1(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/contacts/${encodeURIComponent(id)}`
    });
  }
  /**
   * Patch a contact. Only the fields you send are changed, with two caveats.
   *
   * `email` is not patchable at all: an address is the contact's identity here,
   * and rewriting it in place would change who every earlier send was addressed
   * to. Create the new address instead.
   *
   * `custom_fields` is **replaced, not merged** — the object you send becomes
   * the whole of it, so read the contact and send back every key you mean to
   * keep. Sending a partial object silently drops the rest.
   */
  async updateV1(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/contacts/${encodeURIComponent(id)}`,
      body
    });
  }
  /**
   * Delete a contact. Unlike the legacy {@link delete}, this resolves the
   * `{ id, deleted }` acknowledgement rather than discarding it.
   */
  async deleteV1(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/contacts/${encodeURIComponent(id)}`
    });
  }
  /**
   * Read everything this contact has said about what they want.
   *
   * The top-level `subscribed` is the global marketing opt-out and outranks
   * every topic: false means nothing marketing reaches them whatever the topic
   * rows say. Each topic's own `subscribed` is the effective answer the send
   * path reaches today, with the topic's `default_opt_in` already folded in, so
   * a contact who has never answered still reads correctly.
   */
  async topicPreferences(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/contacts/${encodeURIComponent(id)}/topics`
    });
  }
};

// src/resources/deliverability.ts
var DeliverabilityResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Diagnose one of your SENDING domains: its DNS identity, the project's
   * recent delivery outcomes, optionally one recipient's suppression state, and
   * the `findings` drawn from them, worst first. Branch on a finding's `code`,
   * never on its prose.
   *
   * `query.domain` is required — the endpoint answers about one domain. The
   * optional `address` is a RECIPIENT to check alongside it, because being
   * suppressed is the single most common reason one person stops receiving mail
   * while everyone else still does. `window_days` (1–30, default 7) only moves
   * the delivery counters.
   *
   * Nothing here is looked up live: the DNS statuses are the verification
   * refresh job's cached results, and `identity.last_checked_at` says when they
   * were filled. `recent_delivery` is project-wide rather than per-domain — its
   * own `scope` field says so — because an email row records no sending domain.
   */
  async diagnose(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/deliverability/diagnose",
      query
    });
  }
  /**
   * Delivery outcomes broken out by RECIPIENT domain and UTC day, newest day
   * first.
   *
   * These are the domains you send TO — `gmail.com`, `outlook.com` — not the
   * domains you send FROM. That is the axis {@link diagnose} cannot report: its
   * project-wide rates hide the case that matters most, one recipient domain
   * refusing nearly everything while the rest of your mail is healthy.
   *
   * Cursor-paginated on `limit` + `after`. The counts come from an hourly
   * rollup job over a rolling 30-day window, not from a query run on request;
   * each row's `computed_at` says when it was last rebuilt. No rate is
   * published, because a rate over three sends is not information.
   */
  async listDomainStats(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/deliverability/domains",
      query
    });
  }
  /** Iterate every recipient-domain row across pages, one day-and-domain at a time. */
  async *listDomainStatsAll(query) {
    yield* paginateCursor((after) => this.listDomainStats({ ...query, after }), query?.after);
  }
  /**
   * DMARC aggregate (RUA) reports that receiving providers have sent about your
   * domains, newest reporting window first. Cursor-paginated on `limit` +
   * `after`.
   *
   * An empty list is the correct answer, not a bug, until a policy domain is
   * registered in this project and its DMARC record names an address we
   * receive: only reports about a registered domain are stored, and receivers
   * send them on their own schedule (typically once a day).
   *
   * `pass_count` counts DMARC ALIGNMENT taken from `policy_evaluated`, not raw
   * authentication results — a message can pass SPF for a domain that is not
   * the one in its From header, which is exactly the case DMARC exists to
   * catch.
   */
  async listDmarcReports(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/deliverability/dmarc",
      query
    });
  }
  /** Iterate every DMARC report across pages, one report at a time. */
  async *listDmarcReportsAll(query) {
    yield* paginateCursor((after) => this.listDmarcReports({ ...query, after }), query?.after);
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
  /**
   * Start the guided DNS setup hand-off for a domain.
   *
   * Returns the session as the route returns it: a `connectUrl` to open in a
   * browser, the `token` that url carries, and `expiresAt`. Nothing here is
   * derived or reshaped — finishing setup means a person visiting that url and
   * authorising the DNS change at their registrar, so the SDK's job is to hand
   * back the link, not to model the flow behind it.
   */
  async startSetup(id) {
    const envelope = await this.client.request({
      method: "POST",
      path: `/api/domains/${encodeURIComponent(id)}/dodomain-session`
    });
    return this.client.unwrap(envelope);
  }
  /**
   * Assign this sending identity to transactional or marketing traffic.
   *
   * Streams are enforced, not labelled: once assigned, a send of the other kind
   * from this identity is refused with 403 — which is what keeps a campaign's
   * complaint rate off the identity your password resets go out on. Pass
   * `stream: null` to unassign, returning it to carrying both.
   *
   * `streamDefault` demotes whichever identity currently holds the default for
   * that stream, and `defaultFromAddress` has to be an address on this
   * identity's own host. Every field is optional; an omitted one is left alone.
   *
   * Legacy dialect: camelCase body, and the updated domain arrives inside the
   * `{ success, data }` envelope this method unwraps for you.
   */
  async assignStream(id, body) {
    const envelope = await this.client.request({
      method: "PATCH",
      path: `/api/domains/${encodeURIComponent(id)}`,
      body
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
  /**
   * List sending domains, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. {@link listAllV1}
   * drives the loop for you.
   *
   * `verified` is SES's verdict on the identity and is what decides whether mail
   * can leave from this domain; `dkim_verified` is a separate fact — what the
   * DNS health refresh last read for the DKIM records — so the two disagree
   * while a re-check is in flight and neither is a spelling of the other.
   */
  async listV1(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/domains",
      query
    });
  }
  /** Iterate every sending domain across pages, yielding one domain at a time. */
  async *listAllV1(query) {
    yield* paginateCursor((after) => this.listV1({ ...query, after }), query?.after);
  }
  /**
   * Register a sending domain and start SES DKIM verification.
   *
   * The identity comes back with `verified: false` — nothing is verified until
   * the DKIM records are published in the domain's own DNS and SES resolves
   * them, so poll {@link verifyV1} after publishing them.
   *
   * The first domain a project adds LOCKS the project's SES `region`; every
   * later domain must match it. `stream_default` requires `stream`, and sending
   * it alone is answered with `422 validation_error` rather than ignored.
   */
  async createV1(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/domains",
      body
    });
  }
  /** Retrieve a single sending domain. */
  async getV1(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/domains/${encodeURIComponent(id)}`
    });
  }
  /**
   * Re-read the domain's state from SES and DNS, and resolve the refreshed
   * document.
   *
   * This does not verify anything and changes none of the domain's own fields.
   * Verification happens in the domain's DNS, when its owner publishes the DKIM
   * records SES minted at creation, and Amazon decides when those resolve. What
   * this call does is ask SES what it currently sees, re-check SPF and DMARC,
   * and persist that answer — so a caller polling after a DNS change learns the
   * outcome without waiting for the periodic sweep. Calling it on a domain whose
   * records are not published yet is not an error and does not hurry anything.
   *
   * A POST rather than a GET because the refreshed state is persisted and a
   * verified/unverified transition notifies the project.
   */
  async verifyV1(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/domains/${encodeURIComponent(id)}/verify`
    });
  }
  /**
   * Remove a sending domain. Resolves `{ id, deleted }`.
   *
   * Refused with `409 conflict` while a template, workflow step or active
   * campaign still sends from an address on this host. The SES identity goes
   * too unless another project holds the same host — and its DKIM keys with it,
   * so re-adding later mints records that must be published again.
   */
  async deleteV1(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/domains/${encodeURIComponent(id)}`
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
   * Send one transactional email.
   *
   * Posts to the versioned `POST /api/v1/emails` and resolves the bare receipt
   * it answers `202` with: `{ id, status, to, from }`. `status` is a real
   * delivery state — poll `emails.get(id)` for the events behind it. Takes a
   * single recipient; `cc`/`bcc` copy others.
   *
   * Before 1.0 this posted to the legacy `POST /api/emails`, which answered
   * with row ids and no delivery status and fanned an array `to` out to several
   * recipients. That behaviour is {@link sendLegacy}, unchanged.
   */
  async send(body, opts) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/emails",
      body,
      headers: idemHeader(opts)
    });
  }
  /**
   * The pre-1.0 `send()`: the legacy `POST /api/emails`.
   *
   * Resolves the envelope's `data`, `{ emails, timestamp }`, where `emails` has
   * one entry per recipient (an array `to` fans out to several). Each entry is
   * `{ contact: { id, email }, email }` — `email` being the id of the queued
   * email record for that recipient. Reports no delivery status of its own.
   *
   * Kept as the escape hatch for a caller that depends on the fan-out or on the
   * envelope shape. New code should use {@link send}.
   */
  async sendLegacy(body, opts) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/emails",
      body,
      headers: idemHeader(opts)
    });
    return this.client.unwrap(envelope);
  }
  /**
   * Send a test email from the project's sandbox address.
   *
   * Goes nowhere real: the sandbox address is the SENDER, resolved server-side
   * (naming a `from` is refused), and the mail lands in the project owner's own
   * verified inbox. This exercises rendering and the send path without touching
   * a live recipient or a reputation. Read `projects.get().sandbox_address` to
   * know what it sends from — the response's `sandbox: true` says only that it
   * was one.
   */
  async sendTest(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/emails/test",
      body
    });
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
  /**
   * Fetch a single email together with its DELIVERY history, oldest first.
   *
   * `events` here is the delivery timeline behind `status` — not the custom
   * events recorded with `events.record`, which are read from `events.list`.
   * Before 1.1 this operation answered the wrong relation and published the
   * message's dedup and idempotency ledger keys along with it.
   */
  async get(id) {
    return this.client.request({
      method: "GET",
      path: `/api/emails/${encodeURIComponent(id)}`
    });
  }
  /**
   * Cancel a scheduled (PENDING) email before it fires.
   *
   * Resolves the email itself, not an empty acknowledgement: the contract has
   * always published `EmailResponse` here, and the caller wants the row's new
   * status more than it wants a `{ success: true }` it already inferred from the
   * absence of an exception.
   */
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
   * problem documents.
   *
   * Takes no idempotency key: events are append-only high-volume writes, and
   * the only `Idempotency-Key` endpoints on v1 are `campaigns.create` and
   * `campaigns.send`.
   */
  async record(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/events",
      body
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
   * Accepts SENDING_ONLY (`pk_*`) keys, so it can back a public subscribe form.
   *
   * **Double opt-in.** When the list has `doubleOptIn` enabled the membership
   * is created as `PENDING` and the result carries a `confirmToken`. Sendly
   * does **not** send the confirmation email — your application must deliver
   * `/api/lists/confirm-subscription?token=<confirmToken>` to the contact
   * itself. The token is valid for 24 hours.
   *
   * **Re-subscribing after an opt-out.** If the email already holds an
   * `UNSUBSCRIBED` membership on this list, the call fails with
   * `409 RESUBSCRIBE_CONFIRMATION_REQUIRED` unless the body sets
   * `allowResubscribe: true`. Reversing an opt-out is a consent decision, so it
   * is never the default — set the flag only when the contact themselves asked
   * to be re-subscribed.
   *
   * Prefer `previousStatus` over `created` when describing the transition to a
   * user; it reports the status held before the call, or `null` if there was no
   * membership.
   */
  async subscribe(id, body) {
    const envelope = await this.client.request({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/subscribe`,
      body
    });
    return this.client.unwrap(envelope);
  }
  /** Unsubscribe a contact from a list. Resolves the address that was removed. */
  async unsubscribe(id, body) {
    const envelope = await this.client.request({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/unsubscribe`,
      body
    });
    return this.client.unwrap(envelope);
  }
  /**
   * List the project's subscriber lists on the `/api/v1` surface.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Hold the
   * arguments steady for the whole walk — changing them mid-pagination returns
   * `422 validation_error` asking you to restart. {@link listAllV1} drives the
   * loop for you.
   */
  async listV1(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/lists",
      query
    });
  }
  /** Iterate every list across pages, yielding one list at a time. */
  async *listAllV1(query) {
    yield* paginateCursor((after) => this.listV1({ ...query, after }), query?.after);
  }
  /**
   * Create a list. Only `name` is required; `double_opt_in` defaults to false.
   *
   * Turning double opt-in on does not make Sendly send anything — it only
   * changes {@link subscribe} to create the membership as `PENDING` and hand
   * back the `confirmToken` your application delivers.
   */
  async createV1(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/lists",
      body
    });
  }
  /**
   * Retrieve a single list. `member_count` counts memberships in *any* status,
   * `PENDING` and `UNSUBSCRIBED` included, so it is not the size of the
   * audience a campaign would reach.
   */
  async getV1(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/lists/${encodeURIComponent(id)}`
    });
  }
  /**
   * Patch a list's name, description, opt-in mode, confirmation template, or
   * redirect URL. Only the fields you send are changed; `member_count` is
   * derived and never accepted here.
   */
  async updateV1(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/lists/${encodeURIComponent(id)}`,
      body
    });
  }
  /** Delete a list. Resolves `{ id, deleted }`. Removes the list, not its contacts. */
  async deleteV1(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/lists/${encodeURIComponent(id)}`
    });
  }
  /**
   * Start a bulk address-validation run over the list's members.
   *
   * **Billed per address checked**, so starting a run over a large list costs
   * real money every time — it is not a free refresh. Answers `202` with the
   * run in `pending`; read its progress and counts back with
   * `validation.getRun`.
   */
  async startValidationRun(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/lists/${encodeURIComponent(id)}/validation-runs`
    });
  }
};

// src/resources/mailboxes.ts
var MailboxesResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Every mailbox on the project's domains, newest first.
   *
   * Not paginated. A project is capped at 10 mailboxes, but the cap counts only
   * those holding (or mid-way to holding) a real account — `PROVISIONING`,
   * `ACTIVE` and `SUSPENDED`. `FAILED` rows are excluded from it deliberately,
   * so that a Stalwart outage cannot spend a project's whole allowance, and
   * they are still returned here: a project with a run of failed provisions can
   * therefore list more than 10.
   *
   * This lists the mailboxes themselves, never their contents: received
   * messages are not part of the public API.
   */
  async list() {
    const envelope = await this.client.request({
      method: "GET",
      path: "/api/mailboxes"
    });
    return this.client.unwrap(envelope);
  }
  /**
   * One mailbox, with the IMAP and SMTP host/port/username a mail client needs.
   *
   * The password is not included and is never returned here — mailbox
   * credentials are app passwords, created from the dashboard and shown once.
   */
  async get(id) {
    const envelope = await this.client.request({
      method: "GET",
      path: `/api/mailboxes/${encodeURIComponent(id)}`
    });
    return this.client.unwrap(envelope);
  }
  /**
   * The app passwords still active on a mailbox — metadata only.
   *
   * Revoked ones are not returned: the route filters on `revokedAt: null`, so
   * this is the set that can currently authenticate, not an audit history.
   *
   * `lastFour` is the only fragment of the secret that survives creation, so
   * this can identify a credential without being able to reconstruct it.
   */
  async listAppPasswords(id) {
    const envelope = await this.client.request({
      method: "GET",
      path: `/api/mailboxes/${encodeURIComponent(id)}/app-passwords`
    });
    return this.client.unwrap(envelope);
  }
  /**
   * SENDS a new message — real mail leaves the account, from the mailbox in the
   * path, over its own domain, and the recipient can reply to it.
   *
   * There is no `from` field, on purpose: a route that sends under a customer's
   * own identity must not take that identity as an argument. `body` is plain
   * text and HTML is refused — Sendly renders the HTML part itself, escaping as
   * it goes, so text becomes markup in exactly one place.
   *
   * Bcc recipients are delivered to but appear in no header, so the copy filed
   * in the mailbox's Sent folder does not record them. The message is stored as
   * a new conversation, and the reply threads onto it.
   *
   * Refusals worth handling by name: `422 RECIPIENT_SUPPRESSED` (a recipient is
   * on the project's suppression list), `422 CONTENT_REFUSED` (the outbound
   * scanner declined it), `503 CONTENT_SCAN_UNAVAILABLE` (no verdict yet for a
   * young project — nothing was sent, retry shortly). A mailbox may send 60
   * messages an hour here.
   */
  async sendMessage(id, body) {
    const envelope = await this.client.request({
      method: "POST",
      path: `/api/mailboxes/${encodeURIComponent(id)}/messages`,
      body
    });
    return this.client.unwrap(envelope);
  }
  /**
   * SENDS NOTHING — asks Sendly's assistant to write text for this mailbox and
   * hands it back for you to review. The response always reports `sent: false`,
   * and no argument changes that.
   *
   * `mode` picks the job: `draft` writes a new email from a brief, `rewrite`
   * reworks text you already have, `subject` returns alternative subject lines
   * in `subjects`. The mailbox is named only so the text can be written in that
   * address's voice; no correspondence is read and nothing is stored.
   *
   * That is why this asks only for `mailboxes:read` while {@link sendMessage}
   * needs `mailboxes:send` — a client that may draft is not thereby a client
   * that may mail your customers. Everything you pass is treated strictly as
   * data describing what to write, never as instructions to the model. Capped
   * at 120 requests an hour per project; `502` means the model was unreachable.
   */
  async draftMessage(id, body) {
    const envelope = await this.client.request({
      method: "POST",
      path: `/api/mailboxes/${encodeURIComponent(id)}/drafts`,
      body
    });
    return this.client.unwrap(envelope);
  }
};

// src/resources/projects.ts
var ProjectsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Read the current project.
   *
   * Takes no id: the project is whichever one the API key belongs to. Carries
   * `sandbox_address`, which is the address a test send arrives at — without it
   * a test send is undiscoverable, since the caller cannot say where to look.
   */
  async get() {
    return this.client.request({
      method: "GET",
      path: "/api/v1/projects"
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

// src/resources/snippets.ts
var SnippetsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Create a snippet. `name` is the literal identifier templates include with
   * `{{> name}}` and is unique within the project, so a clash answers 409.
   */
  async create(body) {
    const envelope = await this.client.request({
      method: "POST",
      path: "/api/snippets",
      body
    });
    return this.client.unwrap(envelope);
  }
  /** List snippets with cursor pagination (`limit`/`cursor`) + optional `search` over name and description. */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/snippets",
      query
    });
  }
  /** Fetch a single snippet by id. */
  async get(id) {
    const envelope = await this.client.request({
      method: "GET",
      path: `/api/snippets/${encodeURIComponent(id)}`
    });
    return this.client.unwrap(envelope);
  }
  /** Patch an existing snippet. */
  async update(id, body) {
    const envelope = await this.client.request({
      method: "PATCH",
      path: `/api/snippets/${encodeURIComponent(id)}`,
      body
    });
    return this.client.unwrap(envelope);
  }
  /**
   * Delete a snippet. The API answers 200 with `{ success, data: { id } }`; the
   * SDK resolves void. Templates that still include it keep rendering — an
   * absent snippet renders as an empty string, like an absent variable.
   */
  async delete(id) {
    await this.client.request({
      method: "DELETE",
      path: `/api/snippets/${encodeURIComponent(id)}`,
      noContent: true
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
  /**
   * List suppressed addresses, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Hold `reason`
   * steady for the whole walk — changing it mid-pagination returns
   * `422 validation_error` asking you to restart. {@link listAllV1} drives the
   * loop for you.
   */
  async listV1(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/suppressions",
      query
    });
  }
  /** Iterate every suppressed address across pages, yielding one record at a time. */
  async *listAllV1(query) {
    yield* paginateCursor((after) => this.listV1({ ...query, after }), query?.after);
  }
  /**
   * Suppress an address, so no further send reaches it.
   *
   * Idempotent: an already-suppressed address answers `201` with the existing
   * record, and the first `reason` wins — a later manual entry must not
   * overwrite what an SES bounce recorded. `source` is not accepted in the
   * body; it is derived from the credential, so a record's provenance cannot be
   * dressed up as a deliverability fact.
   */
  async createV1(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/suppressions",
      body
    });
  }
  /**
   * Retrieve the suppression record for one address.
   *
   * The answer is definite either way: `200` means suppressed and says why,
   * `404 resource_not_found` means the address is not on the list. A `200` may
   * also come from a platform-wide block recorded outside this project.
   */
  async getV1(email) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/suppressions/${encodeURIComponent(email)}`
    });
  }
  /**
   * Un-suppress an address: mail can flow to it again. Resolves
   * `{ email, deleted }`.
   *
   * This is the one call on this surface that can put mail back into an inbox
   * that asked you to stop. It does NOT clear AWS SES's own account-level
   * suppression list, so an address SES suppressed after a hard bounce stays
   * undeliverable through SES even once this record is gone. Idempotent: an
   * address that was never suppressed answers `200` too.
   */
  async deleteV1(email) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/suppressions/${encodeURIComponent(email)}`
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
  /** List templates with cursor pagination (`limit`/`cursor`) + optional `emailCategory` filter. */
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
  /**
   * List templates, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. `search` here
   * matches the name only — narrower than the dashboard's search, which also
   * reads description and subject. Hold `search` and `email_category` steady
   * for the whole walk; changing either mid-pagination returns
   * `422 validation_error` asking you to restart. {@link listAllV1} drives the
   * loop for you.
   */
  async listV1(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/templates",
      query
    });
  }
  /** Iterate every template across pages, yielding one template at a time. */
  async *listAllV1(query) {
    yield* paginateCursor((after) => this.listV1({ ...query, after }), query?.after);
  }
  /**
   * Create a template. `email_category` defaults to `MARKETING` server-side.
   *
   * The `from` domain must already be a verified sending identity — an
   * unverified sender is refused with `403 forbidden` here rather than becoming
   * a campaign that fails at send time.
   */
  async createV1(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/templates",
      body
    });
  }
  /** Retrieve a single template. */
  async getV1(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/templates/${encodeURIComponent(id)}`
    });
  }
  /**
   * Patch a template. Only the fields you send are changed.
   *
   * Touching `subject`, `body`, `from`, `from_name` or `reply_to` snapshots the
   * previous content into version history and increments `version`; touching
   * only `name`, `description` or `email_category` does not, because neither is
   * content a send would have rendered.
   */
  async updateV1(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/templates/${encodeURIComponent(id)}`,
      body
    });
  }
  /**
   * Delete a template. Resolves `{ id, deleted }` — the legacy `delete` above
   * discards that body, this one hands it back.
   *
   * A template a workflow step or an active campaign (DRAFT, SCHEDULED or
   * SENDING) still points at is refused with `409 conflict`. Emails already
   * sent from it are not erased.
   */
  async deleteV1(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/templates/${encodeURIComponent(id)}`
    });
  }
};

// src/resources/topics.ts
var TopicsResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * List topics, newest first.
   *
   * Archived topics are omitted unless `include_archived` asks for them. There
   * is no delete — archiving is the retire button, because a topic is where
   * people's answers are recorded. {@link listAll} drives the loop for you.
   *
   * Paginated on `limit` + `cursor`, not the `after` the rest of v1 uses.
   */
  async list(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/topics",
      query
    });
  }
  /**
   * Iterate every topic across pages, yielding one topic at a time.
   *
   * The walk is written out here rather than delegated to `paginateCursor`
   * because this endpoint names its cursor `cursor` on both sides — the query
   * parameter and the response field — where every other v1 list takes `after`
   * and answers `next_cursor`.
   */
  async *listAll(query) {
    let cursor = query?.cursor;
    for (; ; ) {
      const page = await this.list({ ...query, cursor });
      for (const topic of page.data) {
        yield topic;
      }
      const next = page.cursor;
      if (!page.has_more || next === null || next === cursor) return;
      cursor = next;
    }
  }
  /**
   * Create a topic.
   *
   * `key` is the stable name every preference form and integration refers to,
   * so it survives a rename of `name` and cannot be changed afterwards.
   *
   * `default_opt_in` decides what silence means for a contact who never
   * answers: true for a topic introduced over a list that already consented to
   * hear from you, false for anything a person has to ask for.
   */
  async create(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/topics",
      body
    });
  }
  /** Retrieve a single topic. */
  async get(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/topics/${encodeURIComponent(id)}`
    });
  }
  /**
   * Patch a topic. Only the fields you send are changed.
   *
   * `key` is not patchable, and `archived: true` stands in for the delete that
   * does not exist: it drops the topic from the preference centre and from new
   * sends while every opt-out recorded against it survives.
   */
  async update(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/topics/${encodeURIComponent(id)}`,
      body
    });
  }
  /**
   * Record what one contact wants on one topic. The two directions are not
   * symmetric, on purpose.
   *
   * `subscribed: true` does NOT subscribe anybody: it parks the contact at
   * `pending` and answers a `confirmation_url`, and nothing is mailed on this
   * topic until someone opens that link. There is no parameter to skip it —
   * a caller asserting a subscription is not evidence the mailbox holder
   * agreed. Sendly does not send the confirmation email; you do, from your own
   * verified domain.
   *
   * `subscribed: false` records the opt-out immediately.
   */
  async setSubscription(id, body) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/topics/${encodeURIComponent(id)}/subscriptions`,
      body
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

// src/resources/validation.ts
var ValidationResource = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * Check a batch of addresses. **This is billed per address checked** — every
   * entry in `emails` costs money, so looping this over a contact list is
   * looping over your invoice. Validate a whole list with the background run
   * (`lists.startValidationRun`) instead of paging it through here.
   *
   * At most 50 addresses per call. That ceiling is a latency bound, not a
   * payload one: every distinct domain in the batch costs a DNS round trip.
   *
   * Branch on each result's `verdict`, never on the flags — `is_personal`
   * (Gmail, Outlook) and `is_role_address` (`support@`) describe ordinary,
   * deliverable addresses that real customers use. A verdict of `unknown` means
   * DNS did not answer in time, so that address was NOT checked; it is a
   * separate value from `undeliverable` on purpose, and deleting a contact on
   * `unknown` deletes a live one over a network hiccup.
   */
  async validateEmails(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/email-validations",
      body
    });
  }
  /**
   * Retrieve a bulk validation run: how far it has got, and what it found.
   *
   * The other way a run starts is `lists.startValidationRun`, which validates
   * every address on a list in the background and answers with the run this
   * method polls. A run is finished when `status` is `completed` or `failed` —
   * never when a percentage reaches 100, because there is deliberately no total
   * to divide by: a list changes size while a run walks it.
   */
  async getRun(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/validation-runs/${encodeURIComponent(id)}`
    });
  }
  /**
   * List one page of a run's verdicts. Filter with `verdict` — `undeliverable`
   * is the page to read before acting on a run, and `unknown` is the one never
   * to act on, since those addresses were not actually checked.
   *
   * This list pages on `cursor`, not the `after` every other v1 collection
   * takes, and its envelope carries the next page under `cursor` rather than
   * `next_cursor`. {@link listResultsAll} drives that loop for you.
   */
  async listResults(id, query) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/validation-runs/${encodeURIComponent(id)}/results`,
      query
    });
  }
  /**
   * Iterate every result across pages, yielding one address's verdict at a time.
   *
   * Hand-rolled rather than routed through `paginateCursor`: the shared helper
   * sends `after` and reads `next_cursor`, and this endpoint speaks `cursor` on
   * both sides, so the helper would send an ignored parameter and re-fetch page
   * one forever. Stops on `has_more: false`, a null cursor, or a cursor the
   * server repeats.
   */
  async *listResultsAll(id, query) {
    let cursor = query?.cursor;
    for (; ; ) {
      const page = await this.listResults(id, { ...query, cursor });
      for (const result of page.data ?? []) {
        yield result;
      }
      const next = page.cursor;
      if (!page.has_more || next === null || next === void 0 || next === cursor) return;
      cursor = next;
    }
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
  /**
   * List webhook endpoints, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count.
   * {@link listAllV1} drives the loop for you. Signing secrets are not on this
   * response — see {@link rotateSecretV1} if you have lost one.
   */
  async listV1(query) {
    return this.client.request({
      method: "GET",
      path: "/api/v1/webhooks",
      query
    });
  }
  /** Iterate every webhook endpoint across pages, yielding one endpoint at a time. */
  async *listAllV1(query) {
    yield* paginateCursor((after) => this.listV1({ ...query, after }), query?.after);
  }
  /**
   * Register an endpoint to receive HMAC-signed deliveries for the events named
   * in `event_types`.
   *
   * Resolves `{ webhook, secret }`, and this is one of only two calls that ever
   * carry the signing secret — {@link rotateSecretV1} is the other. It is shown
   * exactly once: no read endpoint returns it, so store it now, because a
   * secret you lose is replaced by rotating rather than recovered. Feed it to
   * `verifySignature` to authenticate the deliveries that arrive at your
   * endpoint.
   */
  async createV1(body) {
    return this.client.request({
      method: "POST",
      path: "/api/v1/webhooks",
      body
    });
  }
  /** Retrieve a single webhook endpoint. The signing secret is not on this response. */
  async getV1(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}`
    });
  }
  /**
   * Patch a webhook endpoint. Omitted fields are left alone.
   *
   * `event_types` REPLACES the stored subscription list rather than merging
   * into it, so an event you omit is unsubscribed. Setting `status` back to
   * `ACTIVE` from `DISABLED` also clears the consecutive-failure counter, so an
   * auto-disabled endpoint gets a clean slate. The signing secret is untouched
   * by an update, and is not on this response.
   */
  async updateV1(id, body) {
    return this.client.request({
      method: "PATCH",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}`,
      body
    });
  }
  /**
   * Delete a webhook endpoint, and its delivery history with it — a delivery
   * attempt is a fact about this endpoint and means nothing once the endpoint is
   * gone. Resolves `{ id, deleted }`. Deliveries already in flight are not
   * recalled, so the endpoint may still receive an event shortly after this.
   */
  async deleteV1(id) {
    return this.client.request({
      method: "DELETE",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}`
    });
  }
  /**
   * Mint a fresh signing secret for an endpoint.
   *
   * The new plaintext is returned exactly once, here — this and
   * {@link createV1} are the only two responses that ever carry the secret, and
   * no read endpoint hands it back, so store it now and give it to
   * `verifySignature`. A secret you lose is replaced by rotating again rather
   * than recovered.
   *
   * The outgoing secret is not cut off at once: it keeps verifying until
   * `previous_secret_expires_at`, and every delivery inside that window carries
   * BOTH signatures, so a verifier can be redeployed without dropping an event.
   * Past that moment the old secret starts being rejected — as does the older of
   * two secrets if you rotate twice inside the window, because only one previous
   * secret is ever live. `url`, `event_types` and `status` are unchanged.
   */
  async rotateSecretV1(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}/rotate-secret`
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
  /**
   * Every step in the workflow — including its `TRIGGER` entry node — plus the
   * directed transitions between them.
   *
   * A step's `config` comes back exactly as stored, camelCase keys and all,
   * rather than projected into the snake_case used elsewhere on v1: the same
   * document is authored by the visual editor, and renaming its keys on the way
   * out would silently drop any key this API does not know on the way back in.
   *
   * `version` is the workflow's version at the time of the read, so a different
   * number on a later read means somebody edited the graph in between. This
   * body is accepted verbatim by {@link replaceGraph} — read, edit one step,
   * send it back.
   */
  async getGraph(id) {
    return this.client.request({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/graph`
    });
  }
  /**
   * Replace the whole graph in one transaction.
   *
   * A `PUT` and not a `PATCH`, and that is the point: a graph is nodes *plus*
   * the edges between them, so a partial edit to a step list has no meaning
   * without the transitions that reference it — half-applied, it would leave
   * steps pointing at steps that no longer exist.
   *
   * Ids decide the outcome per step: one you send is kept and updated in place,
   * a fresh uuid creates a step, and an id you omit deletes that step *and its
   * run history*. Exactly one step must be a `TRIGGER`, every transition must
   * name steps in the same document, and no step may point at itself.
   *
   * Refused with `409 conflict` while the workflow has running executions —
   * those runs are standing on the steps being replaced. {@link pause} first.
   */
  async replaceGraph(id, body) {
    return this.client.request({
      method: "PUT",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/graph`,
      body
    });
  }
  /**
   * Copy a workflow and its whole graph as a new workflow.
   *
   * The copy is always created disabled, whatever the original was: a clone
   * exists to be reviewed, and one that started live would match the same
   * trigger events as its original from the moment it appeared. Pass `{ name }`
   * to name it; it otherwise becomes `Copy of <original name>`.
   */
  async clone(id, body) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/clone`,
      body
    });
  }
  /**
   * Disable the workflow *and cancel every `RUNNING`/`WAITING` execution in it*,
   * resolving `{ workflow, cancelled_executions }`.
   *
   * That is what separates this from `update(id, { enabled: false })`, which
   * only stops new runs starting and leaves every in-flight contact walking the
   * graph — the next delay still expires, the next email still sends.
   *
   * The cancellation is terminal: {@link resume} re-opens the workflow to new
   * runs, it does not put the cancelled contacts back where they were.
   */
  async pause(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/pause`
    });
  }
  /**
   * Re-enable the workflow so its trigger matches again. `cancelled_executions`
   * is always 0 here — resuming starts nothing and stops nothing.
   *
   * Refused with `422 validation_error` while any step is still unconfigured,
   * the same rule `update(id, { enabled: true })` enforces: an enabled workflow
   * accepts contacts immediately and would otherwise fail only once one reached
   * the broken step.
   */
  async resume(id) {
    return this.client.request({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/resume`
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
var SDK_VERSION = "1.1.0";
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
  /** Reusable body fragments a template includes with `{{> name}}`. */
  snippets;
  /** Receiving mailboxes. Reads only — the writes need a user, not an API key. */
  mailboxes;
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
  /** The project this key belongs to, on the versioned `/api/v1` surface. */
  projects;
  /** Consent topics and what each contact has said they want. */
  topics;
  /** Address validation — one batch, or a whole list. */
  validation;
  /** Why mail from your domains is or is not arriving. */
  deliverability;
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
    this.snippets = new SnippetsResource(this);
    this.mailboxes = new MailboxesResource(this);
    this.campaigns = new CampaignsResource(this);
    this.segments = new SegmentsResource(this);
    this.workflows = new WorkflowsResource(this);
    this.analytics = new AnalyticsResource(this);
    this.usage = new UsageResource(this);
    this.projects = new ProjectsResource(this);
    this.topics = new TopicsResource(this);
    this.validation = new ValidationResource(this);
    this.deliverability = new DeliverabilityResource(this);
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
  AnalyticsResource,
  CampaignsResource,
  ContactsResource,
  DEFAULT_BASE_URL,
  DEFAULT_TOLERANCE_MS,
  DeliverabilityResource,
  DomainsResource,
  EmailsResource,
  EventsResource,
  ListsResource,
  MailboxesResource,
  ProjectsResource,
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
  SnippetsResource,
  SuppressionResource,
  TemplatesResource,
  TopicsResource,
  UsageResource,
  ValidationResource,
  VerifyResource,
  WebhooksResource,
  WorkflowsResource,
  asProblemDocument,
  constructEvent,
  paginateCursor,
  verifySignature
};
