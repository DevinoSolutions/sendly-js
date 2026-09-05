import { describe, expect, test } from "vitest";
import { SendlyRateLimitError } from "../index";
import type { WebhookV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

function webhookV1(id: string): WebhookV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return {
    id,
    url: `https://example.com/${id}`,
    event_types: ["email.delivered"],
    status: "ACTIVE",
  } as unknown as WebhookV1;
}

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

describe("webhooks resource (/api/v1)", () => {
  test("createV1 POSTs /api/v1/webhooks and hands back the one-time secret", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        webhook: { id: "wh_1", url: "https://example.com/hook", event_types: ["email.delivered"], status: "ACTIVE" },
        secret: "whsec_created",
      }),
    );

    const created = await client.webhooks.createV1({
      url: "https://example.com/hook",
      event_types: ["email.delivered"],
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/webhooks");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ url: "https://example.com/hook", event_types: ["email.delivered"] });
    // This response and rotateSecretV1 are the only two that carry the secret.
    expect(created.secret).toBe("whsec_created");
    expect(created.webhook.id).toBe("wh_1");
  });

  test("v1 responses are bare bodies — no envelope is unwrapped", async () => {
    const { client, fetchMock } = makeClient();
    const body = {
      id: "wh_1",
      url: "https://example.com/hook",
      event_types: ["email.delivered"],
      status: "ACTIVE",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    // A v1 body has no `data` key to unwrap, so unwrapping would lose the whole record.
    expect(await client.webhooks.getV1("wh_1")).toEqual(body);
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/webhooks/wh_1");
    // A read never carries the secret.
    expect(await client.webhooks.getV1("wh_1")).not.toHaveProperty("secret");
  });

  test("updateV1 PATCHes the v1 path with the replacement event list", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: "wh_1",
        url: "https://example.com/hook",
        event_types: ["email.bounced"],
        status: "ACTIVE",
      }),
    );

    const updated = await client.webhooks.updateV1("wh_1", { event_types: ["email.bounced"], status: "ACTIVE" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/webhooks/wh_1");
    expect(init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ event_types: ["email.bounced"], status: "ACTIVE" });
    // `event_types` replaces rather than merges — `email.delivered` is gone.
    expect(updated.event_types).toEqual(["email.bounced"]);
  });

  test("deleteV1 DELETEs the v1 path and resolves the deletion receipt", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "wh_1", deleted: true }));

    const deleted = await client.webhooks.deleteV1("wh_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/webhooks/wh_1");
    expect(init.method).toBe("DELETE");
    expect(deleted).toEqual({ id: "wh_1", deleted: true });
  });

  test("rotateSecretV1 POSTs the rotate sub-path and names when the old secret dies", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { secret: "whsec_rotated", previous_secret_expires_at: "2026-09-06T00:00:00.000Z" }),
    );

    const rotated = await client.webhooks.rotateSecretV1("wh_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/webhooks/wh_1/rotate-secret");
    expect(init.method).toBe("POST");
    expect(rotated.secret).toBe("whsec_rotated");
    // Both signatures ship until this moment; after it the old secret is rejected.
    expect(rotated.previous_secret_expires_at).toBe("2026-09-06T00:00:00.000Z");
  });

  test("listV1 serializes cursor query params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));

    await client.webhooks.listV1({ limit: 25, after: "cur_wh" });

    const { url } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/v1/webhooks?");
    expect(url).toContain("limit=25");
    expect(url).toContain("after=cur_wh");
  });

  test("listAllV1 walks every page and yields individual webhooks", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([webhookV1("wh_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([webhookV1("wh_2"), webhookV1("wh_3")], null));

    const seen: string[] = [];
    for await (const item of client.webhooks.listAllV1({ limit: 1 })) seen.push(item.id);

    expect(seen).toEqual(["wh_1", "wh_2", "wh_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).toContain("limit=1");
  });
});
