import { describe, expect, test } from "vitest";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

const envelope = (data: unknown) => jsonResponse(200, { success: true, data });

describe("webhooks: test, replay and retry (legacy /api/webhooks)", () => {
  test("test POSTs the chosen event type and resolves the delivery attempt", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "call1", statusCode: 200 }));

    const call = await client.webhooks.test("w1", { eventType: "email.delivered" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/webhooks/w1/test");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ eventType: "email.delivered" });
    expect(call.statusCode).toBe(200);
  });

  test("test without a body sends none, so the server picks the sample event", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "call1" }));
    await client.webhooks.test("w1");
    expect(getCall(fetchMock).init.body).toBeUndefined();
  });

  test("replayFailed POSTs the since / limit window", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ replayed: 7 }));

    const result = await client.webhooks.replayFailed("w1", { since: "2026-11-01T00:00:00Z", limit: 100 });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/webhooks/w1/replay-failed");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ since: "2026-11-01T00:00:00Z", limit: 100 });
    expect(result.replayed).toBe(7);
  });

  test("retryCall POSTs to the call's retry route", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "call2" }));

    const call = await client.webhooks.retryCall("w1", "call1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/webhooks/w1/calls/call1/retry");
    expect(init.method).toBe("POST");
    expect(call.id).toBe("call2");
  });
});
