# sendly-sdk

Official TypeScript SDK for the [Sendly](https://sendly.now) REST API.

Type-safe email, contact, list, topic, domain, template, snippet, webhook and
suppression operations; mailbox reads plus the two composition calls a key may
drive; address validation and deliverability reporting; and the versioned
`/api/v1` surface — campaigns, segments, workflows, analytics, and usage.
Generated from the public OpenAPI spec, so every endpoint and schema stays in
sync.

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

## Upgrading from 1.0

1.1 is mostly additive — four new resources and the `/api/v1` half of six more —
but it also tracks a set of **wire-visible renames** that landed in the platform,
so it is a breaking release. Do not deploy 1.1 against an API that has not taken
the renamed wire yet: the old field names are gone from these types, and sending
`type` where the API now expects `emailCategory` is a `422`, not a shrug.

What to change, in the order a codebase usually hits it:

- **`type` → `emailCategory` (legacy) / `email_category` (v1)** on templates and
  campaigns. Affects `templates.create`, `templates.update`, the `emailCategory`
  filter on `templates.list`, and `campaigns.create`. The enum member `HEADLESS`
  is now `SELF_MANAGED_UNSUBSCRIBE`; `MARKETING` and `TRANSACTIONAL` are
  unchanged.
- **`data` → `payload`** in the body of `events.record` (the v1 write). The
  legacy `events.track` is untouched and still takes `data` — the two endpoints
  were renamed on different schedules, and this SDK reports what each one
  actually accepts rather than papering over the difference.
- **`mailFromStatus` → `mailFromDomainStatus`** on a domain, and
  `mail_from_domain_status` on the v1 document.
- **`emails.get` returns a different body** — the one change here worth reading
  in full; see below.
- **`EmailGetResponse` is gone.** It named the operation rather than the shape,
  and was then reused by an operation that is not a GET. It is now two types:
  `EmailResponse` (a single email) and `EmailDetailResponse` (an email plus its
  delivery events), and `emails.get` resolves the latter.
- **The double-opt-in confirmation route moved** from `/api/lists/confirm` to
  `/api/lists/confirm-subscription`. Sendly has never sent that email for you, so
  if you build the URL yourself — and `lists.subscribe` is documented on the
  assumption that you do — change the path.

### `emails.get`, specifically

It used to hand back the whole database row together with an `events` array that
was the **wrong relation**: the custom analytics events a caller records with
`events.record`, not the delivery history the operation has always promised.

It now returns an explicit field list plus `events` as the delivery timeline
(`EmailEvent[]`, oldest first), and it fills `to` from the joined contact — which
the spec had always declared and the response had never carried.

Fields that used to leak out of it and no longer do: `bodyHash`, `dedupKey`,
`idempotencyKey`, `linkMap`, `sesMessageId`, `sesInboundMessageId`, `body` and
`headers`. Four of those are ledger keys for deduplication and idempotency; the
rest are internal routing state or the rendered message itself. None of them were
ever documented, and a caller reading them was reading Sendly's bookkeeping.

If you were reading `events` from this call expecting custom events, read
`events.list` instead. If you were reading the message body back out of it, keep
your own copy — it is not published here.

### Engagement left the delivery status

`OPENED`, `CLICKED` and `COMPLAINED` are no longer delivery statuses on the
platform, and the SDK's own status type — the enum behind `email.status` and the
`status` filter on `emails.list` — no longer offers them. A message is
`PENDING`, `SENDING`, `SENT`, `DELIVERED`, `RECEIVED`, `BOUNCED`, `FAILED`,
`REJECTED`, `RENDERING_FAILURE`, `DELIVERY_DELAY` or `CANCELLED`. Engagement is a
separate axis, read from `openedAt` / `clickedAt` / `complainedAt` and the
`opens` / `clicks` counters on the email itself:

```ts
const { data: email } = await sendly.emails.get(id);
const delivered = email.status === "DELIVERED"; // a delivery fact
const engaged = email.openedAt !== null || email.clicks > 0; // an engagement fact
```

The two used to be one enum, which meant an opened message stopped reporting that
it had been delivered.

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

## The resources

Every resource hangs off the client. A `V1` suffix means the method speaks the
versioned dialect; an unsuffixed method on the same resource speaks the legacy
one. See [Both dialects, one client](#both-dialects-one-client) for why both are
here.

| `sendly.*`       | Methods                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emails`         | `send`, `sendLegacy`, `sendTest`, `batch`, `list`, `get`, `cancelSchedule`                                                                                                                          |
| `contacts`       | `create`, `upsert`, `bulkCreate`, `bulkDelete`, `list`, `get`, `update`, `delete`, `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`, `deleteV1`, `topicPreferences`                           |
| `lists`          | `subscribe`, `unsubscribe`, `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`, `deleteV1`, `startValidationRun`                                                                                |
| `topics`         | `list`, `listAll`, `create`, `get`, `update`, `setSubscription`                                                                                                                                     |
| `templates`      | `create`, `list`, `get`, `update`, `delete`, `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`, `deleteV1`                                                                                     |
| `snippets`       | `create`, `list`, `get`, `update`, `delete`                                                                                                                                                         |
| `domains`        | `create`, `list`, `get`, `verify`, `getVerification`, `startSetup`, `assignStream`, `delete`, `listV1`, `listAllV1`, `createV1`, `getV1`, `verifyV1`, `deleteV1`                                    |
| `webhooks`       | `create`, `list`, `get`, `update`, `delete`, `rotateSecret`, `listCalls`, `listV1`, `listAllV1`, `createV1`, `getV1`, `updateV1`, `deleteV1`, `rotateSecretV1`                                      |
| `suppression`    | `add`, `list`, `get`, `remove`, `listV1`, `listAllV1`, `createV1`, `getV1`, `deleteV1`                                                                                                              |
| `events`         | `track`, `record`, `list`, `listAll`, `listNames`, `stats`                                                                                                                                          |
| `campaigns`      | `list`, `listAll`, `create`, `get`, `update`, `delete`, `send`, `cancel`, `pause`, `resume`, `stats`, `listFailures`, `listFailuresAll`, `retryFailed`                                              |
| `segments`       | `list`, `listAll`, `create`, `get`, `update`, `delete`, `listContacts`, `listContactsAll`                                                                                                           |
| `workflows`      | `list`, `listAll`, `create`, `get`, `update`, `delete`, `listExecutions`, `listExecutionsAll`, `startExecution`, `cancelExecution`, `stats`, `getGraph`, `replaceGraph`, `clone`, `pause`, `resume` |
| `mailboxes`      | `list`, `get`, `listAppPasswords`, `sendMessage`, `draftMessage`                                                                                                                                    |
| `validation`     | `validateEmails`, `getRun`, `listResults`, `listResultsAll`                                                                                                                                         |
| `deliverability` | `diagnose`, `listDomainStats`, `listDomainStatsAll`, `listDmarcReports`, `listDmarcReportsAll`                                                                                                      |
| `analytics`      | `timeseries`, `campaigns`, `topCampaigns`                                                                                                                                                           |
| `usage`          | `get`                                                                                                                                                                                               |
| `projects`       | `get`                                                                                                                                                                                               |
| `verify`         | `email`                                                                                                                                                                                             |

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

### Read an email and its delivery history

```ts
const { data: email } = await sendly.emails.get(receipt.id);

console.log(email.to, email.status, email.opens, email.clicks);

// `events` is the DELIVERY timeline behind `status`, oldest first — not the
// custom events you record with `events.record`, which are read from
// `events.list`.
for (const event of email.events) {
  console.log(event.timestamp, event.status);
}
```

This is one of the few legacy reads the SDK hands back enveloped rather than
unwrapped, so the email is under `.data`.

### List emails with filters and cursor pagination

```ts
const page = await sendly.emails.list({ limit: 20, tag: "welcome", status: "DELIVERED" });
for (const email of page.data) {
  console.log(email.id, email.to, email.status);
}
if (page.nextCursor) {
  const next = await sendly.emails.list({ limit: 20, cursor: page.nextCursor });
}
```

`status` filters on the delivery lifecycle only. To find the messages somebody
opened, read `openedAt` / `opens` on the rows — engagement is not a status.

### Upsert a contact

```ts
const contact = await sendly.contacts.upsert({
  email: "user@example.com",
  customFields: { plan: "pro", signedUpAt: new Date().toISOString() },
});
```

The v1 half of the resource manages the same contacts with snake_case bodies and
cursor pagination — `contacts.listV1`, `createV1`, `getV1`, `updateV1`,
`deleteV1`, and `contacts.listAllV1` to walk every page:

```ts
// `subscribed` is the string "true" / "false" here, not a boolean — it is a
// query parameter with three states, and omitting it means "both".
for await (const contact of sendly.contacts.listAllV1({ subscribed: "true" })) {
  console.log(contact.email, contact.custom_fields);
}
```

Two things about `contacts.updateV1` catch people out: `email` is not patchable
at all (an address is the contact's identity, and rewriting it in place would
change who every earlier send was addressed to), and `custom_fields` is
**replaced, not merged** — send back every key you mean to keep.

### Read one contact's consent

```ts
const prefs = await sendly.contacts.topicPreferences(contact.id);

// `prefs.subscribed` is the global marketing opt-out and OUTRANKS every topic:
// false means nothing marketing reaches them whatever the rows below say.
for (const topic of prefs.topics) {
  console.log(topic.key, topic.subscribed, topic.pending);
}
```

Each topic's `subscribed` is the effective answer the send path reaches today,
with the topic's `default_opt_in` already folded in, so a contact who has never
answered still reads correctly.

### Manage domains

```ts
const domain = await sendly.domains.create({ domain: "mail.your-domain.com" });
// Publish each token as a CNAME record before verification can succeed.
console.log(domain.dkimTokens);

await sendly.domains.verify(domain.id);

const status = await sendly.domains.getVerification(domain.id);
// One status per record type, not one verdict for the domain.
console.log(status.dkimStatus, status.spfStatus, status.dmarcStatus);
```

Pass `region` to pin the domain to an SES region (`us-east-1`, `us-west-2` or
`eu-west-1`). The first domain locks the project's region; later ones must match
it.

A domain reports each DNS record type separately — `dkimStatus`, `spfStatus` and
`dmarcStatus` are each `NOT_CHECKED`, `PENDING`, `VERIFIED` or `FAILED`, and
`lastHealthCheckAt` says when they were last filled. `status` on the verification
response is a different thing: SES's own raw DKIM state (`Success`, `Pending`),
which is why both are published rather than collapsed into one. `receivingEnabled`
says whether inbound mail for the domain is routed to Sendly mailboxes.

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

`assignStream` points a verified identity at one kind of traffic:

```ts
await sendly.domains.assignStream(domain.id, {
  stream: "TRANSACTIONAL",
  streamDefault: true,
  defaultFromAddress: "receipts@mail.your-domain.com",
});
```

Streams are enforced, not labelled: once assigned, a send of the other kind from
this identity is refused with `403` — which is what keeps a campaign's complaint
rate off the identity your password resets go out on. `stream: null` unassigns
it, returning it to carrying both. `streamDefault` demotes whichever identity
currently holds the default for that stream, and `defaultFromAddress` has to be
an address on this identity's own host.

### Mailboxes: read, send, and draft

Receiving mailboxes on the project's verified domains. The reads are reads; the
two composition calls are not — `sendMessage` really sends.

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

**`sendMessage` sends real mail**, from the mailbox in the path, over its own
domain, and the recipient can reply to it:

```ts
const sent = await sendly.mailboxes.sendMessage(mailbox.id, {
  to: ["customer@example.com"],
  subject: "Re: your order",
  body: "Shipping tomorrow — tracking to follow.",
});
console.log(sent.conversationId, sent.messageId);
```

There is no `from` field, on purpose: a route that sends under a customer's own
identity must not take that identity as an argument. `body` is plain text and
HTML is refused — Sendly renders the HTML part itself, escaping as it goes, so
text becomes markup in exactly one place. Bcc recipients are delivered to but
appear in no header, so the copy filed in the Sent folder does not record them.
Refusals worth handling by name: `422 RECIPIENT_SUPPRESSED`,
`422 CONTENT_REFUSED`, and `503 CONTENT_SCAN_UNAVAILABLE` (no verdict yet for a
young project — nothing was sent, retry shortly). A mailbox may send 60 messages
an hour here.

**`draftMessage` sends nothing.** It asks Sendly's assistant to write text and
hands it back for you to review:

```ts
const draft = await sendly.mailboxes.draftMessage(mailbox.id, {
  mode: "draft", // or "rewrite", or "subject"
  brief: "Tell the customer their order ships tomorrow and apologise for the delay.",
  tone: "apologetic",
});
console.log(draft.subject, draft.body, draft.sent); // sent is always false
```

`sent: false` is reported rather than assumed, so a draft cannot be mistaken for
a send. It stores nothing, reads no correspondence, and needs only
`mailboxes:read` where sending needs `mailboxes:send` — a client that may draft
is not thereby a client that may mail your customers. Everything you pass is
treated strictly as data describing what to write, never as instructions to the
model. Capped at 120 requests an hour per project; `502` means the model was
unreachable.

### Templates and snippets

```ts
const template = await sendly.templates.create({
  name: "Welcome",
  subject: "Welcome to Acme",
  body: "<p>Hi {{ name }}</p>{{> footer }}",
  from: "hello@your-domain.com",
  emailCategory: "MARKETING", // was `type` before 1.1
});
```

`emailCategory` is `MARKETING`, `TRANSACTIONAL` or `SELF_MANAGED_UNSUBSCRIBE`
(the member that used to be called `HEADLESS`). It defaults to `MARKETING` and
is also the legacy list filter: `templates.list({ emailCategory: "MARKETING" })`.

A template carries `currentVersion`, a counter an update increments only when it
changes the **rendered content** — a rename leaves it alone. A campaign records
the version it sent, so comparing the two is how you tell "the template changed
since this went out" from "somebody retitled it".

A **snippet** is a reusable fragment a template pulls in with `{{> name}}`.
`name` is the literal identifier templates include, unique within the project, so
a clash answers `409`:

```ts
await sendly.snippets.create({
  name: "footer",
  description: "Address block and unsubscribe line",
  body: "<hr /><p>Acme Inc, 1 Example Way</p>",
});

const page = await sendly.snippets.list({ limit: 25, search: "footer" });
console.log(page.data.data.length, page.data.hasMore);
```

Snippets are gated by the same `templates:*` scopes as the templates that include
them, because a snippet is part of a template body rather than a resource with an
audience of its own. Deleting one does not break the templates that include it —
an absent snippet renders as an empty string, like an absent variable.

### Consent: topics

A topic is the subject a project mails about — a contact subscribes to a topic
rather than to a campaign, so switching one off silences a whole audience.

```ts
const topic = await sendly.topics.create({
  key: "product-updates", // stable; survives a rename of `name`, and is not patchable
  name: "Product updates",
  default_opt_in: true,
});

const result = await sendly.topics.setSubscription(topic.id, {
  contact_id: contact.id,
  subscribed: true,
});
```

**Subscribing somebody through the API does not bypass confirmation.**
`subscribed: true` parks the contact at `pending` and answers a
`confirmation_url`; nothing is mailed on this topic until someone opens that
link, and there is no parameter to skip it — a subscription a caller asserts is
not evidence the mailbox holder agreed. Sendly does not send that email; **your
application** delivers `result.confirmation_url`, from your own verified domain.
`subscribed: false` records the opt-out immediately.

`default_opt_in` decides what silence means for a contact who never answers: true
for a topic introduced over a list that already consented to hear from you, false
for anything a person has to ask for.

There is no `topics.delete`. A topic is where people's answers are recorded, so
deleting it would delete the choices they made; `update(id, { archived: true })`
is the retire button and drops it from the preference centre and from new sends
while every opt-out survives. `list({ include_archived: true })` brings them back.

### Validate addresses before you mail them

**Every address checked is billed.** Looping this over a contact list is looping
over your invoice.

```ts
const batch = await sendly.validation.validateEmails({
  emails: ["user@example.com", "typo@exmaple.com"], // at most 50 per call
});

for (const result of batch.results) {
  // Branch on `verdict`, never on the flags: `is_personal` (Gmail, Outlook) and
  // `is_role_address` (`support@`) describe ordinary, deliverable addresses.
  console.log(result.email, result.verdict);
}
```

The 50-address ceiling is a latency bound, not a payload one: every distinct
domain in the batch costs a DNS round trip. To check a whole list, start the
background run instead — one call, then poll:

```ts
const run = await sendly.lists.startValidationRun(list.id);

const progress = await sendly.validation.getRun(run.id);
// Finished when `status` is "completed" or "failed" — never when a percentage
// reaches 100, because there is deliberately no total to divide by: a list
// changes size while a run walks it.
console.log(progress.status, progress.processed_count, progress.undeliverable_count);

for await (const result of sendly.validation.listResultsAll(run.id, { verdict: "undeliverable" })) {
  console.log(result.email, result.contact_id, result.reasons);
}
```

A verdict of `unknown` is deliberately a separate value from `undeliverable`: it
means DNS did not answer in time, so that address was **not checked**. Deleting a
contact on `unknown` deletes a live one over a network hiccup. `undeliverable` is
the page to read before acting on a run; `unknown` is the one never to act on.

### Diagnose deliverability

```ts
const diagnosis = await sendly.deliverability.diagnose({
  domain: "mail.your-domain.com", // required — this endpoint answers about one domain
  address: "user@example.com", // optional RECIPIENT to check alongside it
  window_days: 7,
});

// `findings` is worst first, and an empty array means nothing here explains a
// delivery problem. Branch on a finding's `code`, never on its prose.
for (const finding of diagnosis.findings) {
  console.log(finding.severity, finding.code);
}
```

Nothing there is looked up live: the DNS statuses are the verification refresh
job's cached results, and `identity.last_checked_at` says when they were filled.
`recent_delivery` is project-wide rather than per-domain — its own `scope` field
says so — because an email row records no sending domain.

`listDomainStats` is the axis `diagnose` cannot report: outcomes broken out by
**recipient** domain and UTC day. These are the domains you send **to** —
`gmail.com`, `outlook.com` — not the domains you send from, and they are how you
catch one provider refusing nearly everything while the rest of your mail is
healthy.

```ts
for await (const row of sendly.deliverability.listDomainStatsAll({ limit: 100 })) {
  console.log(row.day, row.domain, row.delivered, row.bounced, row.computed_at);
}
```

The counts come from an hourly rollup over a rolling 30-day window, not from a
query run on request; each row's `computed_at` says when it was last rebuilt. No
rate is published, because a rate over three sends is not information.

`listDmarcReports` returns the DMARC aggregate (RUA) reports receiving providers
have sent about your domains. **An empty list is the correct answer, not a bug**,
until a policy domain is registered in this project and its DMARC record names an
address we receive — and receivers send on their own schedule, typically once a
day.

```ts
const reports = await sendly.deliverability.listDmarcReports({ limit: 20 });

// Which kind of empty is this? `false` means no intake mailbox exists, so no
// report can ever arrive — the feature is off, your domains are not "clean".
if (!reports.intake_configured) {
  console.warn("DMARC report intake is not configured on this deployment");
}

for (const report of reports.data) {
  console.log(report.org_name, report.policy_domain, report.pass_count, report.fail_count);
}
```

`intake_configured` exists because the two empty lists are otherwise
indistinguishable, and reporting "no DMARC failures" off a feature that was
never switched on is the worse of the two mistakes. Read the flag before you
tell anyone the domains are healthy.

`pass_count` counts DMARC **alignment** taken from `policy_evaluated`, not raw
authentication results — a message can pass SPF for a domain that is not the one
in its From header, which is exactly the case DMARC exists to catch.

### Subscribe a webhook

```ts
const created = await sendly.webhooks.create({
  url: "https://your-app.com/webhooks/sendly",
  eventTypes: ["email.delivered", "email.bounced", "email.complained"],
});
// store `created.data.secret` securely — used to verify HMAC signatures.
// The endpoint is beside it rather than spread around it: `created.data.webhook.id`.
```

A webhook record carries `domains` — the sending domains this endpoint is scoped
to, where an empty array means every domain on the project — and, while a
rotation is in flight, `previousSecretExpiresAt`. A record never carries a
secret or any fragment of one.

On v1 the same registration resolves the secret beside the webhook, and adds
rotation:

```ts
const { webhook, secret } = await sendly.webhooks.createV1({
  url: "https://your-app.com/webhooks/sendly",
  event_types: ["email.delivered", "email.bounced"],
});

const rotated = await sendly.webhooks.rotateSecretV1(webhook.id);
console.log(rotated.secret, rotated.previous_secret_expires_at);
```

`createV1` and `rotateSecretV1` are the only two responses that ever carry a
signing secret; no read endpoint hands it back, so a secret you lose is replaced
by rotating rather than recovered. The outgoing secret is not cut off at once —
it keeps verifying until `previous_secret_expires_at`, and every delivery inside
that window carries **both** signatures, so a verifier can be redeployed without
dropping an event.

### Add to the suppression list

```ts
await sendly.suppression.add({ email: "angry@example.com", reason: "MANUAL" });

// Alone among the legacy reads, this one answers no `{ success, data }`
// envelope — the page IS the body.
const page = await sendly.suppression.list({ reason: "MANUAL", limit: 100 });
for (const record of page.items) {
  console.log(record.email, record.reason, record.scope);
}
```

`scope` is `PROJECT` on every record this API creates or returns today; `GLOBAL`
is reserved for a platform-wide block recorded outside your project.

The v1 half addresses a record by the **address itself** and answers definitively
either way — `200` means suppressed and says why, `404 resource_not_found` means
it is not on the list. That is the difference from the legacy `suppression.get`,
which answers `200 { suppressed: false }` for an address nobody suppressed:

```ts
import { SendlyNotFoundError } from "sendly-sdk";

try {
  const record = await sendly.suppression.getV1("angry@example.com");
  console.log("suppressed:", record.reason, record.source);
} catch (err) {
  if (err instanceof SendlyNotFoundError) {
    // not suppressed — mail may flow
  } else throw err;
}
```

Suppressing is idempotent and the first `reason` wins: an already-suppressed
address answers with the existing record, so a later manual entry cannot
overwrite what an SES bounce recorded. `source` is not accepted in the body — it
is derived from the credential, so a record's provenance cannot be dressed up as
a deliverability fact.

`deleteV1` is the one call on this surface that can put mail back into an inbox
that asked you to stop, and it does **not** clear AWS SES's own account-level
suppression list: an address SES suppressed after a hard bounce stays
undeliverable through SES even once this record is gone.

### Track a custom event

Records a custom event against a contact. The legacy `events.track` works with
both `sk_*` and `pk_*` keys (reserved system event names are rejected) and
carries its payload in `data`:

```ts
const tracked = await sendly.events.track({
  event: "purchase.completed",
  email: "user@example.com",
  data: { plan: "pro", amount: 4900 },
});
console.log(tracked.contact, tracked.event);
```

`events.record` is the same capability on `/api/v1/events`, and its payload field
is called `payload`:

```ts
const event = await sendly.events.record({
  name: "purchase.completed",
  contact_id: contact.id, // must already exist — this endpoint never creates contacts
  payload: { plan: "pro", amount: 4900 },
});
```

New integrations should prefer `record`, which also unlocks `events.list`,
`events.listNames` and `events.stats`.

### Verify an email address

```ts
const check = await sendly.verify.email({ email: "user@example.com" });
if (!check.valid) {
  console.log("rejecting", check.reason);
}
```

This is the free single-address syntax/MX check. It is not
`validation.validateEmails`, which is the billed batch check with a verdict
vocabulary behind it.

## The `/api/v1` surface

Campaigns, segments, workflows, analytics, usage, topics, validation,
deliverability and events live on Sendly's versioned API, as does the `V1` half
of contacts, lists, templates, domains, webhooks and suppression. They hang off
the same client and the same base URL, but they speak a different dialect from
the `/api/*` resources above:

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

### Both dialects, one client

Six resources — contacts, lists, templates, domains, webhooks and suppression —
now answer on both surfaces, so their v1 methods carry a `V1` suffix:
`contacts.list` is the legacy one, `contacts.listV1` the versioned one.

The suffix is not decoration. The two methods answer the same question with
different envelopes, different field cases and different error bodies, and a call
site that mixes them up reads a `data` that is not there:

```ts
const legacy = await sendly.contacts.list({ limit: 20 });
legacy.data.data; // Contact[] — inside the `{ success, data }` envelope
legacy.data.nextCursor; // camelCase

const v1 = await sendly.contacts.listV1({ limit: 20 });
v1.data; // ContactV1[] — the bare body IS the list envelope
v1.next_cursor; // snake_case
```

Legacy methods keep working and nothing about them changed in 1.1. New code
should reach for the `V1` ones: they are the surface the contract is versioned
against, and they carry `request_id` on every failure.

### Pagination

Every v1 list takes `limit` (1–100, default 20) and `after` (an opaque cursor
from the previous response's `next_cursor`). Page manually, or let the SDK do it —
each list has a companion `*All` async generator that walks the pages and yields
individual items:

```ts
// Manual: stop when has_more goes false.
let page = await sendly.campaigns.list({ limit: 50 });
while (page.has_more && page.next_cursor) {
  page = await sendly.campaigns.list({ limit: 50, after: page.next_cursor });
}

// Automatic:
for await (const campaign of sendly.campaigns.listAll({ limit: 50 })) {
  console.log(campaign.id, campaign.status);
}
```

The seventeen companions: `campaigns.listAll`, `campaigns.listFailuresAll`,
`contacts.listAllV1`, `deliverability.listDmarcReportsAll`,
`deliverability.listDomainStatsAll`, `domains.listAllV1`, `events.listAll`,
`lists.listAllV1`, `segments.listAll`, `segments.listContactsAll`,
`suppression.listAllV1`, `templates.listAllV1`, `topics.listAll`,
`validation.listResultsAll`, `webhooks.listAllV1`, `workflows.listAll` and
`workflows.listExecutionsAll`.

Through 1.0 there were two dialects: `topics.list` and
`validation.listResults` took `cursor` and answered `cursor` where every other
v1 list took `after`. The platform collapsed that for 1.1, so there is one shape
to learn and one to write. If you were driving either of those two by hand, pass
`after` and read `next_cursor`.

Keep the filter and sort arguments **fixed for the whole walk** — the cursor
encodes them, and changing them mid-pagination is answered with
`422 validation_error` telling you to restart from the first page. There is
deliberately no total count. The one exception is `campaigns.listFailures`, which
also carries `total`, because `retryFailed` acts on that number and `has_more`
alone cannot tell you whether 3 or 30,000 sends failed.

### Campaigns: who did not get it, and re-driving them

`stats` says how many sends failed; only `listFailures` says who.

```ts
const failures = await sendly.campaigns.listFailures(campaign.id, { limit: 100 });
console.log(failures.total, "recipients did not receive it");

for await (const failure of sendly.campaigns.listFailuresAll(campaign.id)) {
  console.log(failure.email, failure.reason, failure.failed_at);
}

const retry = await sendly.campaigns.retryFailed(campaign.id);
console.log("re-queued", retry.queued);
```

`reason` comes from a fixed vocabulary rather than the underlying error text, so
it is stable enough to branch on; it is `null` on rows recorded before reasons
were captured.

`retryFailed` re-drives **only** the recipients whose send failed — nobody who
already received the campaign is mailed a second time, because each ledger row is
claimed before it is touched and a row whose email exists already is re-queued
rather than re-sent. The walk runs in the background, so the call resolves as
soon as it is queued, reporting how many failed rows it was started for. Only a
`SENT` campaign qualifies; a retry already running answers `409 conflict`.

### Workflows: the graph, and the lifecycle

`getGraph` returns every step — including the `TRIGGER` entry node — plus the
directed transitions between them, and that body is accepted verbatim by
`replaceGraph`:

```ts
const graph = await sendly.workflows.getGraph(workflow.id);
graph.steps[0].config; // stored exactly as authored, camelCase keys and all

const updated = await sendly.workflows.replaceGraph(workflow.id, {
  steps: graph.steps,
  transitions: graph.transitions,
});
```

`replaceGraph` is a **PUT**, and that is the point: a graph is nodes _plus_ the
edges between them, so a partial edit to a step list has no meaning without the
transitions that reference it — half-applied, it would leave steps pointing at
steps that no longer exist. Ids decide the outcome per step: one you send is
updated in place, a fresh uuid creates a step, and an id you omit deletes that
step _and its run history_. Exactly one step must be a `TRIGGER`, every
transition must name steps in the same document, and no step may point at itself.
It is refused with `409 conflict` while the workflow has running executions —
those runs are standing on the steps being replaced.

`clone` copies a workflow and its whole graph. The copy is **always created
disabled**, whatever the original was: a clone exists to be reviewed, and one
that started live would match the same trigger events as its original from the
moment it appeared.

```ts
const copy = await sendly.workflows.clone(workflow.id, { name: "Welcome (v2 test)" });
```

`pause` and `resume` are deliberately asymmetric:

```ts
const paused = await sendly.workflows.pause(workflow.id);
console.log("cancelled", paused.cancelled_executions, "in-flight runs");

const resumed = await sendly.workflows.resume(workflow.id);
console.log(resumed.cancelled_executions); // always 0
```

**Pausing cancels every `RUNNING`/`WAITING` execution** and reports how many —
that is what separates it from `update(id, { enabled: false })`, which only stops
new runs starting and leaves every in-flight contact walking the graph, next
delay still expiring, next email still sending. **Resuming re-opens the workflow
to new runs and does not restore the cancelled ones.** The cancellation is
terminal; there is no undo, so pause when you mean to stop the sends already in
flight and disable when you only mean to close the door. `resume` is refused with
`422 validation_error` while any step is still unconfigured.

### Events: `track` vs `record`

`events.track` is the legacy `POST /api/track` endpoint and is unchanged — its
payload field is still `data`. `events.record` is the same capability on
`/api/v1/events`, named differently only because `track` was taken, and its
payload field is `payload`. New integrations should prefer `record`, which also
unlocks `events.list`, `events.listNames`, and `events.stats`.

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

Mailbox **lifecycle** is what stays out of reach — not the mailbox resource as a
whole. The three reads (`mailboxes.list`, `mailboxes.get`,
`mailboxes.listAppPasswords`) have a conditional membership check, and
`mailboxes.sendMessage` / `mailboxes.draftMessage` publish `ApiKeyAuth` outright,
so a key really can call all five.

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

Note that `404 resource_not_found` is an ordinary answer from
`suppression.getV1`, not a failure: it is how that route says "this address is
not suppressed". Catch it rather than logging it.

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

Nothing added in 1.1 takes a key. The v1 creates (`contacts.createV1`,
`lists.createV1`, `templates.createV1`, `domains.createV1`,
`webhooks.createV1`, `suppression.createV1`, `topics.create`,
`snippets.create`) are all either naturally idempotent on their own key or cheap
to repeat, and `campaigns.retryFailed` is guarded by a `409` on a retry already
running rather than by a replay ledger.

Two v1 writes deliberately take no key for reasons of their own. `events.record`
is append-only and high-volume. `emails.sendTest` reaches only the caller's own
inbox, a daily cap already bounds it, and "send me another one" is the normal
second call rather than a mistake worth deduplicating.

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
