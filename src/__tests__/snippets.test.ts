import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

const SNIPPET = {
  id: "snp_1",
  projectId: "prj_1",
  name: "footer",
  description: null,
  body: "<p>Unsubscribe</p>",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("snippets resource", () => {
  test("create POSTs /api/snippets and unwraps the envelope to the record", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: SNIPPET }));

    const created = await client.snippets.create({ name: "footer", body: "<p>Unsubscribe</p>" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/snippets");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ name: "footer", body: "<p>Unsubscribe</p>" });
    // Legacy dialect: the caller gets the record, never the `{ success, data }` wrapper.
    expect(created).toEqual(SNIPPET);
  });

  test("list serializes limit, cursor and search", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { data: [], total: 0, hasMore: false } }));

    await client.snippets.list({ limit: 25, cursor: "snp_50", search: "footer" });

    const { url, init } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/snippets?");
    expect(url).toContain("limit=25");
    expect(url).toContain("cursor=snp_50");
    expect(url).toContain("search=footer");
    expect(init.method).toBe("GET");
  });

  test("list keeps the envelope — the legacy list response is `{ success, data: { data, total, hasMore } }`", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, data: { data: [SNIPPET], total: 1, cursor: "snp_1", hasMore: true } }),
    );

    const response = await client.snippets.list();

    expect(response.success).toBe(true);
    expect(response.data.total).toBe(1);
    expect(response.data.hasMore).toBe(true);
    expect(response.data.data[0]?.name).toBe("footer");
  });

  test("get unwraps to the record at the id path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: SNIPPET }));

    const snippet = await client.snippets.get("snp_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/snippets/snp_1");
    expect(getCall(fetchMock).init.method).toBe("GET");
    expect(snippet.body).toBe("<p>Unsubscribe</p>");
  });

  test("update PATCHes and unwraps", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { ...SNIPPET, name: "footer_v2" } }));

    const updated = await client.snippets.update("snp_1", { name: "footer_v2" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/snippets/snp_1");
    expect(init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ name: "footer_v2" });
    expect(updated.name).toBe("footer_v2");
  });

  test("delete sends DELETE and resolves void on 200 { success, data: { id } }", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "snp_1" } }));

    await expect(client.snippets.delete("snp_1")).resolves.toBeUndefined();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/snippets/snp_1");
    expect(init.method).toBe("DELETE");
  });

  test("create throws SendlyConflictError when the name is already taken", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { message: "snippet name already exists", code: "conflict" } }),
    );

    await expect(client.snippets.create({ name: "footer", body: "x" })).rejects.toBeInstanceOf(SendlyConflictError);
  });
});
