import { describe, expect, test } from "vitest";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

describe("campaigns: duplicate and test send (legacy /api/campaigns)", () => {
  test("duplicate POSTs /duplicate and resolves the new draft", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { id: "cmp2", status: "DRAFT" },
        message: "Campaign duplicated successfully",
      }),
    );

    const draft = await client.campaigns.duplicate("cmp1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/campaigns/cmp1/duplicate");
    expect(init.method).toBe("POST");
    expect(draft).toEqual({ id: "cmp2", status: "DRAFT" });
  });

  test("sendTest POSTs the project member's address and resolves the confirmation", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, message: "Test email sent to me@example.com" }));

    const result = await client.campaigns.sendTest("cmp1", { email: "me@example.com" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/campaigns/cmp1/test");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ email: "me@example.com" });
    expect(result.message).toBe("Test email sent to me@example.com");
  });
});
