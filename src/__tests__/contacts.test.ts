import { describe, expect, test } from "vitest";
import { SendlyNotFoundError } from "../index";
import { emptyResponse, getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

describe("contacts resource", () => {
  test("create POSTs /api/contacts and unwraps data", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: { id: "c_1", email: "x@y.com" } }));
    const result = await client.contacts.create({ email: "x@y.com", subscribed: true });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/contacts");
    expect((result as { id: string }).id).toBe("c_1");
  });

  test("upsert POSTs /api/contacts/upsert", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "c_2", email: "a@b.com" } }));
    await client.contacts.upsert({ email: "a@b.com", subscribed: true, customFields: { plan: "pro" } });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/contacts/upsert");
    expect(getCallBody(fetchMock)).toMatchObject({ email: "a@b.com", customFields: { plan: "pro" } });
  });

  test("list serializes search + cursor params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.contacts.list({ limit: 50, search: "foo", subscribed: "true" });
    const { url } = getCall(fetchMock);
    expect(url).toContain("limit=50");
    expect(url).toContain("search=foo");
    expect(url).toContain("subscribed=true");
  });

  test("update PATCHes /api/contacts/{id}", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "c_3", email: "a@b.com" } }));
    await client.contacts.update("c_3", { customFields: { plan: "enterprise" } });
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/c_3");
    expect(init.method).toBe("PATCH");
  });

  test("delete sends DELETE and resolves on 204", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(emptyResponse(204));
    await expect(client.contacts.delete("c_4")).resolves.toBeUndefined();
    expect(getCall(fetchMock).init.method).toBe("DELETE");
  });

  test("get throws SendlyNotFoundError on 404", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { message: "no such contact", code: "not_found" } }));
    await expect(client.contacts.get("c_missing")).rejects.toBeInstanceOf(SendlyNotFoundError);
  });

  test("bulkCreate POSTs /api/contacts/bulk", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { created: 2 } }));
    await client.contacts.bulkCreate({
      contacts: [
        { email: "a@b.com", subscribed: true },
        { email: "b@c.com", subscribed: true },
      ],
    });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/contacts/bulk");
  });

  test("bulkDelete DELETEs /api/contacts/bulk with body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { deleted: 1 } }));
    await client.contacts.bulkDelete({ emails: ["a@b.com"] });
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/bulk");
    expect(init.method).toBe("DELETE");
  });
});
