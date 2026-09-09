import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import type { TemplateV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

function templateV1(id: string): TemplateV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, name: `Template ${id}`, email_category: "MARKETING", version: 1 } as unknown as TemplateV1;
}

describe("templates resource", () => {
  test("create POSTs /api/templates", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: { id: "t_1" } }));
    await client.templates.create({
      name: "Welcome",
      subject: "Welcome",
      body: "<p>hi</p>",
      from: "a@b.com",
      // `emailCategory` since 1.1. `type` said nothing about which of a template's
      // several kinds it named, and the column it maps to was never called `type`.
      emailCategory: "MARKETING",
    });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/templates");
    expect(getCallBody(fetchMock)).toMatchObject({ emailCategory: "MARKETING" });
  });

  test("list serializes limit + cursor", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.templates.list({ limit: 25, cursor: "c_abc" });
    const { url } = getCall(fetchMock);
    expect(url).toContain("limit=25");
    expect(url).toContain("cursor=c_abc");
  });

  test("list filters on emailCategory, the 1.1 name for the old `type` param", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.templates.list({ emailCategory: "SELF_MANAGED_UNSUBSCRIBE" });
    const { url } = getCall(fetchMock);
    expect(url).toContain("emailCategory=SELF_MANAGED_UNSUBSCRIBE");
    expect(url).not.toContain("type=");
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

describe("templates resource (/api/v1)", () => {
  test("createV1 POSTs /api/v1/templates and resolves the bare template", async () => {
    const { client, fetchMock } = makeClient();
    const created = templateV1("tpl_1");
    fetchMock.mockResolvedValue(jsonResponse(201, created));

    const result = await client.templates.createV1({
      name: "Welcome",
      subject: "Welcome",
      body: "<p>hi</p>",
      from: "a@b.com",
      email_category: "TRANSACTIONAL",
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/templates");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({
      name: "Welcome",
      subject: "Welcome",
      body: "<p>hi</p>",
      from: "a@b.com",
      email_category: "TRANSACTIONAL",
    });
    // v1 answers a bare body — nothing is unwrapped out of a `{ success, data }` envelope.
    expect(result).toEqual(created);
  });

  test("getV1 hands back the whole bare body rather than an envelope's `data`", async () => {
    const { client, fetchMock } = makeClient();
    const body = templateV1("tpl_1");
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    const result = await client.templates.getV1("tpl_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/templates/tpl_1");
    expect(getCall(fetchMock).init.method).toBe("GET");
    expect(result).toEqual(body);
    expect(result.email_category).toBe("MARKETING");
  });

  test("updateV1 PATCHes the id path with only the fields sent", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, templateV1("tpl_1")));

    await client.templates.updateV1("tpl_1", { email_category: "SELF_MANAGED_UNSUBSCRIBE" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/templates/tpl_1");
    expect(init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ email_category: "SELF_MANAGED_UNSUBSCRIBE" });
  });

  test("deleteV1 resolves the { id, deleted } acknowledgement the legacy delete discards", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "tpl_1", deleted: true }));

    const deleted = await client.templates.deleteV1("tpl_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/templates/tpl_1");
    expect(getCall(fetchMock).init.method).toBe("DELETE");
    expect(deleted).toEqual({ id: "tpl_1", deleted: true });
  });

  test("deleteV1 surfaces the RFC 9457 conflict raised by a template still in use", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(409, {
        type: "https://docs.sendly.now/errors/conflict",
        title: "Conflict",
        detail: "Template is referenced by 1 scheduled campaign.",
        code: "conflict",
        request_id: "req_tpl_conflict",
      }),
    );

    const error = await rejection<SendlyConflictError>(client.templates.deleteV1("tpl_1"));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.requestId).toBe("req_tpl_conflict");
  });

  test("listV1 serializes the cursor params and the snake_case category filter", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));

    await client.templates.listV1({ limit: 5, after: "cur_tpl", search: "welcome", email_category: "MARKETING" });

    const { url, init } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/v1/templates?");
    expect(init.method).toBe("GET");
    expect(url).toContain("limit=5");
    expect(url).toContain("after=cur_tpl");
    expect(url).toContain("search=welcome");
    expect(url).toContain("email_category=MARKETING");
  });

  test("listV1 returns the cursor envelope untouched", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([templateV1("tpl_1")], "cur_2"));

    const page = await client.templates.listV1();

    expect(page.next_cursor).toBe("cur_2");
    expect(page.has_more).toBe(true);
    expect(page.data).toEqual([templateV1("tpl_1")]);
  });

  test("listAllV1 walks both pages, forwards the cursor, and stops on the last one", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([templateV1("tpl_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([templateV1("tpl_2"), templateV1("tpl_3")], null));

    const seen: string[] = [];
    for await (const item of client.templates.listAllV1({ email_category: "MARKETING" })) seen.push(item.id);

    expect(seen).toEqual(["tpl_1", "tpl_2", "tpl_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).toContain("email_category=MARKETING");
  });
});
