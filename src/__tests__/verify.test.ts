import { describe, expect, test } from "vitest";
import { SendlyValidationError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

describe("verify resource", () => {
  test("email POSTs /api/verify with the email body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { email: "user@example.com", valid: true } }));
    const result = await client.verify.email({ email: "user@example.com" });
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/verify");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toMatchObject({ email: "user@example.com" });
    expect(result.data.valid).toBe(true);
  });

  test("email surfaces an invalid verdict in the response envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, data: { email: "nope@bad", valid: false, reason: "no_mx_records" } }),
    );
    const result = await client.verify.email({ email: "nope@bad" });
    expect(result.data.valid).toBe(false);
    expect(result.data.reason).toBe("no_mx_records");
  });

  test("email throws SendlyValidationError on 400", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "bad email", code: "invalid_body" } }));
    await expect(client.verify.email({ email: "x" })).rejects.toBeInstanceOf(SendlyValidationError);
  });
});
