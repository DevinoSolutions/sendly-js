import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { bundleConsumer, cannedApiResponse, installPackedSdk, removeFixture, SEND_CONSUMER } from "./fixture";

interface Seen {
  url: string;
  method: string;
  authorization: string | null;
  idempotencyKey: string | null;
  userAgent: string | null;
  body: string;
}

const WORKER_ENTRY = `${SEND_CONSUMER}
export default {
  async fetch() {
    try {
      return Response.json(await run());
    } catch (error) {
      return Response.json({ crashed: String(error) }, { status: 500 });
    }
  },
};
`;

let fixtureDir = "";
let workerScript = "";

/** Run the bundled Worker in workerd. Every outbound fetch is answered here: nothing reaches the network. */
async function runInWorkerd(
  compatibilityFlags: string[],
): Promise<{ status: number; text: string; json: unknown; seen: Seen[] }> {
  const seen: Seen[] = [];
  const mf = new Miniflare({
    modules: [{ type: "ESModule", path: "worker.mjs", contents: workerScript }],
    compatibilityDate: "2026-08-01",
    compatibilityFlags,
    outboundService: async (request) => {
      seen.push({
        url: request.url,
        method: request.method,
        authorization: request.headers.get("authorization"),
        idempotencyKey: request.headers.get("idempotency-key"),
        userAgent: request.headers.get("user-agent"),
        body: await request.text(),
      });
      const canned = cannedApiResponse(request.headers.get("authorization"));
      return new Response(JSON.stringify(canned.body), {
        status: canned.status,
        headers: { "content-type": canned.type },
      });
    },
  });
  try {
    const response = await mf.dispatchFetch("http://worker.test/");
    const text = await response.text();
    return { status: response.status, text, json: response.ok ? JSON.parse(text) : undefined, seen };
  } finally {
    await mf.dispose();
  }
}

beforeAll(async () => {
  fixtureDir = installPackedSdk();
  // `crypto` is left to workerd: that is what `wrangler` does under `nodejs_compat`.
  workerScript = await bundleConsumer(fixtureDir, WORKER_ENTRY, {
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "import"],
    external: ["crypto", "node:crypto"],
  });
}, 120_000);

afterAll(() => removeFixture(fixtureDir));

describe("Cloudflare Workers (workerd) running the packed sendly-sdk", () => {
  test("emails.send works on the global fetch, with auth, idempotency key and typed errors (nodejs_compat)", async () => {
    const { status, json, seen } = await runInWorkerd(["nodejs_compat"]);

    expect(json).toMatchObject({
      receipt: { id: "em_edge_1", status: "PENDING" },
      rejected: "SendlyAuthenticationError",
    });
    expect(status).toBe(200);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      url: "https://api.sendly.now/api/v1/emails",
      method: "POST",
      authorization: "Bearer sk_test_edge_runtime",
      idempotencyKey: "edge-key-1",
    });
    expect(seen[0]?.userAgent).toMatch(/^sendly-node\//);
    expect(JSON.parse(seen[0]?.body ?? "{}")).toEqual({
      to: "test+edge@example.com",
      subject: "edge",
      body: "<p>edge</p>",
    });
  });

  // KNOWN GAP (T-7169): src/webhook-utils.ts imports node:crypto at module top level and the
  // entry point re-exports it, so merely importing `Sendly` needs Node crypto in the runtime.
  // This pins the gap with its exact cause; when the webhook helpers leave the module graph of
  // `Sendly`, it goes red: flip it to expect a receipt.
  test("KNOWN GAP: without nodejs_compat the module does not load because of crypto", async () => {
    const outcome = await runInWorkerd([]).then(
      (result) => result.text,
      (error: unknown) => String(error),
    );

    expect(outcome).toMatch(/crypto/i);
    expect(outcome).not.toMatch(/em_edge_1/);
  });
});
