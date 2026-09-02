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
 * NOT YET — a genuine gap. Empty: every key-callable operation is now mapped to
 * a resource method. Retained as the seam for future spec additions.
 */
export const NOT_YET_IMPLEMENTED: readonly string[] = [];

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

  // A project is created FOR a user; there is nothing for a key to act as.
  "POST /api/users/me/projects",
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

interface ManifestEntry {
  /** "<resource>.<method>" */
  key: string;
  invoke: (client: Sendly) => Promise<unknown>;
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
  // projects (v1)
  { key: "projects.get", invoke: (c) => c.projects.get() },
  // templates
  {
    key: "templates.create",
    invoke: (c) =>
      c.templates.create({ name: "n", subject: "s", body: "b", from: "sender@example.com", type: "TRANSACTIONAL" }),
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
    const uncovered = [...specOperations()].filter((op) => !implemented.has(op) && !excused.has(op)).sort();
    expect(uncovered).toEqual([]);
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
        return !listMethods.some((key) => discovered.has(`${key}All`));
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
