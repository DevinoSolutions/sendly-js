import { describe, expect, test } from "vitest";
import { SendlyPermissionError } from "../index";
import { getCall, jsonResponse, makeClient } from "./helpers";

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
