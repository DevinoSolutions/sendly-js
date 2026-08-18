import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient, rejection } from "./helpers";

describe("lists resource (legacy /api)", () => {
  test("subscribe POSTs /api/lists/{id}/subscribe with the contact body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { subscribed: true } }));

    const result = await client.lists.subscribe("lst_1", {
      email: "user@example.com",
      data: { firstName: "Ada" },
      allowResubscribe: true,
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/lists/lst_1/subscribe");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toMatchObject({ email: "user@example.com", allowResubscribe: true });
    // Legacy dialect: the `{ success, data }` envelope is returned as-is here.
    expect(result.success).toBe(true);
  });

  test("subscribe accepts just an email — allowResubscribe defaults to false server-side", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.lists.subscribe("lst_1", { email: "user@example.com" });
    expect(getCallBody(fetchMock)).toEqual({ email: "user@example.com" });
  });

  test("unsubscribe POSTs /api/lists/{id}/unsubscribe", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { unsubscribed: true } }));

    await client.lists.unsubscribe("lst_1", { email: "user@example.com" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/lists/lst_1/unsubscribe");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ email: "user@example.com" });
  });

  test("list ids are URL-encoded into the path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.lists.subscribe("a/b", { email: "user@example.com" });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/lists/a%2Fb/subscribe");
  });

  test("a legacy envelope error still maps to the matching error subclass", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(409, { success: false, error: { message: "already subscribed", code: "CONFLICT" } }),
    );

    const error = await rejection<SendlyConflictError>(client.lists.subscribe("lst_1", { email: "user@example.com" }));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("CONFLICT");
  });
});
