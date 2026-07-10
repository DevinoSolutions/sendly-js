import { describe, expect, test } from "vitest";
import { SendlyServerError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

const receipt = { contact: "c_1", event: "ev_1", timestamp: "2026-01-01T00:00:00.000Z" };

describe("events resource", () => {
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
