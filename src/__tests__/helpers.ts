import { vi } from "vitest";
import type { Mock } from "vitest";
import { Sendly } from "../client";

/** Build a `Response`-shaped value sufficient for the SDK's `fetch` consumer. */
export function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- partial Response stub for test
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => text,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

export function emptyResponse(status = 204): Response {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- partial Response stub for test
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => "",
    json: async () => undefined,
    headers: new Headers(),
  } as unknown as Response;
}

export interface MockClient {
  client: Sendly;
  fetchMock: Mock;
}

/** Build a `Sendly` client wired to a vitest mock fetch. Each test gets a fresh mock. */
export function makeClient(): MockClient {
  const fetchMock = vi.fn() as Mock;
  const client = new Sendly({
    apiKey: "sk_test_key",
    baseUrl: "http://localhost",
    // eslint-disable-next-line sendly/no-unknown-cast-laundering -- vi.fn() mock typed as typeof fetch
    fetch: fetchMock as unknown as typeof fetch,
    timeout: 0,
  });
  return { client, fetchMock };
}

/** Read the URL + init recorded by the mock fetch on the Nth call (0-indexed). */
export function getCall(fetchMock: Mock, n = 0): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[n];
  if (!call) throw new Error(`fetchMock has no call at index ${n}`);
  return { url: call[0] as string, init: call[1] as RequestInit };
}

/** Convenience: assert+return parsed body of a recorded request. */
export function getCallBody(fetchMock: Mock, n = 0): unknown {
  const { init } = getCall(fetchMock, n);
  if (typeof init.body !== "string") return undefined;
  return JSON.parse(init.body);
}
