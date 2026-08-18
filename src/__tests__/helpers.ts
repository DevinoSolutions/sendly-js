import { vi } from "vitest";
import type { Mock } from "vitest";
import { Sendly } from "../client";
import type { SendlyError } from "../errors";

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

/**
 * Build an RFC 9457 `application/problem+json` error response — the error
 * dialect of the `/api/v1` surface.
 */
export function problemResponse(status: number, problem: Record<string, unknown>): Response {
  const text = JSON.stringify({ status, ...problem });
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- partial Response stub for test
  return {
    ok: false,
    status,
    statusText: "",
    text: async () => text,
    json: async () => JSON.parse(text),
    headers: new Headers({ "content-type": "application/problem+json; charset=utf-8" }),
  } as unknown as Response;
}

/** Build one page of a v1 cursor list envelope. */
export function cursorPage<T>(data: T[], nextCursor: string | null): Response {
  return jsonResponse(200, { data, has_more: nextCursor !== null, next_cursor: nextCursor });
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

/**
 * Await a call that must reject, returning the thrown error narrowed to `E`.
 *
 * `promise.catch((e) => e)` widens to `Success | E`, which defeats reading
 * `errorCode` / `requestId` off the result, so tests use this instead.
 */
export async function rejection<E = SendlyError>(promise: Promise<unknown>): Promise<E> {
  try {
    await promise;
  } catch (error) {
    // eslint-disable-next-line sendly/no-unknown-cast-laundering -- the caller states the expected error type
    return error as E;
  }
  throw new Error("expected the call to reject, but it resolved");
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
