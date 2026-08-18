# sendly-sdk

Official TypeScript SDK for the [Sendly](https://sendly.now) REST API.

Type-safe email, contact, domain, template, webhook, and suppression
operations, plus the versioned `/api/v1` surface — campaigns, segments,
workflows, analytics, and usage. Generated from the public OpenAPI spec, so
every endpoint and schema stays in sync.

> This repository is the official standalone home and source of truth for the
> Sendly TypeScript SDK — issues and PRs are welcome here. Its surface is
> contract-tested against Sendly's public OpenAPI spec on every change, so the
> client never drifts from the live API. Full docs live at
> [https://docs.sendly.now](https://docs.sendly.now).

## Install

```bash
npm install sendly-sdk
# or
pnpm add sendly-sdk
```

Ships both ESM and CommonJS builds, so `import` and `require` both work.

Alternatively, install the latest `main` directly from GitHub:

```bash
npm install github:DevinoSolutions/sendly-js
```

Requires Node 20+ (or any runtime with global `fetch` and `AbortSignal.timeout`).
The API base is `https://api.sendly.now`; full docs live at
[https://docs.sendly.now](https://docs.sendly.now).

## Already on Resend, SendGrid, Postmark, Mailgun, or Plunk?

You don't even need this SDK to try Sendly. The API also speaks the
transactional-send dialect of those providers — keep the vendor SDK you already
run and change **two things**: the base URL and the API key.

```ts
import { Resend } from "resend"; // your existing Resend integration

const resend = new Resend("sk_your_sendly_key", {
  baseUrl: "https://api.sendly.now/api/compat/resend",
});
// resend.emails.send(...) now sends through Sendly — same code, same shapes.
```

Every compat request runs through the same pipeline as the native API (domain
verification, suppression, limits), and anything a dialect can express that
Sendly doesn't support returns a clean error in that vendor's own error shape.
Per-provider guides: [docs.sendly.now/migrate](https://docs.sendly.now/migrate).

## Quick start

```ts
import { Sendly } from "sendly-sdk";

const sendly = new Sendly({ apiKey: process.env.SENDLY_API_KEY! });

await sendly.emails.send({
  from: "hello@your-domain.com",
  to: "user@example.com",
  subject: "Welcome to Acme",
  html: "<p>Glad to have you.</p>",
});
```

## Authentication

Pass a project API key. `sk_*` keys allow full access; `pk_*` keys are
sending-only. Keys are sent in the `Authorization: Bearer <key>` header
on every request.

```ts
const sendly = new Sendly({
  apiKey: "sk_live_...", // required
  baseUrl: "https://api.sendly.now", // optional, override for staging / self-hosted
  timeout: 30_000, // ms, optional (default 30s)
});
```

## Common operations

### Send a single email

```ts
const result = await sendly.emails.send(
  {
    from: "hello@your-domain.com",
    to: "user@example.com",
    subject: "Order confirmed",
    html: "<p>Thanks for your order.</p>",
  },
  { idempotencyKey: "order-confirm-12345" }, // optional, replays deduped 24h
);

// `result` is `{ emails, timestamp }` with one `emails` entry per recipient —
// an array `to` fans out to several. Each entry is
// `{ contact: { id, email }, email }`, where `email` is the id of the queued
// email record for that recipient. Poll `emails.get(id)` for its status.
const emailId = result.emails[0].email;
console.log("queued", emailId, "at", result.timestamp);
```

### List emails with filters and cursor pagination

```ts
const page = await sendly.emails.list({ limit: 20, tag: "welcome", status: "DELIVERED" });
for (const email of page.data.items) {
  console.log(email.id, email.to, email.status);
}
if (page.data.cursor) {
  const next = await sendly.emails.list({ limit: 20, cursor: page.data.cursor });
}
```

### Upsert a contact

```ts
const contact = await sendly.contacts.upsert({
  email: "user@example.com",
  customFields: { plan: "pro", signedUpAt: new Date().toISOString() },
});
```

### Manage domains

```ts
const domain = await sendly.domains.create({ name: "mail.your-domain.com" });
await sendly.domains.verify(domain.id);
const status = await sendly.domains.getVerification(domain.id);
```

### Subscribe a webhook

```ts
const { webhook, secret } = await sendly.webhooks.create({
  url: "https://your-app.com/webhooks/sendly",
  eventTypes: ["email.delivered", "email.bounced", "email.complained"],
});
// store `secret` securely — used to verify HMAC signatures on incoming calls
```

### Add to the suppression list

```ts
await sendly.suppression.add({ email: "angry@example.com", reason: "MANUAL" });
```

### Track a custom event

Records a custom event against a contact. Works with both `sk_*` and `pk_*`
keys (reserved system event names are rejected).

```ts
const tracked = await sendly.events.track({
  event: "purchase.completed",
  email: "user@example.com",
  data: { plan: "pro", amount: 4900 },
});
console.log(tracked.contact, tracked.event);
```

### Verify an email address

```ts
const check = await sendly.verify.email({ email: "user@example.com" });
if (!check.valid) {
  console.log("rejecting", check.reason);
}
```

## The `/api/v1` surface

Campaigns, segments, workflows, analytics, usage, and events live on Sendly's
versioned API. They hang off the same client and the same base URL, but they
speak a different dialect from the `/api/*` resources above:

- **Responses are the bare resource**, not a `{ success, data }` envelope, and
  fields are `snake_case`.
- **Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem
  documents** (`application/problem+json`) — see below.
- **Lists are cursor-paginated only** — `{ data, has_more, next_cursor }`, no
  total.

```ts
const campaign = await sendly.campaigns.create(
  {
    name: "August launch",
    subject: "We shipped it",
    body: "<p>Read all about it.</p>",
    from: "hello@your-domain.com",
    audience_type: "SEGMENT",
    segment_id: segment.id,
  },
  { idempotencyKey: `launch-${releaseId}` },
);

// Creating never sends. Send now, or schedule it:
await sendly.campaigns.send(campaign.id, { scheduled_for: "2026-09-01T10:00:00Z" });

const stats = await sendly.campaigns.stats(campaign.id);
console.log(stats.delivered, stats.open_rate);
```

### Pagination

Every v1 list takes `limit` (1–100, default 20) and `after` (an opaque cursor
from the previous response's `next_cursor`). Page manually, or let the SDK do
it — each list has a companion `*All` async generator that walks the pages and
yields individual items:

```ts
// Manual: stop when has_more goes false.
let page = await sendly.campaigns.list({ limit: 50 });
while (page.has_more && page.next_cursor) {
  page = await sendly.campaigns.list({ limit: 50, after: page.next_cursor });
}

// Automatic: campaigns.listAll, segments.listAll, segments.listContactsAll,
// workflows.listAll, workflows.listExecutionsAll, events.listAll.
for await (const campaign of sendly.campaigns.listAll({ limit: 50 })) {
  console.log(campaign.id, campaign.status);
}
```

Keep the filter and sort arguments **fixed for the whole walk** — the cursor
encodes them, and changing them mid-pagination is answered with
`422 validation_error` telling you to restart from the first page. There is
deliberately no total count.

### Events: `track` vs `record`

`events.track` is the legacy `POST /api/track` endpoint and is unchanged.
`events.record` is the same capability on `/api/v1/events` — a different name
only because `track` was taken. New integrations should prefer `record`, which
also unlocks `events.list`, `events.listNames`, and `events.stats`.

## Error handling

Every non-2xx response throws a typed `SendlyError` subclass. Switch on the
class (no string matching needed):

```ts
import {
  SendlyValidationError,
  SendlyAuthenticationError,
  SendlyNotFoundError,
  SendlyRateLimitError,
  SendlyServerError,
} from "sendly-sdk";

try {
  await sendly.emails.send({ from, to, subject, html });
} catch (err) {
  if (err instanceof SendlyValidationError) {
    console.warn("bad input:", err.errorCode, err.message);
  } else if (err instanceof SendlyAuthenticationError) {
    console.error("check your API key");
  } else if (err instanceof SendlyRateLimitError) {
    // back off and retry
  } else if (err instanceof SendlyServerError) {
    // 5xx — retry with exponential backoff
  } else {
    throw err;
  }
}
```

Each error exposes:

- `statusCode` — HTTP status (0 for transport failures)
- `errorCode` — stable machine code from the API envelope
- `message` — human-readable message
- `body` — full parsed response body for debugging
- `requestId` — correlation id, on `/api/v1` errors only (see below)
- `fieldErrors` — per-field failures, on `/api/v1` `422` responses only

### `/api/v1` errors (RFC 9457)

The versioned surface answers failures with a `application/problem+json`
document: `{ type, title, status, detail?, instance?, code, request_id?,
errors? }`. The SDK maps it onto the **same** error subclasses by HTTP status,
so nothing about `instanceof` handling changes. What it adds is better detail:

- `errorCode` is the problem's stable lowercase registry value —
  `invalid_api_key`, `invalid_session`, `scope_missing`, `project_access_denied`,
  `project_disabled`, `validation_error`, `resource_not_found`, `conflict`,
  `rate_limited`, `quota_exhausted`, `idempotency_key_reused`, `enqueue_failed`,
  `internal_error`.
- `message` is the problem's `detail` (falling back to `title`).
- `requestId` is the `request_id` — quote it in support requests.
- `fieldErrors` is the `errors` array on a `422 validation_error`: one
  `{ pointer, code, message }` per offending field, `pointer` being an RFC 6901
  JSON Pointer.

```ts
try {
  await sendly.campaigns.create({ name: "", subject: "Hi", body, from, audience_type: "ALL" });
} catch (err) {
  if (err instanceof SendlyValidationError) {
    for (const field of err.fieldErrors ?? []) {
      console.warn(`${field.pointer}: ${field.message}`);
    }
    console.warn("request id:", err.requestId);
  }
}
```

Two different situations share HTTP `429`, and `errorCode` is what separates
them: `rate_limited` is the per-key burst limiter and clears on its own, while
`quota_exhausted` is your billing-period quota and stays until the period resets
or the plan is upgraded — retrying it will not help. When reading the reset
hint, note that `X-RateLimit-Reset` is an **absolute** epoch-seconds instant
whereas the draft-11 `RateLimit` header's `t=` is **delta** seconds. The SDK
does not retry on your behalf.

### Legacy `/api/*` errors

Invalid input is reported as `SendlyValidationError`. The API returns **422**
(`errorCode: "VALIDATION_ERROR"`) for schema validation failures; the SDK maps
both `400` and `422` to `SendlyValidationError`, so existing `instanceof`
checks keep working. Field-level detail, when present, is on
`err.body.error.details.errors`:

```ts
if (err instanceof SendlyValidationError) {
  const fields = (err.body as { error?: { details?: { errors?: unknown[] } } })?.error?.details?.errors;
  console.warn("validation failed:", err.errorCode, fields);
}
```

The error envelope is `{ success: false, error: { message, code, details? } }`.
Contact bulk operations that previously failed with a `NO_PROJECT` code now
surface as `VALIDATION_ERROR`.

## Idempotency

Pass `idempotencyKey` on any write that supports it (`emails.send`,
`emails.batch`, `contacts.create`, `contacts.upsert`, `contacts.bulkCreate`,
and on `/api/v1` exactly `campaigns.create` and `campaigns.send`) to make
retries safe. Replays within 24 hours return the original result instead of
acting twice. `events.record` deliberately takes no key — events are
append-only, high-volume writes.

```ts
await sendly.emails.send({ from, to, subject, html }, { idempotencyKey: `signup-${userId}` });
```

## Custom fetch

Inject your own `fetch` for SSR, instrumentation, or testing:

```ts
const sendly = new Sendly({
  apiKey: "sk_test",
  fetch: async (input, init) => {
    console.log("outbound", init?.method, input);
    return globalThis.fetch(input, init);
  },
});
```

## API reference

Full reference, schemas, and live OpenAPI spec live at
[https://docs.sendly.now](https://docs.sendly.now).

## Development

```bash
pnpm install        # install pinned toolchain
pnpm test           # run the vitest suite once
pnpm lint           # eslint (0 warnings tolerated)
pnpm check-types    # tsc --noEmit
pnpm build          # regenerate types from openapi.json, then bundle with tsup
```

The type definitions in `src/types.generated.ts` are generated from
`openapi.json` via `pnpm build:types`. `openapi.json` is a committed snapshot
of Sendly's public OpenAPI spec; refresh it from the live API with
`pnpm sync-spec`, then regenerate the types (`pnpm build:types`, which
`pnpm build` runs for you). The SDK surface is verified against this snapshot
by the contract suite in `src/__tests__/contract.test.ts`.

## License

[MIT](./LICENSE) © Devino Solutions
