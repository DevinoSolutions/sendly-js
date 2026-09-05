# Changelog

All notable changes to `sendly-sdk` are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## 1.1.0 — 2026-09-05

Four new resources, the `/api/v1` half of six that only had a legacy one, and a
set of renames the platform made on the wire. Most of this release is additive,
but the renames are breaking, so it is a major-in-spirit minor: 1.1 talks to an
API that 1.0 did not.

> **Do not publish or deploy 1.1 before the platform deploy that ships the
> renamed wire has gone out.** These types no longer carry `type`, `data` (on
> the v1 event write) or `mailFromStatus`, and an SDK sending `emailCategory` at
> an API that still expects `type` is answered `422 validation_error` on every
> template and campaign write. The order is: platform deploy first, then publish
> the SDKs.

### Breaking

- **`Template.type` and `Campaign.type` are now `emailCategory`** on the legacy
  dialect and `email_category` on v1. It affects `templates.create`,
  `templates.update`, the `emailCategory` filter on `templates.list`, and
  `campaigns.create`. Rename the key in the body; the values are unchanged
  except that the enum member **`HEADLESS` is now `SELF_MANAGED_UNSUBSCRIBE`** —
  the old name said how the mail was built, the new one says what the recipient
  gets, which is the fact a caller is choosing between.

  Nothing is accepted under both names, deliberately: an alias would let a
  half-migrated codebase keep compiling while the two spellings drifted apart.

- **`events.record`'s payload field is now `payload`, not `data`.** Only the v1
  write moved. **`events.track` is unaffected** and still takes `data`, because
  it is the legacy `POST /api/track` and its body is a different schema that was
  not part of this rename. The SDK reports what each endpoint actually accepts
  rather than smoothing the two together — a shared name here would be a lie
  about one of them.

- **`Domain.mailFromStatus` is now `mailFromDomainStatus`** (and
  `mail_from_domain_status` on the v1 document). It sits beside `mailFromDomain`
  and is the status _of that domain_, which the old name did not say.

- **`emails.get` returns a different body — read this one.** It used to hand back
  the whole database row plus an `events` array that was the **wrong relation**:
  the custom analytics events a caller records with `events.record`, not the
  delivery history the operation has always promised. A caller polling it for
  delivery state was reading somebody else's data and, if their project recorded
  no custom events, an empty array that looked like "nothing has happened yet".

  It now returns an explicit field list, `events` as the delivery timeline
  (`EmailEvent[]`, oldest first), and `to` filled from the joined contact — a
  field the spec had always declared and the response had never carried.

  Fields that used to leak out of it and no longer do: `bodyHash`, `dedupKey`,
  `idempotencyKey`, `linkMap`, `sesMessageId`, `sesInboundMessageId`, `body` and
  `headers`. Four of those are ledger keys for deduplication and idempotency and
  the rest are internal routing state or the rendered message; none was ever
  documented. What to change: read `events.list` if you wanted custom events, and
  keep your own copy of the body if you were reading it back out of here.

- **`EmailGetResponse` is gone, split in two.** It named the operation rather
  than the shape, and was then reused by an operation that is not a GET. There
  are now `EmailResponse` (a single email) and `EmailDetailResponse` (an email
  plus its delivery events), and **`emails.get` resolves `EmailDetailResponse`**.
  A caller who imported the old alias picks the one that matches what they read.

- **Engagement left the delivery status enum.** `OPENED`, `CLICKED` and
  `COMPLAINED` are no longer delivery states on the platform, so they are no
  longer members of the status type behind `email.status` or the `status` filter
  on `emails.list`. The remaining members are `PENDING`, `SENDING`, `SENT`,
  `DELIVERED`, `RECEIVED`, `BOUNCED`, `FAILED`, `REJECTED`, `RENDERING_FAILURE`,
  `DELIVERY_DELAY` and `CANCELLED`.

  Read engagement from `openedAt` / `clickedAt` / `complainedAt` and the `opens`
  / `clicks` counters instead. The two were one enum, which meant a message that
  had been opened stopped reporting that it had been delivered — a status can
  only hold one value, and delivery and engagement are not alternatives.

- **The double-opt-in confirmation route moved** from `/api/lists/confirm` to
  `/api/lists/confirm-subscription`. `lists.subscribe` documents that URL because
  Sendly does not send the confirmation email — your application does — so a
  caller who builds it by hand must change the path. The `confirmToken` in the
  response is unchanged.

### Added

- **The `/api/v1` half of six resources that had only a legacy one.** Both
  dialects stay reachable, so the versioned methods carry a `V1` suffix:
  - `contacts` — `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`,
    `deleteV1`, and `topicPreferences`.
  - `lists` — `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`,
    `deleteV1`, and `startValidationRun`.
  - `templates` — `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`,
    `deleteV1`.
  - `domains` — `listV1`, `listAllV1`, `createV1`, `getV1`, `verifyV1`,
    `deleteV1`, plus the legacy `assignStream`.
  - `webhooks` — `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`,
    `deleteV1`, `rotateSecretV1`.
  - `suppression` — `listV1`, `listAllV1`, `createV1`, `getV1`, `deleteV1`.

  The suffix is not decoration. The two halves answer the same question with
  different envelopes (`{ success, data }` versus the bare body), different field
  cases (camelCase versus snake_case) and different error bodies (the legacy
  envelope versus RFC 9457), so a call site that mixes them up reads a `data`
  that is not there and fails at runtime rather than at the type check. Naming
  them apart is what makes that impossible.

  One difference inside suppression is worth knowing before you swap: the v1 path
  parameter is an **address**, and v1 answers `404 resource_not_found` for an
  address that is not suppressed, where the legacy `suppression.get` answers
  `200 { suppressed: false }`. Both are definite; only one of them throws.

- **`sendly.topics`** — `list`, `listAll`, `create`, `get`, `update`,
  `setSubscription`. The consent vocabulary a project mails against: a contact
  subscribes to a topic rather than to a campaign, so switching one off silences
  a whole audience. Two things a caller needs:
  - **Subscribing somebody through the API does not bypass confirmation.**
    `setSubscription({ subscribed: true })` parks the contact at `pending` and
    answers a `confirmation_url` that **your** application delivers, from your
    own verified domain; nothing is mailed on the topic until someone opens it.
    There is no parameter to skip that, because a subscription an API caller
    asserts is not evidence the mailbox holder agreed.
  - **A topic is archived, never deleted.** There is no `delete` method because
    there is no delete route: a topic is where people's answers are recorded, so
    deleting it would delete the choices they made against it.
    `update(id, { archived: true })` retires it and keeps them.

- **`sendly.snippets`** — `create`, `list`, `get`, `update`, `delete`. Reusable
  body fragments a template includes with `{{> name}}`, on the legacy dialect,
  gated by the same `templates:*` scopes as the templates that include them —
  a snippet is part of a template body rather than a resource with an audience of
  its own. Deleting one does not break its templates: an absent snippet renders
  as an empty string, like an absent variable.

- **`sendly.validation`** — `validateEmails`, `getRun`, `listResults`,
  `listResultsAll`. **Billed per address checked**: every entry in
  `validateEmails({ emails })` costs money, so looping it over a contact list is
  looping over your invoice. Validate a whole list with
  `lists.startValidationRun`, a background job, and poll it with `getRun`.

  A verdict of `unknown` is deliberately a distinct value from `undeliverable`:
  it means DNS did not answer in time, so the address was **not checked**. That
  separation exists so a DNS timeout is never grounds for deleting a contact.

- **`sendly.deliverability`** — `diagnose`, `listDomainStats`,
  `listDomainStatsAll`, `listDmarcReports`, `listDmarcReportsAll`.
  `listDomainStats` is per **recipient** domain (`gmail.com`, `outlook.com`) —
  the domains you send **to** — which is the axis `diagnose` cannot report: its
  project-wide rates hide one provider refusing nearly everything while the rest
  of your mail is healthy. DMARC reports arrive only for a policy domain the
  project has registered, and receivers send them on their own schedule, so **an
  empty list is correct rather than broken**.

- **`campaigns.listFailures`, `campaigns.listFailuresAll` and
  `campaigns.retryFailed`.** `stats` says how many sends failed; only these say
  who, and `reason` comes from a fixed vocabulary rather than the underlying
  error text so it is stable enough to branch on. `retryFailed` re-drives **only**
  the recipients whose send failed — nobody who already received the campaign is
  mailed again, because each ledger row is claimed before it is touched and a row
  whose email exists already is re-queued rather than re-sent. Uniquely among v1
  lists, `listFailures` also carries `total`: `retryFailed` acts on that number,
  and `has_more` alone cannot tell you whether 3 or 30,000 sends failed.

- **`workflows.getGraph`, `workflows.replaceGraph`, `workflows.clone`,
  `workflows.pause` and `workflows.resume`.**
  - `replaceGraph` is a `PUT` because a graph is replaced whole: nodes _plus_ the
    edges between them, so a partial edit to a step list has no meaning without
    the transitions that reference it. An id you omit deletes that step and its
    run history; it is refused with `409 conflict` while executions are running.
  - `clone` always creates the copy **disabled**, whatever the original was — a
    clone exists to be reviewed, and one that started live would match the same
    trigger events as its original from the moment it appeared.
  - `pause` cancels every `RUNNING`/`WAITING` execution and reports how many in
    `cancelled_executions`. `resume` re-opens the workflow to new runs and does
    **not** restore the cancelled ones (`cancelled_executions` is always 0
    there). That asymmetry is the point of having both: `update({ enabled:
false })` stops new runs and leaves every in-flight contact walking the
    graph, `pause` stops the sends already in flight, and nothing puts them back.

- **`mailboxes.sendMessage` and `mailboxes.draftMessage`.** The mailbox resource
  is no longer read-only.
  - `sendMessage` **really sends**, as that mailbox's own address, over its own
    domain, and the recipient can reply. There is no `from` field on purpose: a
    route that sends under a customer's identity must not take that identity as
    an argument. `body` is plain text and HTML is refused, so text becomes markup
    in exactly one place. Needs `mailboxes:send`.
  - `draftMessage` asks Sendly's assistant to **write** text and hands it back.
    It stores nothing and sends nothing — the response reports `sent: false`, and
    no argument changes that — so it needs only `mailboxes:read`. A client that
    may draft is not thereby a client that may mail your customers.

- **Auto-pagination for every new cursor list.** The `*All` companions now number
  seventeen: the six from 0.3.0 plus `campaigns.listFailuresAll`,
  `contacts.listAllV1`, `deliverability.listDmarcReportsAll`,
  `deliverability.listDomainStatsAll`, `domains.listAllV1`, `lists.listAllV1`,
  `suppression.listAllV1`, `templates.listAllV1`, `topics.listAll`,
  `validation.listResultsAll` and `webhooks.listAllV1`.

### Fixed

- **README: `emails.list` was destructured wrongly.** The example read
  `page.data.items` and `page.data.cursor`; the response is
  `{ success, data: Email[], nextCursor }`, so it is `page.data` and
  `page.nextCursor`. Copying the old example did not compile.
- **README: `webhooks.create` was destructured wrongly.** The legacy create
  resolves the envelope, so the secret is at `created.data.secret`, not
  `const { webhook, secret } = ...`. That destructuring is correct for
  `webhooks.createV1`, which is where the example now lives.
- **README: the mailbox resource was described as read-only** in three places.
  It is not, since `sendMessage` and `draftMessage`; what stays out of reach is
  the mailbox _lifecycle_, which is a different claim.

### Notes

- **Pagination is not uniform, and the exception is worth knowing.** Most v1
  lists take `after` and answer `next_cursor`. **`topics.list` and
  `validation.listResults` take `cursor` and answer `cursor`.** Both kinds are
  forward-only opaque cursors and both stop on `has_more: false`; only the
  parameter names differ. `topics.listAll` and `validation.listResultsAll` hide
  it — they are hand-rolled rather than routed through `paginateCursor`, which
  sends `after` and reads `next_cursor` and would otherwise re-fetch page one
  forever. A caller driving pages by hand needs to know which endpoint speaks
  which.
- **`NOT_SDK_CALLABLE` is unchanged.** Creating and deleting a mailbox, creating
  and revoking an app password, the four API-key operations, and creating a
  project still resolve the acting user from a session and answer `401` to any
  API key. The two new mailbox methods are the opposite case — they publish
  `ApiKeyAuth` outright.
- **Nothing added here takes an `idempotencyKey`.** The set of writes that accept
  one is the same as in 1.0: `emails.send`, `emails.sendLegacy`, `emails.batch`,
  `contacts.create`, `contacts.upsert`, `contacts.bulkCreate`,
  `campaigns.create` and `campaigns.send`. `campaigns.retryFailed` is guarded
  instead by a `409 conflict` on a retry already running, which is a better fit:
  the thing to prevent is two concurrent walks, not a replayed request.

## 1.0.0 — 2026-09-02

The default send moves to the versioned API. Everything else in this release is
additive: the operations an API key can actually reach that the SDK did not yet
expose.

### Breaking

- **`emails.send()` now posts to `POST /api/v1/emails`** and resolves the bare
  `202` receipt, `{ id, status, to, from }`, where `status` is a real delivery
  state. Before 1.0 it posted to the legacy `POST /api/emails`, which answered
  with row ids and **no** delivery status, and fanned an array `to` out to
  several recipients. What changes for a caller:
  - the body type is `SendEmailV1Request` — one recipient in `to`, with `cc` /
    `bcc` to copy others (an array `to` is no longer accepted);
  - the result is `EmailV1`, not `{ emails, timestamp }` — read `receipt.id`
    and `receipt.status` instead of `result.emails[0].email`;
  - failures arrive as RFC 9457 problem documents, mapped onto the **same**
    `SendlyError` subclasses, so `instanceof` handling is unchanged; `errorCode`
    is now the lowercase v1 registry value (`validation_error`, not
    `VALIDATION_ERROR`) and `requestId` / `fieldErrors` are populated.

  The pre-1.0 behaviour is kept, unchanged, as **`emails.sendLegacy()`** — the
  escape hatch for a caller that depends on the fan-out or the envelope. Renaming
  a call from `send` to `sendLegacy` is a complete migration; adopting the new
  default means reading the receipt instead of the envelope.

  Why now: the legacy send cannot tell a caller whether a message went anywhere,
  and the versioned one can. Nothing is published against 0.x, so the cost of
  the move is lowest today and only rises.

### Added

- **`emails.sendLegacy()`** — the pre-1.0 `send()`, byte for byte. See Breaking.
- **`emails.sendTest()`** — sandbox test send. The sandbox address is the
  _sender_; the mail lands in the project owner's own verified inbox. Naming a
  `from` is refused rather than ignored. Takes no `idempotencyKey`.
- **`mailboxes` resource, reads only** — `list()`, `get(id)` (which carries the
  IMAP/SMTP `settings` a mail client needs) and `listAppPasswords(id)`
  (metadata only; the secret is never returned). The mailbox _writes_ are not
  missing but unreachable — see Notes.
- **`projects.get()`** — the project the credential resolves to. Takes no id.
  Carries `sandbox_address`, which no public route published before.
- **`domains.startSetup(id)`** — begins the guided DNS hand-off and returns the
  route's own `{ token, connectUrl, expiresAt }`. Finishing setup means a person
  opening `connectUrl`, so the SDK hands back the link rather than modelling the
  flow behind it.

### Fixed

- **README: `domains.create` takes `domain`, not `name`.** The documented
  example named a field the API does not accept, so copying it produced a `422`.
- **README: the sandbox test send was described backwards.** It said
  `sandbox_address` was where a test send lands; it is the address a test send
  comes _from_, and the mail arrives in the project owner's own inbox.
- **README: send examples used an `html` field the API does not have.** The
  content field is `body` on every send, legacy and v1 alike; the examples now
  say so.

### Notes

- **`sendV1` and `sendTestV1` never shipped.** They existed briefly on `main`
  between 0.4.0 and this release as the additive step before the repoint, and
  are folded into `send` and `sendTest` here. If you installed from GitHub in
  that window, rename the calls.
- **Some operations are permanently not SDK-callable.** Creating and deleting a
  mailbox, creating and revoking an app password, the API-key operations, and
  creating a project all resolve the acting user from a session and answer `401`
  to any API key. They are recorded in the contract suite's `NOT_SDK_CALLABLE`,
  which the suite asserts equals the set the contract itself declares — in both
  directions. Use the dashboard or an OAuth connection.
- **A project is capped at 10 mailboxes**, counting only `PROVISIONING`,
  `ACTIVE` and `SUSPENDED`. `FAILED` rows are excluded from the cap but are
  still returned by `mailboxes.list()`, so a project that has had failed
  provisions can list more than 10 — the `list()` docstring said "at most 10"
  without that distinction and now states it.

## 0.4.0

### Removed

- **`JsonValue` and `JsonObject`**, deprecated in 0.3.1, are gone. They existed
  only as a workaround for generated types that were stricter than the API;
  that was fixed at the spec level in 0.3.1, after which nothing in the package
  referenced them. If you imported either one, replace it with your own type —
  the request and response types that used to need them (`events.record()`'s
  `data`, `workflows.startExecution()`'s `context`) already accept arbitrary
  JSON straight from the generated schema.

## 0.3.1

### Fixed

- **Generated types for the free-form `data`/`context` map fields corrected.**
  `events.record()`'s `data` and `workflows.startExecution()`'s `context` are
  generated directly from the spec's own JSON-value union
  (`string | number | boolean | object | array | null`) rather than the
  hand-patched workaround type. No runtime behavior changes — these fields
  always accepted arbitrary JSON — but the exported request types now come
  straight from the generated schema like every other alias in `types.ts`.

### Deprecated

- **`JsonValue` and `JsonObject`** are no longer referenced anywhere in the
  package (the workaround they existed for is fixed at the spec level) and
  will be removed in the next minor.

## 0.3.0

Adds the versioned **`/api/v1`** surface — campaigns, segments, workflows,
analytics, usage, and events — alongside everything that was already here.
Purely additive: no existing method, type, or behavior changed, so upgrading
from 0.2.0 requires no code changes.

### Added

- **Five new resources on the `/api/v1` surface**: `sendly.campaigns`,
  `sendly.segments`, `sendly.workflows`, `sendly.analytics`, and `sendly.usage`.
  Campaigns cover the full lifecycle (`create`, `send`, `cancel`, `pause`,
  `resume`, `stats`); workflows cover definitions plus per-contact executions
  (`startExecution`, `cancelExecution`, `listExecutions`, `stats`).
- **New v1 methods on `sendly.events`**: `list`, `record`, `listNames`, and
  `stats`. The existing `events.track` is untouched and still calls the legacy
  `POST /api/track`; `record` is the same capability on `/api/v1/events` and is
  named differently only because `track` was taken.
- **`sendly.lists`** — `subscribe` and `unsubscribe` for the legacy
  `/api/lists/{id}/*` endpoints, which the SDK had never wrapped. Two behaviors
  worth knowing: on a `doubleOptIn` list the membership comes back `PENDING`
  with a `confirmToken`, and Sendly does **not** send the confirmation email —
  your application delivers `/api/lists/confirm?token=…` to the contact.
  Re-subscribing an address that previously opted out fails with
  `409 RESUBSCRIBE_CONFIRMATION_REQUIRED` unless the body sets
  `allowResubscribe: true`.
- **Auto-pagination.** Every cursor-paginated v1 list has a companion async
  generator that walks the pages for you and yields individual items:
  `campaigns.listAll`, `segments.listAll`, `segments.listContactsAll`,
  `workflows.listAll`, `workflows.listExecutionsAll`, `events.listAll`. The
  `paginateCursor` helper backing them is exported for custom walks.
- **RFC 9457 problem-document support.** `/api/v1` errors arrive as
  `application/problem+json` and are mapped onto the same `SendlyError`
  subclasses as before, chosen by HTTP status — existing `instanceof` checks
  keep working. Two fields are new on `SendlyError`: `requestId` (from
  `request_id`, quote it in support requests) and `fieldErrors` (from `errors`,
  populated on `422 validation_error`). `errorCode` now carries the stable
  lowercase registry value on v1 responses (`invalid_api_key`, `scope_missing`,
  `quota_exhausted`, …); legacy envelope codes are unchanged. The
  `asProblemDocument` helper and the `ProblemDocument` / `ProblemFieldError`
  types are exported.

### Notes on the v1 dialect

- **v1 responses are bare.** Legacy `/api/*` endpoints return
  `{ success, data }` envelopes that the SDK unwraps; `/api/v1` returns the
  resource itself, with snake_case fields. Both live on the same client and the
  same base URL.
- **v1 lists are cursor-only.** The envelope is
  `{ data, has_more, next_cursor }` with `limit` (1–100, default 20) and `after`
  query parameters. There is deliberately no total. Filters and sort must stay
  fixed for a whole walk — changing them mid-pagination answers
  `422 validation_error` asking you to restart from the first page.
- **Two 429s mean different things.** `rate_limited` is the per-key burst
  limiter and clears on its own; `quota_exhausted` is the billing-period quota
  and is terminal until the period resets or the plan is upgraded. Note that
  `X-RateLimit-Reset` is an absolute epoch-seconds instant while the draft-11
  `RateLimit` header's `t=` is delta seconds. This release adds no retry
  machinery.

### Internal

- Re-synced `openapi.json` against the live API (72 operations: 39 legacy +
  33 v1) and regenerated `src/types.generated.ts`.
- `IdempotencyOptions` moved to `src/resources/idempotency.ts` and is now shared
  by every resource that accepts a replay key; it is still re-exported from
  `sendly-sdk` and from `resources/emails`, so no import path broke.
- A handful of request types are corrected where the generator is stricter than
  the API: properties the spec gives a default (`type` on campaign/segment
  creates, `track_membership`, `allowResubscribe`) are optional, and the
  free-form `data`/`context` maps accept any JSON value rather than only nested
  objects.
- The contract suite now covers all 72 spec operations in both directions and
  additionally asserts that every cursor-paginated v1 list has an auto-pagination
  companion.

## 0.2.0

First published release, as unscoped **`sendly-sdk`** on npm (the package was
previously named `@sendly/sdk` in-repo but was never published under that name;
the import surface is unchanged).

### Changed (breaking type change; runtime unchanged)

- **`emails.send()` response type corrected to match the real server
  contract.** The server has always returned
  `{ emails: [{ contact: { id, email }, email }], timestamp }` — one `emails`
  entry per recipient (an array `to` fans out to several), where the nested
  `email` is the id of the queued email record for that recipient. The spec and
  the generated types previously declared a **flat** `{ contact, email,
timestamp }` and typed `send()` as `SendEmailData | SendEmailData[]`, so
  callers doing `const { email } = await sendly.emails.send(...)` got
  `undefined`. `send()` now resolves the single corrected `SendEmailData`
  (`{ emails, timestamp }`). Read a recipient's queued id via
  `result.emails[0].email`.

  This is a **type-only** change: the SDK already returned the response's
  unwrapped `data` verbatim at runtime, so no runtime behavior changed. The
  committed `openapi.json` was corrected to match the server (the platform owner
  ruled the server shape canonical), and `src/types.generated.ts` was
  regenerated from it. Batch send (`emails.batch`) is unaffected — its rows'
  `data` was already typed as `SendEmailData`.

## Unreleased

Re-mirrored against the latest committed Sendly OpenAPI spec (the "route seam"
migration). These are API-level behavior changes; the SDK method surface is
unchanged, but response shapes and error codes callers observe have moved.

### Changed (breaking at the API level)

- **Validation errors are now `422`, not `400`.** Invalid request bodies or
  query parameters return HTTP `422` with `errorCode: "VALIDATION_ERROR"` and a
  `{ success: false, error: { message, code, details: { errors } } }` envelope.
  The SDK maps both `400` and `422` to `SendlyValidationError`, so
  `instanceof SendlyValidationError` checks keep working. Field-level detail is
  available on `err.body.error.details.errors`.
- **Contact bulk operations** (`contacts.bulkCreate`, `contacts.bulkDelete`,
  and the bulk subscribe/unsubscribe routes) that previously failed with a
  `NO_PROJECT` error code now surface as `VALIDATION_ERROR`.
- **Deletes return `200` with a body instead of `204`.** `contacts.delete` and
  `templates.delete` now respond `200 { success: true, data: { id } }` (they
  were `204 No Content`). The SDK still resolves `void` from these methods — no
  caller change is required.
- **`contacts.upsert` always answers `200`.** The create-vs-update distinction
  is no longer signalled via a `201` status code. `contacts.upsert` still
  resolves the contact record.
- **Template list pagination is cursor-based.** `templates.list` now accepts
  `{ limit, cursor }` (previously `{ page, pageSize }`), matching
  `contacts.list` and `emails.list`. List responses carry
  `{ success, data: { data, total, nextCursor, hasMore } }`.

### Internal

- Regenerated `src/types.generated.ts` from the new `openapi.json`.
- The removed page-based `Pagination` schema is replaced by `IdResponse`
  (the `{ success, data: { id } }` delete envelope), re-exported from
  `sendly-sdk` as the `IdResponse` type.
