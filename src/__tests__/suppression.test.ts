import { describe, expect, test } from "vitest";
import { SendlyNotFoundError, SendlyServerError } from "../index";
import type { SuppressionV1 } from "../types";
import {
  cursorPage,
  emptyResponse,
  getCall,
  getCallBody,
  jsonResponse,
  makeClient,
  problemResponse,
  rejection,
} from "./helpers";

function suppressionV1(email: string): SuppressionV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { email, reason: "MANUAL", source: "API", created_at: "2026-01-01T00:00:00.000Z" } as unknown as SuppressionV1;
}

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

describe("suppression resource (/api/v1)", () => {
  test("createV1 POSTs the plural /api/v1/suppressions path and resolves the bare record", async () => {
    const { client, fetchMock } = makeClient();
    const created = suppressionV1("spam@x.com");
    fetchMock.mockResolvedValue(jsonResponse(201, created));

    const result = await client.suppression.createV1({ email: "spam@x.com", reason: "COMPLAINT" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/suppressions");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ email: "spam@x.com", reason: "COMPLAINT" });
    // v1 answers a bare body — nothing is unwrapped out of a `{ success, data }` envelope.
    expect(result).toEqual(created);
  });

  test("getV1 percent-encodes the address, so a `+` stays part of the local part", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, suppressionV1("user+tag@example.com")));

    await client.suppression.getV1("user+tag@example.com");

    // `+` must survive as %2B; an encoder that leaves it raw addresses a space instead.
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/suppressions/user%2Btag%40example.com");
    expect(getCall(fetchMock).init.method).toBe("GET");
  });

  test("getV1 hands back the whole bare body rather than an envelope's `data`", async () => {
    const { client, fetchMock } = makeClient();
    const body = suppressionV1("spam@x.com");
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    const result = await client.suppression.getV1("spam@x.com");

    expect(result).toEqual(body);
    expect(result.reason).toBe("MANUAL");
  });

  test("getV1 on an address that is not suppressed rejects with 404, the definite negative answer", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(404, {
        type: "https://docs.sendly.now/errors/resource_not_found",
        title: "Not Found",
        detail: "No suppression record for clean@example.com.",
        code: "resource_not_found",
        request_id: "req_sup_404",
      }),
    );

    const error = await rejection<SendlyNotFoundError>(client.suppression.getV1("clean@example.com"));
    expect(error).toBeInstanceOf(SendlyNotFoundError);
    expect(error.requestId).toBe("req_sup_404");
  });

  test("deleteV1 encodes the address and resolves the { email, deleted } acknowledgement", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { email: "user+tag@example.com", deleted: true }));

    const deleted = await client.suppression.deleteV1("user+tag@example.com");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/suppressions/user%2Btag%40example.com");
    expect(init.method).toBe("DELETE");
    expect(deleted).toEqual({ email: "user+tag@example.com", deleted: true });
  });

  test("listV1 serializes the cursor params and the reason filter", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));

    await client.suppression.listV1({ limit: 5, after: "cur_sup", reason: "HARD_BOUNCE" });

    const { url, init } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/v1/suppressions?");
    expect(init.method).toBe("GET");
    expect(url).toContain("limit=5");
    expect(url).toContain("after=cur_sup");
    expect(url).toContain("reason=HARD_BOUNCE");
  });

  test("listV1 returns the cursor envelope untouched", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([suppressionV1("spam@x.com")], "cur_2"));

    const page = await client.suppression.listV1();

    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toBe("cur_2");
    expect(page.data).toEqual([suppressionV1("spam@x.com")]);
  });

  test("listAllV1 walks both pages, forwards the cursor, and stops on the last one", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([suppressionV1("one@x.com")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([suppressionV1("two@x.com"), suppressionV1("three@x.com")], null));

    const seen: string[] = [];
    for await (const item of client.suppression.listAllV1({ reason: "COMPLAINT" })) seen.push(item.email);

    expect(seen).toEqual(["one@x.com", "two@x.com", "three@x.com"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).toContain("reason=COMPLAINT");
  });
});
