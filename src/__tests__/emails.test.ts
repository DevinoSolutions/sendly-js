import { describe, expect, test } from "vitest";
import { SendlyValidationError } from "../index";
import { emptyResponse, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

const V1_RECEIPT = { id: "em_1", status: "PENDING", to: "user@example.com", from: "hi@acme.com" };

describe("emails.send — the /api/v1 send is the default", () => {
  test("send POSTs /api/v1/emails and resolves the bare receipt with a delivery status", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, V1_RECEIPT));

    const receipt = await client.emails.send({ to: "user@example.com", subject: "hi", body: "<p>hi</p>" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(getCallBody(fetchMock)).toEqual({ to: "user@example.com", subject: "hi", body: "<p>hi</p>" });
    // The whole reason this is the default: the legacy send reports no delivery status.
    expect(receipt).toEqual(V1_RECEIPT);
    expect(receipt.status).toBe("PENDING");
  });

  test("send is the versioned send, not the legacy one — the 1.0 repoint, pinned", async () => {
    // 1.0 moved the default from the legacy `/api/emails` (row ids, no status,
    // array `to` fanned out) to `/api/v1/emails`. The legacy behaviour lives on
    // as sendLegacy(); this is what keeps the two from being swapped back
    // quietly.
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, V1_RECEIPT));

    await client.emails.send({ to: "user@example.com" });

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/emails");
  });

  test("send forwards an idempotency key like the other v1 writes", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, V1_RECEIPT));

    await client.emails.send({ to: "user@example.com" }, { idempotencyKey: "key-123" });

    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("key-123");
  });

  test("send omits the Idempotency-Key header when not given", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, V1_RECEIPT));

    await client.emails.send({ to: "user@example.com" });

    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  test("send surfaces a v1 422 problem document as SendlyValidationError with field errors", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(422, {
        type: "https://docs.sendly.now/errors/validation_error",
        title: "Validation error",
        code: "validation_error",
        request_id: "req_1",
        errors: [{ pointer: "/to", code: "invalid", message: "not an email" }],
      }),
    );

    const error = await rejection<SendlyValidationError>(client.emails.send({ to: "nope" }));
    expect(error).toBeInstanceOf(SendlyValidationError);
    expect(error.errorCode).toBe("validation_error");
    expect(error.requestId).toBe("req_1");
    expect(error.fieldErrors).toEqual([{ pointer: "/to", code: "invalid", message: "not an email" }]);
  });
});

describe("emails.sendLegacy — the pre-1.0 send, kept as the escape hatch", () => {
  test("sendLegacy POSTs /api/emails with bearer + body, unwrapping { emails, timestamp }", async () => {
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
    const result = await client.emails.sendLegacy({
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

  test("sendLegacy forwards Idempotency-Key header when given", async () => {
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
    await client.emails.sendLegacy(
      { from: "a@b.com", to: "c@d.com", subject: "hi", body: "<p>hi</p>" },
      { idempotencyKey: "idem-123" },
    );
    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("idem-123");
  });

  test("sendLegacy omits Idempotency-Key header when not given", async () => {
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
    await client.emails.sendLegacy({ from: "a@b.com", to: "c@d.com", subject: "hi", body: "<p>hi</p>" });
    const headers = getCall(fetchMock).init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  test("sendLegacy throws SendlyValidationError on a legacy 400 envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "bad email", code: "invalid_body" } }));
    await expect(client.emails.sendLegacy({ from: "a", to: "b", subject: "x", body: "y" })).rejects.toBeInstanceOf(
      SendlyValidationError,
    );
  });
});

describe("emails.sendTest", () => {
  test("sendTest posts to the sandbox route and reports sandbox: true", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(202, {
        id: "em_t1",
        status: "PENDING",
        to: "owner@acme.com",
        from: "sandbox.proj_1@sendly.now",
        sandbox: true,
      }),
    );

    const receipt = await client.emails.sendTest({ subject: "hi", body: "<p>hi</p>" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/emails/test");
    expect(getCallBody(fetchMock)).toEqual({ subject: "hi", body: "<p>hi</p>" });
    expect(init.method).toBe("POST");
    expect(receipt.sandbox).toBe(true);
  });
});

describe("emails resource — the rest of the legacy surface", () => {
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
