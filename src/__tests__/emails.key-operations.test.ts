import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

describe("emails.reschedule (PATCH /api/emails/{id})", () => {
  test("PATCHes the new send time and resolves the email", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "em1", status: "PENDING" } }));

    const result = await client.emails.reschedule("em1", { scheduledAt: "2026-12-01T09:00:00Z" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/emails/em1");
    expect(init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ scheduledAt: "2026-12-01T09:00:00Z" });
    expect(result.id).toBe("em1");
  });

  test("scheduledAt: null is sent as an explicit null, which means send now", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "em1" } }));
    await client.emails.reschedule("em1", { scheduledAt: null });
    expect(getCallBody(fetchMock)).toEqual({ scheduledAt: null });
  });

  test("an email that already left PENDING is a typed conflict", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(problemResponse(409, { type: "about:blank", title: "Conflict", code: "conflict" }));
    expect(await rejection(client.emails.reschedule("em1", { scheduledAt: null }))).toBeInstanceOf(SendlyConflictError);
  });
});
