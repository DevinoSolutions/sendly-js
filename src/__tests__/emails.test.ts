import { describe, expect, test } from "vitest";
import { SendlyValidationError } from "../index";
import { emptyResponse, getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

describe("emails resource", () => {
  test("send POSTs /api/emails with bearer + body, unwrapping { emails, timestamp }", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          emails: [{ contact: { id: "ct_1", email: "c@d.com" }, email: "em_1" }],
          timestamp: "2026-07-18T00:00:00.000Z",
        },
      }),
    );
    const result = await client.emails.send({
      from: "a@b.com",
      to: "c@d.com",
      subject: "hi",
      body: "<p>hi</p>",
    });
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(getCallBody(fetchMock)).toMatchObject({ from: "a@b.com", subject: "hi" });
    // Response is unwrapped to `data`: one `emails[]` entry per recipient plus a timestamp.
    expect(result.timestamp).toBe("2026-07-18T00:00:00.000Z");
    expect(result.emails).toHaveLength(1);
    // `emails[i].email` is the queued email-record id for recipient `i`.
    expect(result.emails[0]).toEqual({ contact: { id: "ct_1", email: "c@d.com" }, email: "em_1" });
  });

  test("send forwards Idempotency-Key header when given", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          emails: [{ contact: { id: "ct_2", email: "c@d.com" }, email: "em_2" }],
          timestamp: "2026-07-18T00:00:00.000Z",
        },
      }),
    );
    await client.emails.send(
      { from: "a@b.com", to: "c@d.com", subject: "hi", body: "<p>hi</p>" },
      { idempotencyKey: "idem-123" },
    );
    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("idem-123");
  });

  test("send omits Idempotency-Key header when not given", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          emails: [{ contact: { id: "ct_3", email: "c@d.com" }, email: "em_3" }],
          timestamp: "2026-07-18T00:00:00.000Z",
        },
      }),
    );
    await client.emails.send({ from: "a@b.com", to: "c@d.com", subject: "hi", body: "<p>hi</p>" });
    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  test("send throws SendlyValidationError on 400", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "bad email", code: "invalid_body" } }));
    await expect(client.emails.send({ from: "a", to: "b", subject: "x", body: "y" })).rejects.toBeInstanceOf(
      SendlyValidationError,
    );
  });

  test("list serializes query params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.emails.list({ limit: 5, tag: "newsletter", status: "DELIVERED" });
    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("limit=5");
    expect(url).toContain("tag=newsletter");
    expect(url).toContain("status=DELIVERED");
  });

  test("get builds /api/emails/{id}", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.emails.get("em_42");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/emails/em_42");
  });

  test("cancelSchedule DELETEs /api/emails/{id}/schedule", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await client.emails.cancelSchedule("em_42");
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/emails/em_42/schedule");
    expect(init.method).toBe("DELETE");
  });

  test("batch POSTs /api/emails/batch", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { results: [] } }));
    await client.emails.batch({
      emails: [{ from: "a@b.com", to: "c@d.com", subject: "s", body: "h" }],
    });
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/emails/batch");
    expect(init.method).toBe("POST");
  });

  test("cancelSchedule supports 204 No Content", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(emptyResponse(204));
    await expect(client.emails.cancelSchedule("em_x")).resolves.toBeUndefined();
  });
});
