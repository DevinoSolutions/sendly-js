import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient, rejection } from "./helpers";

describe("lists resource (legacy /api)", () => {
  test("subscribe POSTs /api/lists/{id}/subscribe and unwraps the envelope to data", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { membershipId: "mem_1", status: "CONFIRMED", created: true, previousStatus: null },
      }),
    );

    const result = await client.lists.subscribe("lst_1", {
      email: "user@example.com",
      data: { firstName: "Ada" },
      allowResubscribe: true,
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/lists/lst_1/subscribe");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toMatchObject({ email: "user@example.com", allowResubscribe: true });
    // Legacy dialect: the `{ success, data }` envelope is unwrapped to `data`.
    expect(result).toEqual({ membershipId: "mem_1", status: "CONFIRMED", created: true, previousStatus: null });
  });

  test("a double-opt-in list yields PENDING plus the confirmToken the caller must deliver", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          membershipId: "mem_2",
          status: "PENDING",
          created: true,
          previousStatus: null,
          confirmToken: "tok_abc",
        },
      }),
    );

    const result = await client.lists.subscribe("lst_1", { email: "user@example.com" });

    // Sendly does not send the confirmation email — the caller delivers
    // /api/lists/confirm?token=<confirmToken> to the contact.
    expect(result.status).toBe("PENDING");
    expect(result.confirmToken).toBe("tok_abc");
  });

  test("subscribe accepts just an email — allowResubscribe defaults to false server-side", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.lists.subscribe("lst_1", { email: "user@example.com" });
    expect(getCallBody(fetchMock)).toEqual({ email: "user@example.com" });
  });

  test("unsubscribe POSTs /api/lists/{id}/unsubscribe and unwraps to the echoed address", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { email: "user@example.com" } }));

    const result = await client.lists.unsubscribe("lst_1", { email: "user@example.com" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/lists/lst_1/unsubscribe");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ email: "user@example.com" });
    expect(result).toEqual({ email: "user@example.com" });
  });

  test("list ids are URL-encoded into the path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.lists.subscribe("a/b", { email: "user@example.com" });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/lists/a%2Fb/subscribe");
  });

  test("re-subscribing an opted-out address 409s unless allowResubscribe is set", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        success: false,
        error: { message: "Contact previously unsubscribed", code: "RESUBSCRIBE_CONFIRMATION_REQUIRED" },
      }),
    );

    const error = await rejection<SendlyConflictError>(client.lists.subscribe("lst_1", { email: "user@example.com" }));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("RESUBSCRIBE_CONFIRMATION_REQUIRED");
  });
});
