import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EdgeVM } from "@edge-runtime/vm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { bundleConsumer, cannedApiResponse, installPackedSdk, removeFixture, SEND_CONSUMER } from "./fixture";

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

let fixtureDir = "";

/**
 * Bundle for an edge runtime the way Vercel's bundler sees it: browser platform, the
 * `edge-light` / `worker` export conditions, no Node built-ins.
 */
function edgeBundle(options: { stubCrypto: boolean }): Promise<string> {
  const stub = join(fixtureDir, "crypto-stub.mjs");
  writeFileSync(
    stub,
    'const unavailable = () => { throw new Error("Node crypto is not available on the edge runtime"); };\n' +
      "export const createHmac = unavailable;\nexport const timingSafeEqual = unavailable;\n",
  );
  return bundleConsumer(fixtureDir, `${SEND_CONSUMER}\nglobalThis.__run = () => run().then(JSON.stringify);`, {
    format: "iife",
    platform: "browser",
    conditions: ["edge-light", "worker", "import"],
    alias: options.stubCrypto ? { crypto: stub } : {},
  });
}

/** Run the bundle inside Vercel's Edge Runtime VM (@edge-runtime/vm). Its `fetch` is replaced: nothing leaves the process. */
async function runInEdgeVm(bundle: string): Promise<{ result: unknown; seen: Seen[]; evalBlocked: boolean }> {
  const seen: Seen[] = [];
  const vm = new EdgeVM({
    extend: (context) => {
      const { Response: EdgeResponse } = context as { Response: typeof Response };
      context.fetch = async (input: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        seen.push({ url: String(input), method: String(init.method), headers, body: String(init.body) });
        const canned = cannedApiResponse(headers["Authorization"] ?? null);
        return new EdgeResponse(JSON.stringify(canned.body), {
          status: canned.status,
          headers: { "content-type": canned.type },
        });
      };
      return context;
    },
  });
  // Vercel's edge sandbox forbids dynamic code evaluation; prove the VM really does, so "the
  // SDK never trips it" below means something.
  const evalBlocked = vm.evaluate(
    '(() => { try { new Function("return 1"); return false; } catch { return true; } })()',
  );
  const json = (await vm.evaluate(`${bundle}\n__run()`)) as string;
  return { result: JSON.parse(json), seen, evalBlocked };
}

beforeAll(() => {
  fixtureDir = installPackedSdk();
}, 120_000);

afterAll(() => removeFixture(fixtureDir));

describe("Vercel Edge Runtime (@edge-runtime/vm) running the packed sendly-sdk", () => {
  test("emails.send works on the edge fetch with no dynamic code evaluation", async () => {
    const { result, seen, evalBlocked } = await runInEdgeVm(await edgeBundle({ stubCrypto: true }));

    expect(evalBlocked).toBe(true);
    expect(result).toMatchObject({
      receipt: { id: "em_edge_1", status: "PENDING" },
      rejected: "SendlyAuthenticationError",
    });
    expect(seen[0]).toMatchObject({
      url: "https://api.sendly.now/api/v1/emails",
      method: "POST",
      headers: { Authorization: "Bearer sk_test_edge_runtime", "Idempotency-Key": "edge-key-1" },
    });
    expect(JSON.parse(seen[0]?.body ?? "{}")).toEqual({
      to: "test+edge@example.com",
      subject: "edge",
      body: "<p>edge</p>",
    });
  });

  // KNOWN GAP (T-7169): the entry point pulls in src/webhook-utils.ts, which imports Node's
  // crypto. Without the stub above, an edge bundler has nothing to resolve it to. When the
  // webhook helpers leave the module graph of `Sendly`, this goes red: delete it and the stub.
  test("KNOWN GAP: the unmodified package does not bundle for an edge runtime because of crypto", async () => {
    await expect(edgeBundle({ stubCrypto: false })).rejects.toThrow(/Could not resolve "crypto"/);
  });
});
