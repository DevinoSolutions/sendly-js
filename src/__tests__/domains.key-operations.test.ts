import { describe, expect, test } from "vitest";
import { SendlyRateLimitError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

const envelope = (data: unknown, status = 200) => jsonResponse(status, { success: true, data });

describe("domains: DoDomain setup and warm-up (legacy /api/domains)", () => {
  test("getConnectStatus GETs dodomain-check and unwraps the envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ available: true, method: "guided", provider: "cloudflare", tier: 1 }));

    const status = await client.domains.getConnectStatus("d1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/domains/d1/dodomain-check");
    expect(init.method).toBe("GET");
    expect(status.available).toBe(true);
  });

  test("reverifyConnection POSTs and resolves the accepted acknowledgement, with no verdict", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ status: "accepted" }, 202));

    const result = await client.domains.reverifyConnection("d1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/domains/d1/dodomain-reverify");
    expect(init.method).toBe("POST");
    expect(result.status).toBe("accepted");
  });

  test("a second reverify inside the cooldown is a typed rate-limit error", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(429, { type: "about:blank", title: "Too Many Requests", code: "rate_limited" }),
    );
    expect(await rejection(client.domains.reverifyConnection("d1"))).toBeInstanceOf(SendlyRateLimitError);
  });

  test("getWarmup GETs the ramp status", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ day: 3, sentToday: 40 }));

    const warmup = await client.domains.getWarmup("d1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/domains/d1/warmup");
    expect(warmup.day).toBe(3);
  });

  test.each(["finish", "restart"] as const)("manageWarmup POSTs action %s", async (action) => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ day: 1 }));

    await client.domains.manageWarmup("d1", { action });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/domains/d1/warmup");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ action });
  });
});
