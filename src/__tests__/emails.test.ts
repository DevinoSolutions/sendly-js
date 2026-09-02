import { describe, expect, test } from "vitest";
import { SendlyValidationError } from "../index";
import { emptyResponse, getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

describe("emails resource (/api/v1 send)", () => {
  test("sendV1 POSTs /api/v1/emails and resolves the bare receipt with a status", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(202, { id: "em_1", status: "PENDING", to: "user@example.com", from: "hi@acme.com" }),
    );

    const receipt = await client.emails.sendV1({ to: "user@example.com", subject: "hi", body: "<p>hi</p>" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/emails");
    expect(init.method).toBe("POST");
    // The whole reason this exists: the legacy send reports no delivery status.
    expect(receipt.status).toBe("PENDING");
    expect(receipt.id).toBe("em_1");
  });

  test("sendV1 forwards an idempotency key like the other v1 writes", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(202, { id: "em_1", status: "PENDING", to: "user@example.com", from: "hi@acme.com" }),
    );

    await client.emails.sendV1({ to: "user@example.com" }, { idempotencyKey: "key-123" });

    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("key-123");
  });

  test("sendV1 leaves the legacy send() pointed at /api/emails", async () => {
    // Additive, not a migration: repointing send() would change what existing
    // callers receive, and that is a breaking change taken deliberately or not
    // at all. This test is what makes "additive" checkable rather than claimed.
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { emails: [], timestamp: "t" } }));

    await client.emails.send({ to: "user@example.com" });

    expect(getCall(fetchMock).url).toBe("http://localhost/api/emails");
  });

  test("sendTestV1 posts to the sandbox route and reports sandbox: true", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(202, {
        id: "em_t1",
        status: "PENDING",
        to: "sandbox.proj_1@sendly.now",
        from: "hi@acme.com",
        sandbox: true,
      }),
    );

    const receipt = await client.emails.sendTestV1({ subject: "hi", body: "<p>hi</p>" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/emails/test");
    expect(getCallBody(fetchMock)).toEqual({ subject: "hi", body: "<p>hi</p>" });
    expect(init.method).toBe("POST");
    expect(receipt.sandbox).toBe(true);
  });
});

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
