import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";

import type { Sendly } from "../client";
import type { CreateContactRequest, SendEmailRequest } from "../types";
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
 *     listed in NOT_YET_IMPLEMENTED;
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
}

interface OpenApiSpec {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

const SPEC_PATH = fileURLToPath(new URL("../../openapi.json", import.meta.url));
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiSpec;

// ---------------------------------------------------------------------------
// Spec operations the SDK deliberately does not implement yet.
//
// Empty: every spec operation is now mapped to a resource method. Retained
// (with its guards) as the fail-closed seam for future spec additions — the
// suite fails if an entry is not a real spec operation, and fails if an entry
// actually IS implemented (stale entry).
// ---------------------------------------------------------------------------

export const NOT_YET_IMPLEMENTED: readonly string[] = [];

// ---------------------------------------------------------------------------
// Invocation manifest: how to exercise each SDK method with minimal valid
// (type-checked) arguments. Invoking captures the real verb + path template
// the client emits, so the mapping reflects the actual client code — not a
// hand-maintained duplicate of it. Path params use sentinels normalized back
// to the spec's `{id}` / `{email}` placeholders.
// ---------------------------------------------------------------------------

const ID = "__ID__";
const EMAIL = "__EMAIL__";

interface ManifestEntry {
  /** "<resource>.<method>" */
  key: string;
  invoke: (client: Sendly) => Promise<unknown>;
}

const MANIFEST: readonly ManifestEntry[] = [
  // emails
  { key: "emails.send", invoke: (c) => c.emails.send({ to: "user@example.com" }) },
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
  { key: "domains.delete", invoke: (c) => c.domains.delete(ID) },
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
  // events
  { key: "events.track", invoke: (c) => c.events.track({ event: "signup", email: "user@example.com" }) },
  // verify
  { key: "verify.email", invoke: (c) => c.verify.email({ email: "user@example.com" }) },
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
  return path.replace(/__ID__/g, "{id}").replace(/__EMAIL__/g, "{email}");
}

/** Invoke every manifest entry and capture the "VERB /path/template" it emits. */
async function captureSdkOps(): Promise<Map<string, string>> {
  const { client, fetchMock } = makeClient();
  fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
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

  test("every spec operation is implemented by an SDK method or explicitly deferred", () => {
    const implemented = new Set(sdkOps.values());
    const deferred = new Set(NOT_YET_IMPLEMENTED);
    const uncovered = [...specOperations()].filter((op) => !implemented.has(op) && !deferred.has(op)).sort();
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

  test("emails.send forwards every body field the spec marks required", async () => {
    const required = requiredBodyFields("/api/emails", "post");
    expect(required.length).toBeGreaterThan(0);
    const fixture: SendEmailRequest = { to: "user@example.com" };
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.emails.send(fixture);
    const body = getCallBody(fetchMock) as Record<string, unknown>;
    for (const field of required) {
      expect(Object.keys(fixture)).toContain(field);
      expect(body).toHaveProperty(field);
    }
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
