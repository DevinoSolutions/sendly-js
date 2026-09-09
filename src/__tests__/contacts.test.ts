import { describe, expect, test } from "vitest";
import { SendlyNotFoundError } from "../index";
import type { ContactV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

function contactV1(id: string): ContactV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, email: `${id}@example.com`, subscribed: true } as unknown as ContactV1;
}

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

  test("delete sends DELETE and resolves void on 200 { success, data: { id } }", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { id: "c_4" } }));
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

describe("contacts resource (/api/v1)", () => {
  test("createV1 POSTs /api/v1/contacts and resolves the bare body, unwrapping nothing", async () => {
    const { client, fetchMock } = makeClient();
    const body = {
      id: "con_1",
      email: "x@y.com",
      subscribed: true,
      custom_fields: { plan: "pro" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(201, body));

    const created = await client.contacts.createV1({ email: "x@y.com", custom_fields: { plan: "pro" } });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/contacts");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ email: "x@y.com", custom_fields: { plan: "pro" } });
    // v1 answers a bare body: the whole document reaches the caller, `data` and all.
    expect(created).toEqual(body);
  });

  test("createV1 accepts just an email — `subscribed` defaults server-side", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, contactV1("con_1")));
    await client.contacts.createV1({ email: "x@y.com" });
    expect(getCallBody(fetchMock)).toEqual({ email: "x@y.com" });
  });

  test("getV1, updateV1 and deleteV1 build the right verb and path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "con_1", deleted: true }));

    await client.contacts.getV1("con_1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/contacts/con_1");
    expect(getCall(fetchMock).init.method).toBe("GET");

    fetchMock.mockClear();
    await client.contacts.updateV1("con_1", { custom_fields: { plan: "enterprise" } });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/contacts/con_1");
    expect(getCall(fetchMock).init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ custom_fields: { plan: "enterprise" } });

    fetchMock.mockClear();
    const deleted = await client.contacts.deleteV1("con_1");
    expect(getCall(fetchMock).init.method).toBe("DELETE");
    // Unlike the legacy delete, the acknowledgement is resolved rather than discarded.
    expect(deleted).toEqual({ id: "con_1", deleted: true });
  });

  test("listV1 serializes the search, subscribed and cursor params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));

    await client.contacts.listV1({ limit: 10, after: "cur_con", search: "ada", subscribed: "false" });

    const { url } = getCall(fetchMock);
    expect(url).toContain("/api/v1/contacts?");
    expect(url).toContain("limit=10");
    expect(url).toContain("after=cur_con");
    expect(url).toContain("search=ada");
    expect(url).toContain("subscribed=false");
  });

  test("listV1 resolves the cursor envelope itself, not just its rows", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([contactV1("con_1")], "cur_2"));

    const page = await client.contacts.listV1();

    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toBe("cur_2");
    expect(page.data[0]?.email).toBe("con_1@example.com");
  });

  test("listAllV1 walks every page and yields individual contacts", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([contactV1("con_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([contactV1("con_2"), contactV1("con_3")], null));

    const seen: string[] = [];
    for await (const contact of client.contacts.listAllV1({ search: "ada" })) seen.push(contact.id);

    expect(seen).toEqual(["con_1", "con_2", "con_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    // The filter is carried forward with the cursor — the cursor encodes it.
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).toContain("search=ada");
  });

  test("topicPreferences GETs the contact's topics sub-path", async () => {
    const { client, fetchMock } = makeClient();
    const preferences = {
      contact_id: "con_1",
      subscribed: false,
      topics: [{ topic_id: "top_1", key: "product-news", name: "Product news", subscribed: true, pending: false }],
    };
    fetchMock.mockResolvedValue(jsonResponse(200, preferences));

    const result = await client.contacts.topicPreferences("con_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/contacts/con_1/topics");
    expect(init.method).toBe("GET");
    // The global opt-out outranks the per-topic answers; both must survive the trip.
    expect(result.subscribed).toBe(false);
    expect(result.topics[0]?.key).toBe("product-news");
  });

  test("contact ids are URL-encoded into every v1 path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, contactV1("a/b")));
    await client.contacts.getV1("a/b");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/contacts/a%2Fb");
  });

  test("getV1 surfaces a 404 problem document as SendlyNotFoundError", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { message: "no such contact", code: "not_found" } }));
    await expect(client.contacts.getV1("con_missing")).rejects.toBeInstanceOf(SendlyNotFoundError);
  });
});
