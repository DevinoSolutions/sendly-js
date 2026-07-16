# Changelog

All notable changes to `@sendly/sdk` are documented here. This project follows
[Semantic Versioning](https://semver.org/).

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
