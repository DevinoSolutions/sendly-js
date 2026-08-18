import { describe, expect, test } from "vitest";
import { SendlyAuthenticationError } from "../index";
import { getCall, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

describe("usage resource (/api/v1)", () => {
  test("get GETs /api/v1/usage and resolves the bare usage body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        plan: "pro",
        monthly: { emails_sent: 1200, limit: 50_000 },
        daily: { emails_sent: 84, limit: 2_000, trust_tier: "established" },
      }),
    );

    const usage = await client.usage.get();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/usage");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(usage.plan).toBe("pro");
    // Monthly and daily counters run on different windows and are reported separately.
    expect(usage.monthly.emails_sent).toBe(1200);
    expect(usage.daily.emails_sent).toBe(84);
  });

  test("sends the bearer key and SDK user agent like every other resource", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { plan: "free", monthly: {}, daily: {} }));

    await client.usage.get();

    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_key");
    expect(headers["User-Agent"]).toMatch(/^sendly-node\//);
  });

  test("an invalid key maps to SendlyAuthenticationError with invalid_api_key", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(401, {
        type: "https://docs.sendly.now/errors/invalid_api_key",
        title: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req_usage",
      }),
    );

    const error = await rejection<SendlyAuthenticationError>(client.usage.get());
    expect(error).toBeInstanceOf(SendlyAuthenticationError);
    expect(error.errorCode).toBe("invalid_api_key");
    expect(error.requestId).toBe("req_usage");
  });
});
