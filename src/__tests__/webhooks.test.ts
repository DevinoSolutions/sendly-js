import { describe, expect, test } from "vitest";
import { SendlyRateLimitError } from "../index";
import { getCall, jsonResponse, makeClient } from "./helpers";

describe("webhooks resource", () => {
  test("create POSTs /api/webhooks", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { webhook: { id: "w_1", url: "https://example.com/hook" }, secret: "whsec_xx" },
      }),
    );
    await client.webhooks.create({
      url: "https://example.com/hook",
      eventTypes: ["email.delivered"],
    });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/webhooks");
  });

  test("rotateSecret POSTs /api/webhooks/{id}/rotate-secret", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { secret: "whsec_yy" } }));
    await client.webhooks.rotateSecret("w_1");
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/webhooks/w_1/rotate-secret");
    expect(init.method).toBe("POST");
  });

  test("listCalls GETs /api/webhooks/{id}/calls with cursor query", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.webhooks.listCalls("w_1", { limit: 20, cursor: "abc" });
    const { url, init } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/webhooks/w_1/calls?");
    expect(url).toContain("limit=20");
    expect(url).toContain("cursor=abc");
    expect(init.method).toBe("GET");
  });

  test("throws SendlyRateLimitError on 429", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(429, { error: { message: "slow down", code: "rate_limited" } }));
    await expect(client.webhooks.create({ url: "https://x", eventTypes: ["email.delivered"] })).rejects.toBeInstanceOf(
      SendlyRateLimitError,
    );
  });

  test("update PATCHes", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "w_1" } }));
    await client.webhooks.update("w_1", { status: "PAUSED" });
    expect(getCall(fetchMock).init.method).toBe("PATCH");
  });

  test("delete DELETEs", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await client.webhooks.delete("w_1");
    expect(getCall(fetchMock).init.method).toBe("DELETE");
  });
});
