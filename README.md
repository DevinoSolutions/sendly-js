# @sendly/sdk

Official TypeScript SDK for the [Sendly](https://sendly.now) REST API.

Type-safe email, contact, domain, template, webhook, and suppression
operations. Generated from the public OpenAPI spec, so every endpoint and
schema stays in sync.

> This repository is the official standalone home and source of truth for the
> Sendly TypeScript SDK — issues and PRs are welcome here. Its surface is
> contract-tested against Sendly's public OpenAPI spec on every change, so the
> client never drifts from the live API. Full docs live at
> [https://docs.sendly.now](https://docs.sendly.now).

## Install

```bash
npm install @sendly/sdk
# or
pnpm add @sendly/sdk
```

Ships both ESM and CommonJS builds, so `import` and `require` both work.

Alternatively, install the latest `main` directly from GitHub:

```bash
npm install github:DevinoSolutions/sendly-js
```

Requires Node 20+ (or any runtime with global `fetch` and `AbortSignal.timeout`).
The API base is `https://api.sendly.now`; full docs live at
[https://docs.sendly.now](https://docs.sendly.now).

## Quick start

```ts
import { Sendly } from "@sendly/sdk";

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
} from "@sendly/sdk";

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
`emails.batch`, `contacts.create`, `contacts.upsert`, `contacts.bulkCreate`)
to make retries safe. Replays within 24 hours return the original result
instead of acting twice.

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
