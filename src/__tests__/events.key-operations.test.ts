import { describe, expect, test } from "vitest";
import { getCall, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";
import { SendlyNotFoundError } from "../index";

const envelope = (data: unknown) => jsonResponse(200, { success: true, data });

describe("events: names and per-contact history (legacy /api/events)", () => {
  test("delete DELETEs the encoded event name", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ deleted: 12 }));

    const result = await client.events.delete("user signed/up");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/events/user%20signed%2Fup");
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({ deleted: 12 });
  });

  test("getUsage GETs /usage and resolves the unwrapped report", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ workflows: [{ id: "w1" }], segments: [] }));

    const usage = await client.events.getUsage("signup");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/events/signup/usage");
    expect(init.method).toBe("GET");
    expect(usage.workflows).toEqual([{ id: "w1" }]);
  });

  test("listForContact maps limit to the query and resolves { events }", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ events: [{ name: "signup" }] }));

    const result = await client.events.listForContact("c1", { limit: 25 });

    expect(getCall(fetchMock).url).toBe("http://localhost/api/events/contact/c1?limit=25");
    expect(result.events).toHaveLength(1);
  });

  test("an unknown contact is a typed not-found", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(problemResponse(404, { type: "about:blank", title: "Not Found", code: "not_found" }));
    expect(await rejection(client.events.listForContact("missing"))).toBeInstanceOf(SendlyNotFoundError);
  });
});
