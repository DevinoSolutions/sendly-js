import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";

import type { Sendly } from "../client";
import type { CreateCampaignV1Request, CreateContactRequest, SendEmailRequest, SendEmailV1Request } from "../types";
import { getCallBody, jsonResponse, makeClient } from "./helpers";

/**
 * Contract enforcement: the SDK surface must match the committed OpenAPI spec.
 *
 * The spec (../../openapi.json) is loaded from disk — deterministic, never
 * fetched — so this suite pins the SDK to whatever contract is committed.
 * Refresh the committed spec with `pnpm sync-spec`; CI separately warns (non-
 * blocking) when the committed copy drifts from the live API.
 *
 * Coverage is asserted in both directions and fails closed:
 *   - every spec operation is either mapped to an SDK method or explicitly
 *     listed in NOT_YET_IMPLEMENTED (a gap) or NOT_SDK_CALLABLE (an operation
 *     an API key cannot reach at all);
 *   - every SDK method targets a path+verb that exists in the spec.
 */

// ---------------------------------------------------------------------------
// Minimal OpenAPI shapes (only the fields this suite reads).
// ---------------------------------------------------------------------------

interface JsonSchema {
  $ref?: string;
  required?: string[];
  properties?: Record<string, unknown>;
}

interface OpenApiOperation {
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }>;
  /** "Any of" — the credentials this operation accepts. */
  security?: Array<Record<string, string[]>>;
}

interface OpenApiSpec {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

const SPEC_PATH = fileURLToPath(new URL("../../openapi.json", import.meta.url));
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiSpec;

// ---------------------------------------------------------------------------
// Spec operations the SDK does not implement, in two kinds — because "we have
// not got to it" and "this can never work" are different facts, and collapsing
// them means the second one nags forever as if it were the first.
//
// Both are fail-closed: an entry must name a real spec operation, and must not
// actually be implemented, so neither list can rot into a blanket exemption.
// ---------------------------------------------------------------------------

/**
 * NOT YET — a genuine gap: key-callable operations the contract publishes that no
 * resource method wraps yet. Empty since T-15370, which wrapped the 67 that the
 * re-sync from the released contract (docs.sendly.now/openapi.json) surfaced when the
 * spec grew from 106 to 198 paths. A new gap is added here with its operation, needs a
 * method (and a manifest entry) before it leaves; the test below fails if one is
 * implemented but left here.
 */
export const NOT_YET_IMPLEMENTED: readonly string[] = [];

/**
 * Other providers' wire formats, served so that a Resend, SendGrid, Postmark,
 * Mailgun or Plunk client can switch to Sendly by changing its base URL. They
 * are called by THAT provider's SDK, in that provider's shape, so a method here
 * would be a second, foreign-shaped `emails.send`. Matched by path rather than
 * listed, so a new dialect needs no edit, and the suite checks the SDK
 * implements none of them.
 */
const isCompatDialect = (op: string): boolean => op.split(" ")[1]?.startsWith("/api/compat/") ?? false;

/**
 * NEVER, by construction — the credential this SDK uses cannot call these.
 *
 * Each resolves the acting user (usually a project admin) from the session, and
 * an API-key context carries no user, so the route answers 401
 * `NOT_AUTHENTICATED` before reading a scope. This SDK authenticates only with
 * `sk_`/`pk_` keys. Shipping methods for these would publish capabilities the
 * credential cannot use — the same defect, one layer out, as an operation that
 * advertises a credential its route refuses.
 *
 * NOT a maintenance burden and not a hand-maintained opinion: the contract now
 * states this in machine-readable form. These operations publish `SessionAuth`
 * and `OAuth2` but NOT `ApiKeyAuth`, and the test below checks each entry
 * against that, in both directions. If one ever becomes key-callable, the spec
 * gains `ApiKeyAuth` and the suite tells you to come build the method.
 */
export const NOT_SDK_CALLABLE: readonly string[] = [
  // Mailbox writes. The three mailbox READS are implemented — their membership
  // check is conditional, so a key really can call them.
  "POST /api/mailboxes",
  "DELETE /api/mailboxes/{id}",
  "POST /api/mailboxes/{id}/app-passwords",
  "DELETE /api/mailboxes/{id}/app-passwords/{passwordId}",

  // Every api-key operation, reads included: all four guard unconditionally.
  // An API key cannot mint, rotate, list or revoke an API key.
  "GET /api/projects/{id}/api-keys",
  "POST /api/projects/{id}/api-keys",
  "DELETE /api/projects/{id}/api-keys/{keyId}",
  "POST /api/projects/{id}/api-keys/{keyId}/rotate",

  // A project is created FOR a user, and listed for one; there is nothing for a
  // key to act as.
  "GET /api/users/me/projects",
  "POST /api/users/me/projects",

  // Session/OAuth-only operations added to the contract since the last vendoring
  // (account, dashboard and member management). None publishes ApiKeyAuth; the
  // teeth test below checks each against that.
  "DELETE /api/integrations/slack/installation",
  "DELETE /api/projects/{id}/members/{userId}",
  "DELETE /api/users/me",
  "DELETE /api/users/me/connected-apps/{clientId}",
  "DELETE /api/users/me/projects/{id}",
  "GET /api/integrations/slack/installation",
  "GET /api/mailboxes/{id}/project",
  "GET /api/orgs",
  "GET /api/orgs/{id}/inbox/conversations",
  "GET /api/orgs/{id}/inbox/counts",
  "GET /api/orgs/{id}/inbox/mailboxes",
  "GET /api/orgs/{id}/mailboxes",
  "GET /api/orgs/{id}/overview",
  "GET /api/projects/{id}/api-keys/{keyId}",
  "GET /api/projects/{id}/appeals",
  "GET /api/projects/{id}/members",
  "GET /api/users/me",
  "GET /api/users/me/brand-logos",
  "GET /api/users/me/connected-apps",
  "GET /api/users/me/exports",
  "GET /api/users/me/exports/{exportId}/download",
  "GET /api/users/me/notification-preferences",
  "GET /api/users/me/pro-entitlement",
  "GET /api/users/me/projects/{id}/api-requests",
  "GET /api/users/me/projects/{id}/api-usage",
  "GET /api/users/me/projects/{id}/billing-consumption",
  "GET /api/users/me/projects/{id}/billing-invoices",
  "GET /api/users/me/projects/{id}/billing-limits",
  "GET /api/users/me/referral",
  "PATCH /api/integrations/slack/installation",
  "PATCH /api/projects/{id}/members/{userId}",
  "PATCH /api/users/me",
  "PATCH /api/users/me/connected-apps/{clientId}",
  "PATCH /api/users/me/projects/{id}",
  "POST /api/orgs/{id}/refresh",
  "POST /api/projects/{id}/appeals",
  "POST /api/projects/{id}/members",
  "POST /api/users/me/exports",
  "POST /api/users/me/projects/{id}/billing-portal",
  "POST /api/users/me/projects/{id}/checkout",
  "POST /api/users/me/projects/{id}/reset",
  "POST /api/v1/billing/subscription",
  "PUT /api/users/me/active-project",
  "PUT /api/users/me/notification-preferences",
  "PUT /api/users/me/projects/{id}/billing-limits",
];

// ---------------------------------------------------------------------------
// Invocation manifest: how to exercise each SDK method with minimal valid
// (type-checked) arguments. Invoking captures the real verb + path template
// the client emits, so the mapping reflects the actual client code — not a
// hand-maintained duplicate of it. Path params use sentinels normalized back
// to the spec's `{id}` / `{email}` placeholders.
// ---------------------------------------------------------------------------

const ID = "__ID__";
const EMAIL = "__EMAIL__";
const EXECUTION_ID = "__EXECUTION_ID__";
const CONVERSATION_ID = "__CONVERSATION_ID__";
const ATTACHMENT_ID = "__ATTACHMENT_ID__";
const FIELD = "__FIELD__";
const EVENT_NAME = "__EVENT_NAME__";
const CONTACT_ID = "__CONTACT_ID__";
const STEP_ID = "__STEP_ID__";
const TRANSITION_ID = "__TRANSITION_ID__";
const GOAL_ID = "__GOAL_ID__";
const CALL_ID = "__CALL_ID__";
/** A workflow execution addressed under its workflow (`{executionId}`), unlike the v1 `{execution_id}`. */
const RUN_ID = "__RUN_ID__";
/** A saved version number; a number cannot carry a sentinel string, so it is a value no real version uses. */
const VERSION = 4242;

interface ManifestEntry {
  /** "<resource>.<method>" */
  key: string;
  invoke: (client: Sendly) => Promise<unknown>;
  /**
   * The answer to the first request, when the shared fixture is not a shape the
   * method can read on (a generator that walks a legacy `{ items, nextCursor }`
   * page). Only the request it emits is captured either way.
   */
  response?: unknown;
}

const MANIFEST: readonly ManifestEntry[] = [
  // emails
  { key: "emails.send", invoke: (c) => c.emails.send({ to: "user@example.com" }) },
  { key: "emails.sendLegacy", invoke: (c) => c.emails.sendLegacy({ to: "user@example.com" }) },
  { key: "emails.sendTest", invoke: (c) => c.emails.sendTest({ subject: "s", body: "b" }) },
  { key: "emails.batch", invoke: (c) => c.emails.batch({ emails: [{ to: "user@example.com" }] }) },
  { key: "emails.list", invoke: (c) => c.emails.list() },
  { key: "emails.get", invoke: (c) => c.emails.get(ID) },
  { key: "emails.cancelSchedule", invoke: (c) => c.emails.cancelSchedule(ID) },
  // contacts
  { key: "contacts.create", invoke: (c) => c.contacts.create({ email: "user@example.com", subscribed: true }) },
  { key: "contacts.upsert", invoke: (c) => c.contacts.upsert({ email: "user@example.com", subscribed: true }) },
  {
    key: "contacts.bulkCreate",
    invoke: (c) => c.contacts.bulkCreate({ contacts: [{ email: "user@example.com", subscribed: true }] }),
  },
  { key: "contacts.bulkDelete", invoke: (c) => c.contacts.bulkDelete({ ids: [ID] }) },
  { key: "contacts.list", invoke: (c) => c.contacts.list() },
  { key: "contacts.get", invoke: (c) => c.contacts.get(ID) },
  { key: "contacts.update", invoke: (c) => c.contacts.update(ID, {}) },
  { key: "contacts.delete", invoke: (c) => c.contacts.delete(ID) },
  // domains
  { key: "domains.create", invoke: (c) => c.domains.create({ domain: "mail.example.com" }) },
  { key: "domains.list", invoke: (c) => c.domains.list() },
  { key: "domains.get", invoke: (c) => c.domains.get(ID) },
  { key: "domains.verify", invoke: (c) => c.domains.verify(ID) },
  { key: "domains.getVerification", invoke: (c) => c.domains.getVerification(ID) },
  { key: "domains.startSetup", invoke: (c) => c.domains.startSetup(ID) },
  { key: "domains.delete", invoke: (c) => c.domains.delete(ID) },
  // mailboxes (reads only — the writes are in NOT_SDK_CALLABLE)
  { key: "mailboxes.list", invoke: (c) => c.mailboxes.list() },
  { key: "mailboxes.get", invoke: (c) => c.mailboxes.get(ID) },
  { key: "mailboxes.listAppPasswords", invoke: (c) => c.mailboxes.listAppPasswords(ID) },
  { key: "mailboxes.listConversations", invoke: (c) => c.mailboxes.listConversations(ID) },
  {
    key: "mailboxes.listAllConversations",
    invoke: (c) => c.mailboxes.listAllConversations(ID).next(),
    response: { success: true, data: { items: [], nextCursor: null } },
  },
  { key: "mailboxes.getConversation", invoke: (c) => c.mailboxes.getConversation(ID, CONVERSATION_ID) },
  {
    key: "mailboxes.replyToConversation",
    invoke: (c) => c.mailboxes.replyToConversation(ID, CONVERSATION_ID, { body: "Thanks!" }),
  },
  { key: "mailboxes.downloadAttachment", invoke: (c) => c.mailboxes.downloadAttachment(ID, ATTACHMENT_ID) },
  // projects (v1)
  { key: "projects.get", invoke: (c) => c.projects.get() },
  // templates
  {
    key: "templates.create",
    invoke: (c) =>
      c.templates.create({
        name: "n",
        subject: "s",
        body: "b",
        from: "sender@example.com",
        emailCategory: "TRANSACTIONAL",
      }),
  },
  { key: "templates.list", invoke: (c) => c.templates.list() },
  { key: "templates.get", invoke: (c) => c.templates.get(ID) },
  { key: "templates.update", invoke: (c) => c.templates.update(ID, {}) },
  { key: "templates.delete", invoke: (c) => c.templates.delete(ID) },
  // webhooks
  {
    key: "webhooks.create",
    invoke: (c) => c.webhooks.create({ url: "https://example.com/hook", eventTypes: ["email.delivered"] }),
  },
  { key: "webhooks.list", invoke: (c) => c.webhooks.list() },
  { key: "webhooks.get", invoke: (c) => c.webhooks.get(ID) },
  { key: "webhooks.update", invoke: (c) => c.webhooks.update(ID, {}) },
  { key: "webhooks.delete", invoke: (c) => c.webhooks.delete(ID) },
  { key: "webhooks.rotateSecret", invoke: (c) => c.webhooks.rotateSecret(ID) },
  { key: "webhooks.listCalls", invoke: (c) => c.webhooks.listCalls(ID) },
  // suppression
  { key: "suppression.add", invoke: (c) => c.suppression.add({ email: "user@example.com", reason: "MANUAL" }) },
  { key: "suppression.list", invoke: (c) => c.suppression.list() },
  { key: "suppression.get", invoke: (c) => c.suppression.get(EMAIL) },
  { key: "suppression.remove", invoke: (c) => c.suppression.remove(EMAIL) },
  // events (legacy)
  { key: "events.track", invoke: (c) => c.events.track({ event: "signup", email: "user@example.com" }) },
  // verify
  { key: "verify.email", invoke: (c) => c.verify.email({ email: "user@example.com" }) },
  // lists
  { key: "lists.subscribe", invoke: (c) => c.lists.subscribe(ID, { email: "user@example.com" }) },
  { key: "lists.unsubscribe", invoke: (c) => c.lists.unsubscribe(ID, { email: "user@example.com" }) },

  // --- /api/v1 ---
  // campaigns
  { key: "campaigns.list", invoke: (c) => c.campaigns.list() },
  { key: "campaigns.listAll", invoke: (c) => c.campaigns.listAll().next() },
  {
    key: "campaigns.create",
    invoke: (c) =>
      c.campaigns.create({ name: "n", subject: "s", body: "b", from: "sender@example.com", audience_type: "ALL" }),
  },
  { key: "campaigns.get", invoke: (c) => c.campaigns.get(ID) },
  { key: "campaigns.update", invoke: (c) => c.campaigns.update(ID, {}) },
  { key: "campaigns.delete", invoke: (c) => c.campaigns.delete(ID) },
  { key: "campaigns.send", invoke: (c) => c.campaigns.send(ID) },
  { key: "campaigns.cancel", invoke: (c) => c.campaigns.cancel(ID) },
  { key: "campaigns.pause", invoke: (c) => c.campaigns.pause(ID) },
  { key: "campaigns.resume", invoke: (c) => c.campaigns.resume(ID) },
  { key: "campaigns.stats", invoke: (c) => c.campaigns.stats(ID) },
  // segments
  { key: "segments.list", invoke: (c) => c.segments.list() },
  { key: "segments.listAll", invoke: (c) => c.segments.listAll().next() },
  { key: "segments.create", invoke: (c) => c.segments.create({ name: "n" }) },
  { key: "segments.get", invoke: (c) => c.segments.get(ID) },
  { key: "segments.update", invoke: (c) => c.segments.update(ID, {}) },
  { key: "segments.delete", invoke: (c) => c.segments.delete(ID) },
  { key: "segments.listContacts", invoke: (c) => c.segments.listContacts(ID) },
  { key: "segments.listContactsAll", invoke: (c) => c.segments.listContactsAll(ID).next() },
  // workflows
  { key: "workflows.list", invoke: (c) => c.workflows.list() },
  { key: "workflows.listAll", invoke: (c) => c.workflows.listAll().next() },
  { key: "workflows.create", invoke: (c) => c.workflows.create({ name: "n", event_name: "user.signup" }) },
  { key: "workflows.get", invoke: (c) => c.workflows.get(ID) },
  { key: "workflows.update", invoke: (c) => c.workflows.update(ID, {}) },
  { key: "workflows.delete", invoke: (c) => c.workflows.delete(ID) },
  { key: "workflows.listExecutions", invoke: (c) => c.workflows.listExecutions(ID) },
  { key: "workflows.listExecutionsAll", invoke: (c) => c.workflows.listExecutionsAll(ID).next() },
  { key: "workflows.startExecution", invoke: (c) => c.workflows.startExecution(ID, { contact_id: ID }) },
  { key: "workflows.cancelExecution", invoke: (c) => c.workflows.cancelExecution(EXECUTION_ID) },
  { key: "workflows.stats", invoke: (c) => c.workflows.stats(ID) },
  // analytics
  { key: "analytics.timeseries", invoke: (c) => c.analytics.timeseries() },
  { key: "analytics.campaigns", invoke: (c) => c.analytics.campaigns() },
  { key: "analytics.topCampaigns", invoke: (c) => c.analytics.topCampaigns() },
  // usage
  { key: "usage.get", invoke: (c) => c.usage.get() },
  // events (v1)
  { key: "events.list", invoke: (c) => c.events.list() },
  { key: "events.listAll", invoke: (c) => c.events.listAll().next() },
  { key: "events.record", invoke: (c) => c.events.record({ name: "user.signup" }) },
  { key: "events.listNames", invoke: (c) => c.events.listNames() },
  { key: "events.stats", invoke: (c) => c.events.stats() },

  // --- 1.1: the six resources that had a legacy half and no v1 one ---
  //
  // Both dialects stay reachable, so the v1 methods carry a `V1` suffix rather
  // than taking the plain name. The two answer the same question with different
  // envelopes, field cases and error bodies, and a call site that mixes them up
  // reads a `data` that is not there.
  // contacts (v1)
  { key: "contacts.listV1", invoke: (c) => c.contacts.listV1() },
  { key: "contacts.listAllV1", invoke: (c) => c.contacts.listAllV1().next() },
  { key: "contacts.createV1", invoke: (c) => c.contacts.createV1({ email: "user@example.com" }) },
  { key: "contacts.getV1", invoke: (c) => c.contacts.getV1(ID) },
  { key: "contacts.updateV1", invoke: (c) => c.contacts.updateV1(ID, {}) },
  { key: "contacts.deleteV1", invoke: (c) => c.contacts.deleteV1(ID) },
  { key: "contacts.topicPreferences", invoke: (c) => c.contacts.topicPreferences(ID) },
  // lists (v1)
  { key: "lists.listV1", invoke: (c) => c.lists.listV1() },
  { key: "lists.listAllV1", invoke: (c) => c.lists.listAllV1().next() },
  { key: "lists.createV1", invoke: (c) => c.lists.createV1({ name: "Weekly" }) },
  { key: "lists.getV1", invoke: (c) => c.lists.getV1(ID) },
  { key: "lists.updateV1", invoke: (c) => c.lists.updateV1(ID, {}) },
  { key: "lists.deleteV1", invoke: (c) => c.lists.deleteV1(ID) },
  { key: "lists.startValidationRun", invoke: (c) => c.lists.startValidationRun(ID) },
  // templates (v1)
  { key: "templates.listV1", invoke: (c) => c.templates.listV1() },
  { key: "templates.listAllV1", invoke: (c) => c.templates.listAllV1().next() },
  {
    key: "templates.createV1",
    invoke: (c) => c.templates.createV1({ name: "n", subject: "s", body: "b", from: "sender@example.com" }),
  },
  { key: "templates.getV1", invoke: (c) => c.templates.getV1(ID) },
  { key: "templates.updateV1", invoke: (c) => c.templates.updateV1(ID, {}) },
  { key: "templates.deleteV1", invoke: (c) => c.templates.deleteV1(ID) },
  // domains (v1, plus the one legacy write that was never wrapped)
  { key: "domains.listV1", invoke: (c) => c.domains.listV1() },
  { key: "domains.listAllV1", invoke: (c) => c.domains.listAllV1().next() },
  { key: "domains.createV1", invoke: (c) => c.domains.createV1({ domain: "mail.example.com" }) },
  { key: "domains.getV1", invoke: (c) => c.domains.getV1(ID) },
  { key: "domains.verifyV1", invoke: (c) => c.domains.verifyV1(ID) },
  { key: "domains.deleteV1", invoke: (c) => c.domains.deleteV1(ID) },
  { key: "domains.getLogoV1", invoke: (c) => c.domains.getLogoV1(ID) },
  { key: "domains.uploadLogoV1", invoke: (c) => c.domains.uploadLogoV1(ID, { svg: "<svg/>" }) },
  { key: "domains.deleteLogoV1", invoke: (c) => c.domains.deleteLogoV1(ID) },
  { key: "domains.getLogoReadinessV1", invoke: (c) => c.domains.getLogoReadinessV1(ID) },
  { key: "domains.assignStream", invoke: (c) => c.domains.assignStream(ID, {}) },
  // webhooks (v1)
  { key: "webhooks.listV1", invoke: (c) => c.webhooks.listV1() },
  { key: "webhooks.listAllV1", invoke: (c) => c.webhooks.listAllV1().next() },
  {
    key: "webhooks.createV1",
    invoke: (c) => c.webhooks.createV1({ url: "https://example.com/hook", event_types: ["email.delivered"] }),
  },
  { key: "webhooks.getV1", invoke: (c) => c.webhooks.getV1(ID) },
  { key: "webhooks.updateV1", invoke: (c) => c.webhooks.updateV1(ID, {}) },
  { key: "webhooks.deleteV1", invoke: (c) => c.webhooks.deleteV1(ID) },
  { key: "webhooks.rotateSecretV1", invoke: (c) => c.webhooks.rotateSecretV1(ID) },
  // suppressions (v1) — the path parameter is an address, not an id
  { key: "suppression.listV1", invoke: (c) => c.suppression.listV1() },
  { key: "suppression.listAllV1", invoke: (c) => c.suppression.listAllV1().next() },
  { key: "suppression.createV1", invoke: (c) => c.suppression.createV1({ email: "user@example.com" }) },
  { key: "suppression.getV1", invoke: (c) => c.suppression.getV1(EMAIL) },
  { key: "suppression.deleteV1", invoke: (c) => c.suppression.deleteV1(EMAIL) },

  // --- 1.1: resources that are new in their entirety ---
  // topics — the consent vocabulary a project mails against
  { key: "topics.list", invoke: (c) => c.topics.list() },
  { key: "topics.listAll", invoke: (c) => c.topics.listAll().next() },
  { key: "topics.create", invoke: (c) => c.topics.create({ key: "product-news", name: "Product news" }) },
  { key: "topics.get", invoke: (c) => c.topics.get(ID) },
  { key: "topics.update", invoke: (c) => c.topics.update(ID, {}) },
  {
    key: "topics.setSubscription",
    invoke: (c) => c.topics.setSubscription(ID, { contact_id: ID, subscribed: true }),
  },
  // snippets — legacy dialect, gated by the template scopes
  { key: "snippets.create", invoke: (c) => c.snippets.create({ name: "footer", body: "<p>bye</p>" }) },
  { key: "snippets.list", invoke: (c) => c.snippets.list() },
  { key: "snippets.get", invoke: (c) => c.snippets.get(ID) },
  { key: "snippets.update", invoke: (c) => c.snippets.update(ID, {}) },
  { key: "snippets.delete", invoke: (c) => c.snippets.delete(ID) },
  // validation — the one part of this SDK that spends money
  { key: "validation.validateEmails", invoke: (c) => c.validation.validateEmails({ emails: ["user@example.com"] }) },
  { key: "validation.getRun", invoke: (c) => c.validation.getRun(ID) },
  { key: "validation.listResults", invoke: (c) => c.validation.listResults(ID) },
  { key: "validation.listResultsAll", invoke: (c) => c.validation.listResultsAll(ID).next() },
  // deliverability
  { key: "deliverability.diagnose", invoke: (c) => c.deliverability.diagnose({ domain: "mail.example.com" }) },
  { key: "deliverability.listDomainStats", invoke: (c) => c.deliverability.listDomainStats() },
  { key: "deliverability.listDomainStatsAll", invoke: (c) => c.deliverability.listDomainStatsAll().next() },
  { key: "deliverability.listDmarcReports", invoke: (c) => c.deliverability.listDmarcReports() },
  { key: "deliverability.listDmarcReportsAll", invoke: (c) => c.deliverability.listDmarcReportsAll().next() },

  // --- 1.1: operations added to resources that already existed ---
  { key: "campaigns.listFailures", invoke: (c) => c.campaigns.listFailures(ID) },
  { key: "campaigns.listFailuresAll", invoke: (c) => c.campaigns.listFailuresAll(ID).next() },
  { key: "campaigns.retryFailed", invoke: (c) => c.campaigns.retryFailed(ID) },
  { key: "workflows.getGraph", invoke: (c) => c.workflows.getGraph(ID) },
  {
    key: "workflows.replaceGraph",
    invoke: (c) =>
      c.workflows.replaceGraph(ID, {
        steps: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Signed up",
            position: { x: 0, y: 0 },
            type: "TRIGGER",
            config: { eventName: "user.signup" },
          },
        ],
        transitions: [],
      }),
  },
  { key: "workflows.clone", invoke: (c) => c.workflows.clone(ID, {}) },
  { key: "workflows.pause", invoke: (c) => c.workflows.pause(ID) },
  { key: "workflows.resume", invoke: (c) => c.workflows.resume(ID) },
  {
    key: "mailboxes.sendMessage",
    invoke: (c) => c.mailboxes.sendMessage(ID, { to: ["user@example.com"], subject: "s", body: "b" }),
  },
  { key: "mailboxes.draftMessage", invoke: (c) => c.mailboxes.draftMessage(ID, { mode: "draft" }) },
  // --- T-15370: key-callable operations the contract published before the SDK wrapped them ---
  // contacts
  { key: "contacts.listFields", invoke: (c) => c.contacts.listFields() },
  { key: "contacts.deleteField", invoke: (c) => c.contacts.deleteField(FIELD) },
  { key: "contacts.getFieldUsage", invoke: (c) => c.contacts.getFieldUsage(FIELD) },
  { key: "contacts.listFieldValues", invoke: (c) => c.contacts.listFieldValues(FIELD) },
  { key: "contacts.exportLink", invoke: (c) => c.contacts.exportLink() },
  { key: "contacts.importCsv", invoke: (c) => c.contacts.importCsv("email\na@example.com\n") },
  { key: "contacts.lookup", invoke: (c) => c.contacts.lookup({ emails: ["user@example.com"] }) },
  { key: "contacts.queueBulkDelete", invoke: (c) => c.contacts.queueBulkDelete({ contactIds: [ID] }) },
  { key: "contacts.queueBulkPurge", invoke: (c) => c.contacts.queueBulkPurge({ contactIds: [ID] }) },
  { key: "contacts.queueBulkSubscribe", invoke: (c) => c.contacts.queueBulkSubscribe({ contactIds: [ID] }) },
  { key: "contacts.queueBulkUnsubscribe", invoke: (c) => c.contacts.queueBulkUnsubscribe({ contactIds: [ID] }) },
  { key: "contacts.purge", invoke: (c) => c.contacts.purge(ID) },
  // events
  { key: "events.delete", invoke: (c) => c.events.delete(EVENT_NAME) },
  { key: "events.getUsage", invoke: (c) => c.events.getUsage(EVENT_NAME) },
  { key: "events.listForContact", invoke: (c) => c.events.listForContact(CONTACT_ID) },
  // mailboxes
  {
    key: "inbox.listConversations",
    invoke: (c) => c.inbox.listConversations(),
    response: { success: true, data: { items: [], nextCursor: null } },
  },
  {
    key: "inbox.listAllConversations",
    invoke: (c) => c.inbox.listAllConversations().next(),
    response: { success: true, data: { items: [], nextCursor: null } },
  },
  {
    key: "mailboxes.getConversationContact",
    invoke: (c) => c.mailboxes.getConversationContact(ID, CONVERSATION_ID),
  },
  {
    key: "mailboxes.setConversationStatus",
    invoke: (c) => c.mailboxes.setConversationStatus(ID, CONVERSATION_ID, { status: "CLOSED" }),
  },
  {
    key: "mailboxes.setConversationSpam",
    invoke: (c) => c.mailboxes.setConversationSpam(ID, CONVERSATION_ID, { spam: true }),
  },
  { key: "mailboxes.deleteConversation", invoke: (c) => c.mailboxes.deleteConversation(ID, CONVERSATION_ID) },
  // segments
  { key: "segments.addMembers", invoke: (c) => c.segments.addMembers(ID, { emails: ["user@example.com"] }) },
  { key: "segments.removeMembers", invoke: (c) => c.segments.removeMembers(ID, { emails: ["user@example.com"] }) },
  { key: "segments.compute", invoke: (c) => c.segments.compute(ID) },
  { key: "segments.refresh", invoke: (c) => c.segments.refresh(ID) },
  // lists
  { key: "lists.listMembers", invoke: (c) => c.lists.listMembers(ID) },
  { key: "lists.listAllMembers", invoke: (c) => c.lists.listAllMembers(ID).next() },
  // analytics
  { key: "activity.list", invoke: (c) => c.activity.list() },
  { key: "activity.listAll", invoke: (c) => c.activity.listAll().next() },
  { key: "activity.recentCount", invoke: (c) => c.activity.recentCount() },
  { key: "activity.stats", invoke: (c) => c.activity.stats() },
  { key: "activity.upcoming", invoke: (c) => c.activity.upcoming() },
  { key: "analytics.topEvents", invoke: (c) => c.analytics.topEvents() },
  // projects
  { key: "auditLog.list", invoke: (c) => c.auditLog.list() },
  { key: "auditLog.listAll", invoke: (c) => c.auditLog.listAll().next() },
  { key: "projects.getSecurity", invoke: (c) => c.projects.getSecurity(ID) },
  { key: "projects.getSetupState", invoke: (c) => c.projects.getSetupState(ID) },
  // templates
  { key: "templates.duplicate", invoke: (c) => c.templates.duplicate(ID) },
  { key: "templates.getUsage", invoke: (c) => c.templates.getUsage(ID) },
  { key: "templates.listVersions", invoke: (c) => c.templates.listVersions(ID) },
  { key: "templates.revertVersion", invoke: (c) => c.templates.revertVersion(ID, VERSION) },
  { key: "uploads.image", invoke: (c) => c.uploads.image(new Blob(["x"], { type: "image/png" })) },
  // emails
  { key: "emails.reschedule", invoke: (c) => c.emails.reschedule(ID, { scheduledAt: null }) },
  // domains
  { key: "domains.getConnectStatus", invoke: (c) => c.domains.getConnectStatus(ID) },
  { key: "domains.reverifyConnection", invoke: (c) => c.domains.reverifyConnection(ID) },
  { key: "domains.getWarmup", invoke: (c) => c.domains.getWarmup(ID) },
  { key: "domains.manageWarmup", invoke: (c) => c.domains.manageWarmup(ID, { action: "restart" }) },
  // webhooks
  { key: "webhooks.test", invoke: (c) => c.webhooks.test(ID) },
  { key: "webhooks.replayFailed", invoke: (c) => c.webhooks.replayFailed(ID) },
  { key: "webhooks.retryCall", invoke: (c) => c.webhooks.retryCall(ID, CALL_ID) },
  // campaigns
  { key: "campaigns.duplicate", invoke: (c) => c.campaigns.duplicate(ID) },
  { key: "campaigns.sendTest", invoke: (c) => c.campaigns.sendTest(ID, { email: "user@example.com" }) },
  // workflows
  { key: "workflows.listFields", invoke: (c) => c.workflows.listFields() },
  {
    key: "workflows.addStep",
    invoke: (c) => c.workflows.addStep(ID, { type: "DELAY", name: "Wait", position: { x: 0, y: 0 }, config: {} }),
  },
  { key: "workflows.updateStep", invoke: (c) => c.workflows.updateStep(ID, STEP_ID, { name: "Renamed" }) },
  { key: "workflows.deleteStep", invoke: (c) => c.workflows.deleteStep(ID, STEP_ID) },
  {
    key: "workflows.createTransition",
    invoke: (c) => c.workflows.createTransition(ID, { fromStepId: STEP_ID, toStepId: STEP_ID }),
  },
  { key: "workflows.deleteTransition", invoke: (c) => c.workflows.deleteTransition(ID, TRANSITION_ID) },
  { key: "workflows.listConversionGoals", invoke: (c) => c.workflows.listConversionGoals(ID) },
  {
    key: "workflows.createConversionGoal",
    invoke: (c) => c.workflows.createConversionGoal(ID, { name: "Bought", eventType: "purchase" }),
  },
  { key: "workflows.deleteConversionGoal", invoke: (c) => c.workflows.deleteConversionGoal(ID, GOAL_ID) },
  { key: "workflows.getExecution", invoke: (c) => c.workflows.getExecution(ID, RUN_ID) },
  { key: "workflows.cancelAllExecutions", invoke: (c) => c.workflows.cancelAllExecutions(ID) },
  { key: "workflows.listVersions", invoke: (c) => c.workflows.listVersions(ID) },
  { key: "workflows.revertVersion", invoke: (c) => c.workflows.revertVersion(ID, VERSION) },
  // billing, connections, support (/api/v1)
  { key: "billing.get", invoke: (c) => c.billing.get() },
  { key: "billing.listPlans", invoke: (c) => c.billing.listPlans() },
  { key: "connections.list", invoke: (c) => c.connections.list() },
  { key: "connections.createLinks", invoke: (c) => c.connections.createLinks() },
  { key: "support.listTickets", invoke: (c) => c.support.listTickets() },
  { key: "support.createTicket", invoke: (c) => c.support.createTicket({ subject: "s", body: "b" }) },
];

const RESOURCE_NAMES = [
  "emails",
  "contacts",
  "domains",
  "templates",
  "webhooks",
  "suppression",
  "events",
  "verify",
  "lists",
  "mailboxes",
  "campaigns",
  "segments",
  "workflows",
  "analytics",
  "usage",
  "projects",
  "topics",
  "validation",
  "deliverability",
  "snippets",
  "activity",
  "auditLog",
  "inbox",
  "uploads",
  "billing",
  "connections",
  "support",
] as const;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Reflect the resource method names actually present on the client. */
function discoverMethods(client: Sendly): Set<string> {
  const found = new Set<string>();
  for (const name of RESOURCE_NAMES) {
    const proto = Object.getPrototypeOf(client[name]) as Record<string, unknown>;
    for (const member of Object.getOwnPropertyNames(proto)) {
      if (member === "constructor") continue;
      if (typeof proto[member] === "function") found.add(`${name}.${member}`);
    }
  }
  return found;
}

/** Strip base URL + query, and normalize path-param sentinels to spec placeholders. */
function normalizePath(url: string): string {
  const withoutBase = url.replace("http://localhost", "");
  const path = withoutBase.split("?")[0] ?? withoutBase;
  return path
    .replace(/__EXECUTION_ID__/g, "{execution_id}")
    .replace(/__CONVERSATION_ID__/g, "{conversationId}")
    .replace(/__ATTACHMENT_ID__/g, "{attachmentId}")
    .replace(/__FIELD__/g, "{field}")
    .replace(/__EVENT_NAME__/g, "{eventName}")
    .replace(/__CONTACT_ID__/g, "{contactId}")
    .replace(/__STEP_ID__/g, "{stepId}")
    .replace(/__TRANSITION_ID__/g, "{transitionId}")
    .replace(/__GOAL_ID__/g, "{goalId}")
    .replace(/__CALL_ID__/g, "{callId}")
    .replace(/__RUN_ID__/g, "{executionId}")
    .replace(/\/4242\//g, "/{version}/")
    .replace(/__ID__/g, "{id}")
    .replace(/__EMAIL__/g, "{email}");
}

/** Invoke every manifest entry and capture the "VERB /path/template" it emits. */
async function captureSdkOps(): Promise<Map<string, string>> {
  const { client, fetchMock } = makeClient();
  // One fixture serving both dialects: `success`/`data` satisfy a legacy
  // envelope, while `data`/`has_more`/`next_cursor` form a terminal v1 cursor
  // page so the auto-pagination generators stop after a single request.
  fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: [], has_more: false, next_cursor: null }));
  const methodToOp = new Map<string, string>();
  for (const entry of MANIFEST) {
    fetchMock.mockClear();
    if (entry.response !== undefined) fetchMock.mockResolvedValueOnce(jsonResponse(200, entry.response));
    await entry.invoke(client);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error(`contract manifest: ${entry.key} issued no HTTP request`);
    const url = String(call[0]);
    const init = (call[1] ?? {}) as RequestInit;
    const method = String(init.method ?? "GET").toUpperCase();
    methodToOp.set(entry.key, `${method} ${normalizePath(url)}`);
  }
  return methodToOp;
}

function specOperations(): Set<string> {
  const ops = new Set<string>();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      ops.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return ops;
}

function resolveRequestSchema(path: string, method: string): JsonSchema | undefined {
  const schema = spec.paths[path]?.[method]?.requestBody?.content?.["application/json"]?.schema;
  if (!schema) return undefined;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    return name ? spec.components?.schemas?.[name] : undefined;
  }
  return schema;
}

function requiredBodyFields(path: string, method: string): string[] {
  return resolveRequestSchema(path, method)?.required ?? [];
}

// ---------------------------------------------------------------------------
// Suite.
// ---------------------------------------------------------------------------

describe("OpenAPI contract", () => {
  const discovered = discoverMethods(makeClient().client);
  let sdkOps: Map<string, string>;

  beforeAll(async () => {
    sdkOps = await captureSdkOps();
  });

  test("committed spec loaded and looks like the Sendly contract", () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(specOperations().size).toBeGreaterThan(0);
  });

  test("every SDK method is in the manifest, and every manifest entry is a real method", () => {
    const manifestKeys = new Set(MANIFEST.map((e) => e.key));
    const unmappedMethods = [...discovered].filter((m) => !manifestKeys.has(m)).sort();
    const staleManifestEntries = [...manifestKeys].filter((m) => !discovered.has(m)).sort();
    expect({ unmappedMethods, staleManifestEntries }).toEqual({ unmappedMethods: [], staleManifestEntries: [] });
  });

  test("every spec operation is implemented by an SDK method or explicitly listed", () => {
    const implemented = new Set(sdkOps.values());
    const excused = new Set([...NOT_YET_IMPLEMENTED, ...NOT_SDK_CALLABLE]);
    const uncovered = [...specOperations()]
      .filter((op) => !implemented.has(op) && !excused.has(op) && !isCompatDialect(op))
      .sort();
    expect(uncovered).toEqual([]);
  });

  test("no SDK method targets another provider's compat dialect", () => {
    const compat = [...specOperations()].filter((op) => isCompatDialect(op));
    // The probe must see the dialects, or the assertion below is vacuous.
    expect(compat.length).toBeGreaterThan(0);
    expect([...sdkOps.values()].filter((op) => isCompatDialect(op)).sort()).toEqual([]);
  });

  test("every SDK method targets a path+verb that exists in the spec", () => {
    const ops = specOperations();
    const drifted = [...sdkOps.entries()]
      .filter(([, op]) => !ops.has(op))
      .map(([key, op]) => `${key} -> ${op}`)
      .sort();
    expect(drifted).toEqual([]);
  });

  test("NOT_YET_IMPLEMENTED lists only real, still-unimplemented spec operations", () => {
    const ops = specOperations();
    const implemented = new Set(sdkOps.values());
    const notInSpec = NOT_YET_IMPLEMENTED.filter((op) => !ops.has(op));
    const actuallyImplemented = NOT_YET_IMPLEMENTED.filter((op) => implemented.has(op));
    expect({ notInSpec, actuallyImplemented }).toEqual({ notInSpec: [], actuallyImplemented: [] });
  });

  test("NOT_SDK_CALLABLE lists only real, unimplemented operations", () => {
    const ops = specOperations();
    const implemented = new Set(sdkOps.values());
    const notInSpec = NOT_SDK_CALLABLE.filter((op) => !ops.has(op));
    const actuallyImplemented = NOT_SDK_CALLABLE.filter((op) => implemented.has(op));
    expect({ notInSpec, actuallyImplemented }).toEqual({ notInSpec: [], actuallyImplemented: [] });
  });

  test("NOT_SDK_CALLABLE is exactly the set of operations that refuse an API key", () => {
    // The teeth, and the reason this list is not an opinion: the contract says
    // which operations an API key can reach, so the list is checked against it
    // rather than trusted. Both directions —
    //   - an entry that DOES accept ApiKeyAuth is callable, so go build it;
    //   - an operation that does NOT accept ApiKeyAuth and is missing from the
    //     list is an undocumented dead end for every consumer of this SDK.
    const keyCallable = (op: string): boolean => {
      const [method, ...rest] = op.split(" ");
      const operation = spec.paths[rest.join(" ")]?.[method!.toLowerCase()];
      return (operation?.security ?? []).some((entry) => "ApiKeyAuth" in entry);
    };

    const listedButCallable = NOT_SDK_CALLABLE.filter((op) => keyCallable(op)).sort();
    const refusesKeyButUnlisted = [...specOperations()]
      .filter((op) => !keyCallable(op))
      .filter((op) => !NOT_SDK_CALLABLE.includes(op))
      // A dialect carries its provider's own credential (a Postmark server token,
      // Mailgun basic auth); it is excused above, by path, not by this list.
      .filter((op) => !isCompatDialect(op))
      // `/api/verify/*` is open — no security requirement at all — which is not
      // the same fact as "refuses an API key". Exclude it by that property
      // rather than by name, so a new open route needs no edit here.
      .filter((op) => {
        const [method, ...rest] = op.split(" ");
        return (spec.paths[rest.join(" ")]?.[method!.toLowerCase()]?.security ?? []).length > 0;
      })
      .sort();

    expect(
      { listedButCallable, refusesKeyButUnlisted },
      "NOT_SDK_CALLABLE must match the contract's own ApiKeyAuth declarations",
    ).toEqual({ listedButCallable: [], refusesKeyButUnlisted: [] });
  });

  test("emails.send forwards every body field the spec marks required on the v1 send", async () => {
    // 1.0: `send` is the versioned send. The legacy route is checked separately below.
    const required = requiredBodyFields("/api/v1/emails", "post");
    expect(required.length).toBeGreaterThan(0);
    const fixture: SendEmailV1Request = { to: "user@example.com" };
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(202, { id: "em_1", status: "PENDING", to: "user@example.com", from: "hi@acme.com" }),
    );
    await client.emails.send(fixture);
    const body = getCallBody(fetchMock) as Record<string, unknown>;
    for (const field of required) {
      expect(Object.keys(fixture)).toContain(field);
      expect(body).toHaveProperty(field);
    }
  });

  test("emails.sendLegacy forwards every body field the spec marks required on the legacy send", async () => {
    const required = requiredBodyFields("/api/emails", "post");
    expect(required.length).toBeGreaterThan(0);
    const fixture: SendEmailRequest = { to: "user@example.com" };
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.emails.sendLegacy(fixture);
    const body = getCallBody(fetchMock) as Record<string, unknown>;
    for (const field of required) {
      expect(Object.keys(fixture)).toContain(field);
      expect(body).toHaveProperty(field);
    }
  });

  test("campaigns.create forwards every body field the spec marks required", async () => {
    const required = requiredBodyFields("/api/v1/campaigns", "post");
    expect(required.length).toBeGreaterThan(0);
    const fixture: CreateCampaignV1Request = {
      name: "Launch",
      subject: "Hello",
      body: "<p>hi</p>",
      from: "sender@example.com",
      audience_type: "ALL",
    };
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, {}));
    await client.campaigns.create(fixture);
    const body = getCallBody(fetchMock) as Record<string, unknown>;
    for (const field of required) {
      expect(Object.keys(fixture)).toContain(field);
      expect(body).toHaveProperty(field);
    }
  });

  test("every cursor-paginated v1 list method has a companion auto-pagination generator", () => {
    // The v1 list envelope is `{ data, has_more, next_cursor }`; any operation
    // answering with it should be walkable without the caller managing cursors.
    //
    // ONE envelope, as of the 1.1 contract. Topics and validation results used to
    // answer `{ data, cursor, has_more }` and take `cursor`, which meant the shared
    // page-walker sent a parameter they ignored and read a field they never returned.
    // Detection is still by SHAPE rather than by an endpoint list, so a resource that
    // reintroduces the second dialect is caught rather than assumed away.
    const cursorListOps = new Set<string>();
    for (const [path, methods] of Object.entries(spec.paths)) {
      if (!path.startsWith("/api/v1")) continue;
      const schema = methods.get?.responses?.["200"]?.content?.["application/json"]?.schema;
      const name = schema?.$ref?.split("/").pop();
      const resolved = name ? spec.components?.schemas?.[name] : undefined;
      const props = resolved?.properties ?? schema?.properties;
      if (props && "data" in props && "has_more" in props && "next_cursor" in props) {
        cursorListOps.add(`GET ${path}`);
      }
    }
    expect(cursorListOps.size).toBeGreaterThan(0);

    const missing = [...cursorListOps]
      .filter((op) => {
        const listMethods = [...sdkOps.entries()].filter(([, emitted]) => emitted === op).map(([key]) => key);
        // `list` -> `listAll`, and `listV1` -> `listAllV1`: on the suffixed pair the
        // word `All` goes with the verb, not after the dialect marker, because
        // `listV1All` reads as a third thing rather than as the walk of `listV1`.
        return !listMethods.some((key) => discovered.has(`${key}All`) || discovered.has(key.replace(/V1$/, "AllV1")));
      })
      .sort();
    expect(missing).toEqual([]);
  });

  test("contacts.create forwards every body field the spec marks required", async () => {
    const required = requiredBodyFields("/api/contacts", "post");
    expect(required.length).toBeGreaterThan(0);
    const fixture: CreateContactRequest = { email: "user@example.com", subscribed: true };
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.contacts.create(fixture);
    const body = getCallBody(fetchMock) as Record<string, unknown>;
    for (const field of required) {
      expect(Object.keys(fixture)).toContain(field);
      expect(body).toHaveProperty(field);
    }
  });
});
