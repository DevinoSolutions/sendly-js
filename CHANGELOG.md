# Changelog

All notable changes to `@sendly/sdk` are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## 0.2.0

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
  `@sendly/sdk` as the `IdResponse` type.
