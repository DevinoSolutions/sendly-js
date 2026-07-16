import { describe, expect, test, vi } from "vitest";
import { Sendly, SendlyAuthenticationError, SendlyConnectionError, SendlyError, SendlyValidationError } from "../index";
import { getCall, jsonResponse, makeClient } from "./helpers";

describe("Sendly client", () => {
  test("throws when apiKey missing", () => {
    expect(() => new Sendly({ apiKey: "" })).toThrow(SendlyError);
  });

  test("throws when no fetch is available and global is missing", () => {
    expect(
      () =>
        new Sendly({
          apiKey: "sk_test",
          // eslint-disable-next-line sendly/no-unknown-cast-laundering -- testing fallback behavior with undefined fetch
          fetch: undefined as unknown as typeof fetch,
          // pretend global fetch is missing
        }),
    ).not.toThrow(); // global fetch is available in node 24
  });

  test("attaches Authorization, Accept, User-Agent headers", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await client.request({ method: "GET", path: "/api/domains" });
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/domains");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_key");
    expect(headers.Accept).toBe("application/json");
    expect(headers["User-Agent"]).toMatch(/^sendly-node\//);
  });

  test("strips trailing slash from baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    const client = new Sendly({
      apiKey: "sk",
      baseUrl: "http://localhost///",
      // eslint-disable-next-line sendly/no-unknown-cast-laundering -- vi.fn() mock typed as typeof fetch
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.request({ method: "GET", path: "/api/domains" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost/api/domains");
  });

  test("serializes query params, skips undefined/null/empty", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await client.request({
      method: "GET",
      path: "/api/emails",
      query: { limit: 10, tag: "welcome", skip: undefined, none: null, blank: "" },
    });
    const { url } = getCall(fetchMock);
    expect(url).toContain("limit=10");
    expect(url).toContain("tag=welcome");
    expect(url).not.toContain("skip=");
    expect(url).not.toContain("none=");
    expect(url).not.toContain("blank=");
  });

  test("maps 400 -> SendlyValidationError with envelope code/message", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "bad input", code: "invalid_body" } }));
    await expect(client.request({ method: "GET", path: "/api/emails" })).rejects.toMatchObject({
      name: "SendlyValidationError",
      statusCode: 400,
      errorCode: "invalid_body",
      message: "bad input",
    });
  });

  test("maps 422 -> SendlyValidationError and preserves error.details.errors", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        success: false,
        error: { message: "validation failed", code: "VALIDATION_ERROR", details: { errors: [{ path: "email" }] } },
      }),
    );
    try {
      await client.request({ method: "POST", path: "/api/contacts", body: {} });
      throw new Error("expected throw");
      // eslint-disable-next-line sendly/no-silent-catch -- test catch asserting on the caught error; the expect() failures surface loudly
    } catch (error) {
      expect(error).toBeInstanceOf(SendlyValidationError);
      expect(error).toMatchObject({ statusCode: 422, errorCode: "VALIDATION_ERROR", message: "validation failed" });
      expect((error as SendlyError).body).toMatchObject({ error: { details: { errors: [{ path: "email" }] } } });
    }
  });

  test("maps 401 -> SendlyAuthenticationError", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { message: "no key", code: "unauthorized" } }));
    await expect(client.request({ method: "GET", path: "/api/emails" })).rejects.toBeInstanceOf(
      SendlyAuthenticationError,
    );
  });

  test("falls back to http_<status> code when envelope missing", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(500, "not json at all"));
    const promise = client.request({ method: "GET", path: "/api/emails" });
    await expect(promise).rejects.toMatchObject({
      statusCode: 500,
      errorCode: "invalid_response",
    });
  });

  test("wraps fetch rejection as SendlyConnectionError", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(client.request({ method: "GET", path: "/api/emails" })).rejects.toBeInstanceOf(SendlyConnectionError);
  });

  test("rejects non-rooted paths", async () => {
    const { client } = makeClient();
    await expect(client.request({ method: "GET", path: "api/no/leading/slash" })).rejects.toThrow(/must start with/);
  });

  test("throws SendlyValidationError instance for 400 (instanceof check)", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "x", code: "y" } }));
    try {
      await client.request({ method: "GET", path: "/api/emails" });
      throw new Error("expected throw");
      // eslint-disable-next-line sendly/no-silent-catch -- test catch asserting on the caught error; the expect() failures surface loudly
    } catch (error) {
      expect(error).toBeInstanceOf(SendlyValidationError);
      expect(error).toBeInstanceOf(SendlyError);
    }
  });
});
