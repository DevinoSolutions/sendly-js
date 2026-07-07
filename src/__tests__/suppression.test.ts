import { describe, expect, test } from "vitest";
import { SendlyServerError } from "../index";
import { emptyResponse, getCall, jsonResponse, makeClient } from "./helpers";

describe("suppression resource", () => {
  test("add POSTs /api/suppression", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: { id: "s_1", email: "spam@x.com" } }));
    await client.suppression.add({ email: "spam@x.com", reason: "MANUAL" });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/suppression");
  });

  test("list serializes reason filter", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.suppression.list({ reason: "MANUAL", limit: 100 });
    const { url } = getCall(fetchMock);
    expect(url).toContain("reason=MANUAL");
    expect(url).toContain("limit=100");
  });

  test("get encodes email path segment", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { suppressed: false } }));
    await client.suppression.get("user+tag@example.com");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/suppression/user%2Btag%40example.com");
  });

  test("remove DELETEs and resolves on 204", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(emptyResponse(204));
    await expect(client.suppression.remove("a@b.com")).resolves.toBeUndefined();
    expect(getCall(fetchMock).init.method).toBe("DELETE");
  });

  test("add throws SendlyServerError on 500", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(500, { error: { message: "oops", code: "server_error" } }));
    await expect(client.suppression.add({ email: "x@y.com", reason: "MANUAL" })).rejects.toBeInstanceOf(
      SendlyServerError,
    );
  });
});
