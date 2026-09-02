# sendly-sdk

Official TypeScript SDK for the [Sendly](https://sendly.now) REST API.

Type-safe email, contact, domain, template, webhook, and suppression
operations, plus mailbox and project reads and the versioned `/api/v1`
surface — campaigns, segments, workflows, analytics, and usage. Generated from
the public OpenAPI spec, so every endpoint and schema stays in sync.

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

const receipt = await sendly.emails.send({
  from: "hello@your-domain.com",
  to: "user@example.com",
  subject: "Welcome to Acme",
  body: "<p>Glad to have you.</p>",
});
console.log(receipt.id, receipt.status); // status is a real delivery state
```

## Upgrading from 0.x

**1.0 repoints `emails.send` to the versioned `POST /api/v1/emails`.** It now
takes one recipient (`cc`/`bcc` copy others) and resolves the `202` receipt
`{ id, status, to, from }`, where `status` is a real delivery state. Before 1.0
it posted to the legacy `POST /api/emails`, fanned an array `to` out to several
recipients, and resolved `{ emails, timestamp }` with no delivery status.

The old behaviour is kept, unchanged, as `emails.sendLegacy`. Two ways to
upgrade:

- **Keep the old shapes:** rename the call. `send(...)` → `sendLegacy(...)`.
  Done.
- **Take the new default:** read the receipt instead of the envelope
  (`receipt.id` / `receipt.status` in place of `result.emails[0].email`), send
  to one recipient per call, and note that failures now carry the v1 error
  fields (`errorCode` is lowercase, `requestId` and `fieldErrors` are set) —
  the `SendlyError` subclasses are the same, so `instanceof` checks stand.

Nothing else changed shape. See [CHANGELOG.md](./CHANGELOG.md) for the full
1.0.0 entry.

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
const receipt = await sendly.emails.send(
  {
    from: "hello@your-domain.com",
    to: "user@example.com", // one recipient; `cc` / `bcc` copy others
    subject: "Order confirmed",
    body: "<p>Thanks for your order.</p>",
  },
  { idempotencyKey: "order-confirm-12345" }, // optional, replays deduped 24h
);

// `receipt` is `{ id, status, to, from }`, answered with 202. `status` is a real
// delivery state — poll `emails.get(receipt.id)` for the events behind it.
console.log(receipt.id, receipt.status);
```

The pre-1.0 send — the legacy `POST /api/emails`, which fans an array `to` out
to several recipients and answers `{ emails, timestamp }` with no delivery
status — is still here as `emails.sendLegacy`:

```ts
const result = await sendly.emails.sendLegacy({
  from: "hello@your-domain.com",
  to: ["a@example.com", "b@example.com"],
  subject: "Order confirmed",
  body: "<p>Thanks for your order.</p>",
});
// One `emails` entry per recipient: `{ contact: { id, email }, email }`, where
// `email` is the id of the queued email record. Poll `emails.get(id)` for status.
console.log(
  result.emails.map((entry) => entry.email),
  result.timestamp,
);
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
const domain = await sendly.domains.create({ domain: "mail.your-domain.com" });
await sendly.domains.verify(domain.id);
const status = await sendly.domains.getVerification(domain.id);
```

Pass `region` to pin the domain to an SES region (`us-east-1`, `us-west-2` or
`eu-west-1`). The first domain locks the project's region; later ones must match
it.

Publishing the DNS records by hand is not the only route. `startSetup` opens the
guided hand-off and returns the session exactly as the API returns it:

```ts
const session = await sendly.domains.startSetup(domain.id);
// { token, connectUrl, expiresAt } — connectUrl is short-lived and domain-specific.
console.log("finish setup at", session.connectUrl, "before", session.expiresAt);
```

Nothing here is reshaped, because finishing setup means a **person** opening
`connectUrl` and authorising the change at their registrar. The SDK's job is to
hand back the link, not to model the flow behind it.

### Read mailboxes

Receiving mailboxes on the project's verified domains. Reads only — see
[What the SDK deliberately does not expose](#what-the-sdk-deliberately-does-not-expose).

```ts
const mailboxes = await sendly.mailboxes.list(); // not paginated
const mailbox = await sendly.mailboxes.get(mailboxes[0].id);

// `settings` carries the IMAP and SMTP host, port, security and username.
console.log(mailbox.settings.imap.host, mailbox.settings.imap.port);

// App passwords, metadata only — `lastFour` is the one fragment of the secret
// that survives creation, so a credential can be identified but not rebuilt.
for (const pw of await sendly.mailboxes.listAppPasswords(mailbox.id)) {
  console.log(pw.name, pw.lastFour, pw.lastUsedAt);
}
```

This lists the mailboxes themselves, never their contents — received messages
are not part of the public API. The mailbox **password** is never returned by
any of these reads; mailbox credentials are app passwords, created from the
dashboard and shown once. `listAppPasswords` returns only the passwords that are
still active — a revoked one drops out, so this is not an audit history.

**The per-project cap is 10 mailboxes.** It counts only those holding, or
mid-way to holding, a real account — `PROVISIONING`, `ACTIVE` and `SUSPENDED`.
`FAILED` rows are excluded on purpose, so that a burst of failed provisions
cannot eat a project's allowance and turn an outage into "you have reached your
mailbox limit"; they are still returned by `list()`, so a project that has had
failures can list more than 10. Exceeding the cap is a `409`
(`SendlyConflictError`) from whatever creates the mailbox — which is not this
SDK, since mailbox creation needs a signed-in user.

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

### Emails: `send` vs `sendLegacy`

The same split, resolved the other way round: since 1.0, `emails.send` IS the
versioned send. It posts to `/api/v1/emails` and answers `202` with
`{ id, status, to, from }`, where `status` is a real delivery state you can poll
on. It takes one recipient — use `cc`/`bcc` to copy others — instead of fanning
an array out. `emails.sendLegacy` is the pre-1.0 send on `POST /api/emails`,
unchanged: row ids, **no delivery status**, array `to` fanned out. See
[Upgrading from 0.x](#upgrading-from-0x).

`send` accepts an `idempotencyKey`; `sendTest` deliberately does not (see
[Idempotency](#idempotency)).

```ts
const receipt = await sendly.emails.send(
  { to: "user@example.com", subject: "Order confirmed", body: "<p>Thanks.</p>" },
  { idempotencyKey: `order-${orderId}` },
);
console.log(receipt.id, receipt.status); // status is a real delivery state
```

### Test sends

`emails.sendTest` proves the send path works without touching a live
recipient. Two things about it are easy to get backwards:

- **The sandbox address is the _sender_, not the destination.** It is resolved
  server-side, and naming a `from` yourself is **refused** rather than ignored —
  so a request expecting a different sender never gets a success it would
  misread. `projects.get().sandbox_address` tells you what it sends _from_; the
  response's `from` says the same thing.
- **It lands in the project owner's own inbox.** `to` is optional and defaults
  to the project owner's verified account email, which is the only address a
  sandbox send may reach — any other value is refused.

```ts
const test = await sendly.emails.sendTest({ subject: "hi", body: "<p>hi</p>" });
console.log(test.to, test.from, test.sandbox); // sandbox is always true here
```

Everything else applies unchanged: the same rendering, the same content scan,
the same daily and trust-tier caps as a real send.

### The current project

```ts
const project = await sendly.projects.get();
console.log(project.name, project.sandbox_address, project.ses_region);
```

Takes no id — the project is whichever one the API key belongs to. There is no
`create` here; see below.

### What the SDK deliberately does not expose

An API key resolves no user, and a handful of routes resolve the acting project
admin from the session before reading any scope — so they answer `401` to any
key, however broad its scopes. The contract states this: those operations
publish `SessionAuth` without `ApiKeyAuth`.

Rather than ship methods that could never succeed, they are listed in the
contract suite's `NOT_SDK_CALLABLE` and checked against the spec's own
declarations, in both directions. They are: creating and deleting a mailbox,
creating and revoking an app password, all four API-key operations, and
creating a project. Use the dashboard or an OAuth connection for those.

Mailbox **reads** are exposed (`mailboxes.list`, `mailboxes.get`,
`mailboxes.listAppPasswords`) — their membership check is conditional, so a key
really can call them.

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
  await sendly.emails.send({ from, to, subject, body });
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

Pass `idempotencyKey` on any write that supports it — `emails.send`,
`emails.sendLegacy`, `emails.batch`, `contacts.create`, `contacts.upsert`,
`contacts.bulkCreate`, `campaigns.create` and `campaigns.send` — to make
retries safe. Replays within 24 hours return the original result instead of
acting twice.

Two v1 writes deliberately take no key. `events.record` is append-only and
high-volume. `emails.sendTest` reaches only the caller's own inbox, a daily
cap already bounds it, and "send me another one" is the normal second call
rather than a mistake worth deduplicating.

```ts
await sendly.emails.send({ from, to, subject, body }, { idempotencyKey: `signup-${userId}` });
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
`openapi.json` via `pnpm build:types`. `openapi.json` is a committed snapshot of
Sendly's OpenAPI contract, and the SDK surface is verified against it by the
contract suite in `src/__tests__/contract.test.ts`.

### Refreshing `openapi.json`

`pnpm sync-spec` requires `SENDLY_OPENAPI_URL`. There is **no default**, and in
particular it does not default to production:

```bash
SENDLY_OPENAPI_URL=/path/to/sendly/apps/web/openapi/openapi.json pnpm sync-spec
pnpm build:types   # regenerate types (pnpm build runs this for you)
```

`SENDLY_OPENAPI_URL` accepts a filesystem path (the normal case — the committed
contract in the Sendly platform monorepo at `apps/web/openapi/openapi.json`) or
an `http(s)://` URL of a local or staging API. Running `pnpm sync-spec` with it
unset exits non-zero and prints what to set.

**Do not point it at `https://api.sendly.now`.** Vendoring the spec from the
deployed API makes the SDK mirror what is _running_ rather than what the repo
_declares_, so any drift between the platform's code and its committed contract
is laundered into "correct" on the way in — the SDK regenerates to match the
deployment and the mismatch vanishes silently. That destroys the vendored spec's
only job: it is the fixed reference the contract suite compares against, so an
SDK synced from production can no longer detect the very drift it exists to
catch. It is also unreproducible and unreviewable.

This is not hard-blocked — "what does production actually serve?" is a legitimate
one-off. Doing it prints an unmissable warning (and a CI annotation), because
_quiet_ is what made the old default dangerous, not the host. Never commit the
result, and never wire that host into CI or any unattended job.

`pnpm check-spec-drift` compares the committed `openapi.json` to the same source
and never fails the build. With `SENDLY_OPENAPI_URL` unset it skips with a notice
rather than erroring, so CI and fork pull requests stay green.

## License

[MIT](./LICENSE) © Devino Solutions
