import { describe, expect, test } from "vitest";
import { SendlyConflictError, SendlyNotFoundError } from "../index";
import type { CampaignV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

function campaign(id: string): CampaignV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, name: `Campaign ${id}`, status: "DRAFT" } as unknown as CampaignV1;
}

describe("campaigns resource (/api/v1)", () => {
  test("create POSTs /api/v1/campaigns and resolves the bare body — no envelope unwrap", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "cmp_1", name: "Launch", status: "DRAFT" }));

    const created = await client.campaigns.create({
      name: "Launch",
      subject: "Hello",
      body: "<p>hi</p>",
      from: "sender@example.com",
      audience_type: "ALL",
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/campaigns");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toMatchObject({ name: "Launch", audience_type: "ALL" });
    // The v1 dialect returns the resource itself, so `id` is readable directly.
    expect(created.id).toBe("cmp_1");
  });

  test("create accepts a body omitting every field the spec defaults", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "cmp_1" }));
    // `type` defaults to MARKETING server-side; requiring it here would be a
    // codegen artifact, not the contract.
    await client.campaigns.create({
      name: "Launch",
      subject: "Hello",
      body: "<p>hi</p>",
      from: "sender@example.com",
      audience_type: "ALL",
    });
    expect(getCallBody(fetchMock)).not.toHaveProperty("type");
  });

  test("a v1 body that happens to carry `data` is NOT unwrapped as a legacy envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([campaign("cmp_1")], null));

    const page = await client.campaigns.list();

    expect(page.has_more).toBe(false);
    expect(page.next_cursor).toBeNull();
    expect(page.data).toHaveLength(1);
  });

  test("create forwards the Idempotency-Key header when given, and omits it otherwise", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "cmp_1" }));

    await client.campaigns.create(
      { name: "n", subject: "s", body: "b", from: "sender@example.com", audience_type: "ALL" },
      { idempotencyKey: "idem-campaign-1" },
    );
    expect((getCall(fetchMock).init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-campaign-1");

    fetchMock.mockClear();
    await client.campaigns.create({
      name: "n",
      subject: "s",
      body: "b",
      from: "sender@example.com",
      audience_type: "ALL",
    });
    expect((getCall(fetchMock).init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  test("send posts a schedule body and forwards its own idempotency key", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cmp_1", status: "SCHEDULED" }));

    await client.campaigns.send(
      "cmp_1",
      { scheduled_for: "2026-09-01T10:00:00.000Z" },
      { idempotencyKey: "idem-send" },
    );

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/campaigns/cmp_1/send");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ scheduled_for: "2026-09-01T10:00:00.000Z" });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-send");
  });

  test("send with no arguments issues a bodyless POST", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cmp_1", status: "SENDING" }));
    await client.campaigns.send("cmp_1");
    expect(getCall(fetchMock).init.body).toBeUndefined();
  });

  test("lifecycle transitions hit their own sub-paths", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cmp_1" }));

    for (const [method, suffix] of [
      ["cancel", "cancel"],
      ["pause", "pause"],
      ["resume", "resume"],
    ] as const) {
      fetchMock.mockClear();
      await client.campaigns[method]("cmp_1");
      const { url, init } = getCall(fetchMock);
      expect(url).toBe(`http://localhost/api/v1/campaigns/cmp_1/${suffix}`);
      expect(init.method).toBe("POST");
    }
  });

  test("get, update, delete and stats build the right verb and path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cmp_1", deleted: true }));

    await client.campaigns.get("cmp_1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/campaigns/cmp_1");

    fetchMock.mockClear();
    await client.campaigns.update("cmp_1", { name: "Renamed" });
    expect(getCall(fetchMock).init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ name: "Renamed" });

    fetchMock.mockClear();
    const deleted = await client.campaigns.delete("cmp_1");
    expect(getCall(fetchMock).init.method).toBe("DELETE");
    expect(deleted).toEqual({ id: "cmp_1", deleted: true });

    fetchMock.mockClear();
    await client.campaigns.stats("cmp_1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/campaigns/cmp_1/stats");
  });

  test("list serializes limit and after as query params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));
    await client.campaigns.list({ limit: 50, after: "cur_abc" });
    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("limit=50");
    expect(url).toContain("after=cur_abc");
  });

  test("listAll walks every page and yields individual campaigns", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([campaign("cmp_1"), campaign("cmp_2")], "cur_page2"))
      .mockResolvedValueOnce(cursorPage([campaign("cmp_3")], null));

    const seen: string[] = [];
    for await (const item of client.campaigns.listAll({ limit: 2 })) {
      seen.push(item.id);
    }

    expect(seen).toEqual(["cmp_1", "cmp_2", "cmp_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    // The first request carries no cursor; the second carries the one page 1 returned.
    expect(getCall(fetchMock, 0).url).not.toContain("after=");
    expect(getCall(fetchMock, 1).url).toContain("after=cur_page2");
    // The caller's page size is preserved across the walk.
    expect(getCall(fetchMock, 1).url).toContain("limit=2");
  });

  test("listAll stops when has_more is false even if the server still sends a cursor", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: [campaign("cmp_1")], has_more: false, next_cursor: "cur_x" }),
    );

    const seen: string[] = [];
    for await (const item of client.campaigns.listAll()) seen.push(item.id);

    expect(seen).toEqual(["cmp_1"]);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  test("listAll stops rather than looping when the server repeats a cursor", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [campaign("cmp_1")], has_more: true, next_cursor: "cur_1" }));

    const seen: string[] = [];
    for await (const item of client.campaigns.listAll({ after: "cur_1" })) seen.push(item.id);

    expect(seen).toEqual(["cmp_1"]);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  test("a 404 problem document maps to SendlyNotFoundError carrying the registry code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(404, {
        type: "https://docs.sendly.now/errors/resource_not_found",
        title: "Resource not found",
        detail: "No campaign with id cmp_missing.",
        code: "resource_not_found",
        request_id: "req_404",
      }),
    );

    const error = await rejection<SendlyNotFoundError>(client.campaigns.get("cmp_missing"));
    expect(error).toBeInstanceOf(SendlyNotFoundError);
    expect(error.errorCode).toBe("resource_not_found");
    expect(error.message).toBe("No campaign with id cmp_missing.");
    expect(error.requestId).toBe("req_404");
  });

  test("a 409 problem document on send maps to SendlyConflictError", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(409, {
        type: "https://docs.sendly.now/errors/conflict",
        title: "Conflict",
        detail: "Campaign is already sending.",
        code: "conflict",
      }),
    );

    const error = await rejection<SendlyConflictError>(client.campaigns.send("cmp_1"));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("conflict");
  });
});
