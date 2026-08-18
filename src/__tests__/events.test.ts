import { describe, expect, test } from "vitest";
import { SendlyNotFoundError, SendlyServerError } from "../index";
import type { EventV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

const receipt = { contact: "c_1", event: "ev_1", timestamp: "2026-01-01T00:00:00.000Z" };

function event(id: string): EventV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, name: "user.signup", contact_id: "ct_1" } as unknown as EventV1;
}

describe("events resource (legacy /api/track)", () => {
  test("track POSTs /api/track with the event body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: receipt }));
    const result = await client.events.track({ event: "signup", email: "user@example.com" });
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/track");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toMatchObject({ event: "signup", email: "user@example.com" });
    expect(result.contact).toBe("c_1");
  });

  test("track forwards optional subscribed + data payload", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: receipt }));
    await client.events.track({
      event: "purchase.completed",
      email: "user@example.com",
      subscribed: true,
      data: { plan: "pro", amount: 4900 },
    });
    expect(getCallBody(fetchMock)).toMatchObject({ subscribed: true, data: { plan: "pro", amount: 4900 } });
  });

  test("track throws SendlyServerError on 500", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(500, { error: { message: "oops", code: "server_error" } }));
    await expect(client.events.track({ event: "signup", email: "x@y.com" })).rejects.toBeInstanceOf(SendlyServerError);
  });
});

describe("events resource (/api/v1)", () => {
  test("record POSTs /api/v1/events and resolves the bare event — track stays on the legacy path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "ev_1", name: "user.signup", contact_id: "ct_1" }));

    // `data` takes arbitrary JSON — scalars included, not only nested objects.
    const recorded = await client.events.record({ name: "user.signup", contact_id: "ct_1", data: { plan: "pro" } });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/events");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ name: "user.signup", contact_id: "ct_1", data: { plan: "pro" } });
    // No envelope on v1 — the created event is the response body.
    expect(recorded.id).toBe("ev_1");
  });

  test("record sends no Idempotency-Key — events are append-only writes", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "ev_1" }));

    await client.events.record({ name: "user.signup" });

    expect((getCall(fetchMock).init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  test("list filters by event_name and serializes cursor params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([event("ev_1")], null));

    const page = await client.events.list({ event_name: "user.signup", limit: 100 });

    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("http://localhost/api/v1/events");
    expect(url).toContain("event_name=user.signup");
    expect(url).toContain("limit=100");
    expect(page.has_more).toBe(false);
  });

  test("listAll keeps the event_name filter fixed while paging", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([event("ev_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([event("ev_2"), event("ev_3")], null));

    const seen: string[] = [];
    for await (const item of client.events.listAll({ event_name: "user.signup" })) seen.push(item.id);

    expect(seen).toEqual(["ev_1", "ev_2", "ev_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 0).url).toContain("event_name=user.signup");
    expect(getCall(fetchMock, 1).url).toContain("event_name=user.signup");
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
  });

  test("listNames GETs the unpaginated name vocabulary", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { data: ["user.signup", "purchase.completed"] }));

    const names = await client.events.listNames();

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/events/names");
    expect(names.data).toEqual(["user.signup", "purchase.completed"]);
  });

  test("stats forwards the from/to window", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [{ name: "user.signup", count: 12 }],
        window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-18T00:00:00.000Z" },
      }),
    );

    const stats = await client.events.stats({ from: "2026-08-01T00:00:00.000Z" });

    expect(getCall(fetchMock).url).toContain("http://localhost/api/v1/events/stats");
    expect(getCall(fetchMock).url).toContain("from=2026-08-01");
    expect(stats.data[0]?.count).toBe(12);
  });

  test("recording an event for an unknown contact surfaces resource_not_found", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(404, {
        type: "https://docs.sendly.now/errors/resource_not_found",
        title: "Resource not found",
        detail: "No contact with id ct_missing.",
        code: "resource_not_found",
        request_id: "req_ev",
      }),
    );

    const error = await rejection<SendlyNotFoundError>(
      client.events.record({ name: "user.signup", contact_id: "ct_missing" }),
    );
    expect(error).toBeInstanceOf(SendlyNotFoundError);
    expect(error.errorCode).toBe("resource_not_found");
    expect(error.requestId).toBe("req_ev");
  });
});
