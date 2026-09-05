import { describe, expect, test } from "vitest";
import { SendlyConflictError, SendlyPermissionError } from "../index";
import type { DomainV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

function domainV1(id: string): DomainV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return {
    id,
    domain: `${id}.example.com`,
    verified: true,
    dkim_verified: false,
    mail_from_domain_status: "Success",
  } as unknown as DomainV1;
}

describe("domains setup hand-off", () => {
  test("startSetup POSTs the dodomain-session route and returns the link verbatim", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          token: "tok_abc",
          connectUrl: "https://dodomain.com/connect?token=tok_abc",
          expiresAt: "2026-09-01T01:00:00.000Z",
        },
      }),
    );

    const session = await client.domains.startSetup("dom_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/domains/dom_1/dodomain-session");
    expect(init.method).toBe("POST");
    // Handed back as the route returns it — the caller opens `connectUrl`.
    expect(session.connectUrl).toBe("https://dodomain.com/connect?token=tok_abc");
    expect(session.token).toBe("tok_abc");
    expect(session.expiresAt).toBe("2026-09-01T01:00:00.000Z");
  });
});

describe("domains resource", () => {
  test("create POSTs /api/domains", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: { id: "d_1", name: "mail.example.com" } }));
    const result = await client.domains.create({ domain: "mail.example.com" });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/domains");
    expect((result as { id: string }).id).toBe("d_1");
  });

  test("list returns the envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { items: [] } }));
    await client.domains.list();
    expect(getCall(fetchMock).init.method).toBe("GET");
  });

  test("verify POSTs /api/domains/{id}/verify", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { status: "PENDING" } }));
    await client.domains.verify("d_1");
    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/domains/d_1/verify");
    expect(init.method).toBe("POST");
  });

  test("getVerification GETs /api/domains/{id}/verify", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { status: "VERIFIED" } }));
    await client.domains.getVerification("d_1");
    expect(getCall(fetchMock).init.method).toBe("GET");
  });

  test("throws SendlyPermissionError on 403", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(403, { error: { message: "pk key cannot create domains", code: "forbidden" } }),
    );
    await expect(client.domains.create({ domain: "x.com" })).rejects.toBeInstanceOf(SendlyPermissionError);
  });
});

describe("domains stream assignment (legacy)", () => {
  test("assignStream PATCHes /api/domains/{id} with the camelCase body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { id: "d_1", name: "mail.example.com", stream: "MARKETING", streamDefault: true },
      }),
    );

    await client.domains.assignStream("d_1", {
      stream: "MARKETING",
      streamDefault: true,
      defaultFromAddress: "news@mail.example.com",
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/domains/d_1");
    expect(init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({
      stream: "MARKETING",
      streamDefault: true,
      defaultFromAddress: "news@mail.example.com",
    });
  });

  test("assignStream unwraps the legacy envelope rather than resolving it whole", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, data: { id: "d_1", stream: null, streamDefault: false } }),
    );

    const domain = await client.domains.assignStream("d_1", { stream: null });

    // The `{ success, data }` wrapper is peeled off — the record itself resolves.
    expect(domain).toEqual({ id: "d_1", stream: null, streamDefault: false });
    expect(domain).not.toHaveProperty("success");
  });
});

describe("domains resource (/api/v1)", () => {
  test("createV1 POSTs /api/v1/domains and resolves the bare domain", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "dom_1", domain: "mail.example.com", verified: false }));

    const created = await client.domains.createV1({ domain: "mail.example.com", region: "eu-west-1" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/domains");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ domain: "mail.example.com", region: "eu-west-1" });
    // Nothing is verified until the DKIM records resolve.
    expect(created.verified).toBe(false);
  });

  test("v1 responses are bare bodies — no envelope is unwrapped", async () => {
    const { client, fetchMock } = makeClient();
    const body = { id: "dom_1", domain: "mail.example.com", verified: true, dkim_verified: false };
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    // A v1 body has no `data` key to unwrap, so unwrapping would lose the whole record.
    expect(await client.domains.getV1("dom_1")).toEqual(body);
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/domains/dom_1");
  });

  test("verifyV1 POSTs the v1 verify sub-path and answers the refreshed domain", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { id: "dom_1", domain: "mail.example.com", verified: true, dkim_verified: true }),
    );

    const refreshed = await client.domains.verifyV1("dom_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/domains/dom_1/verify");
    expect(init.method).toBe("POST");
    // It reports what SES now sees; it does not edit the domain's own fields.
    expect(init.body).toBeUndefined();
    expect(refreshed.verified).toBe(true);
    expect(refreshed.dkim_verified).toBe(true);
  });

  test("deleteV1 DELETEs the v1 path and resolves the deletion receipt", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "dom_1", deleted: true }));

    const deleted = await client.domains.deleteV1("dom_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/domains/dom_1");
    expect(init.method).toBe("DELETE");
    expect(deleted).toEqual({ id: "dom_1", deleted: true });
  });

  test("listV1 serializes cursor query params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));

    await client.domains.listV1({ limit: 10, after: "cur_dom" });

    const { url } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/v1/domains?");
    expect(url).toContain("limit=10");
    expect(url).toContain("after=cur_dom");
  });

  test("listAllV1 walks every page and yields individual domains", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([domainV1("dom_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([domainV1("dom_2"), domainV1("dom_3")], null));

    const seen: string[] = [];
    for await (const item of client.domains.listAllV1({ limit: 1 })) seen.push(item.id);

    expect(seen).toEqual(["dom_1", "dom_2", "dom_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).toContain("limit=1");
  });

  test("deleting a domain still sending mail surfaces the conflict code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(409, {
        type: "https://docs.sendly.now/errors/conflict",
        title: "Conflict",
        detail: "Domain is still used by 1 active campaign.",
        code: "conflict",
        request_id: "req_dom_conflict",
      }),
    );

    const error = await rejection<SendlyConflictError>(client.domains.deleteV1("dom_1"));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("conflict");
    expect(error.requestId).toBe("req_dom_conflict");
  });
});
