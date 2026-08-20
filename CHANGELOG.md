# Changelog

All notable changes to `sendly-sdk` are documented here. This project follows
[Semantic Versioning](https://semver.org/).

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
