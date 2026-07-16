import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import { getCall, jsonResponse, makeClient } from "./helpers";

describe("templates resource", () => {
  test("create POSTs /api/templates", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: { id: "t_1" } }));
    await client.templates.create({
      name: "Welcome",
      subject: "Welcome",
      body: "<p>hi</p>",
      from: "a@b.com",
      type: "MARKETING",
    });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/templates");
  });

  test("list serializes limit + cursor", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.templates.list({ limit: 25, cursor: "c_abc" });
    const { url } = getCall(fetchMock);
    expect(url).toContain("limit=25");
    expect(url).toContain("cursor=c_abc");
  });

  test("update PATCHes", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "t_1" } }));
    await client.templates.update("t_1", { name: "New name" });
    expect(getCall(fetchMock).init.method).toBe("PATCH");
  });

  test("delete sends DELETE and resolves void on 200 { success, data: { id } }", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "t_1" } }));
    await expect(client.templates.delete("t_1")).resolves.toBeUndefined();
    expect(getCall(fetchMock).init.method).toBe("DELETE");
  });

  test("delete throws SendlyConflictError on 409", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(409, { error: { message: "template in use", code: "conflict" } }));
    await expect(client.templates.delete("t_1")).rejects.toBeInstanceOf(SendlyConflictError);
  });
});
