import { describe, expect, test } from "vitest";
import { getCall, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";
import { SendlyPermissionError } from "../index";

const envelope = (data: unknown) => jsonResponse(200, { success: true, data });

describe("projects: audit log, security and setup state (legacy /api/projects)", () => {
  test("getAuditLog maps action and cursor onto the query", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      envelope({ data: [{ action: "contact.purge" }], total: 1, cursor: "x", hasMore: true }),
    );

    const result = await client.projects.getAuditLog({ action: "contact.", limit: 10, cursor: "y" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/audit-log?action=contact.&limit=10&cursor=y");
    expect(init.method).toBe("GET");
    expect(result.data).toEqual([{ action: "contact.purge" }]);
    expect(result.total).toBe(1);
  });

  test("listAllAuditLog walks the log on `cursor`", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(envelope({ data: [{ id: 1 }], cursor: "n1", hasMore: true }))
      .mockResolvedValueOnce(envelope({ data: [{ id: 2 }], hasMore: false }));

    const seen: unknown[] = [];
    for await (const entry of client.projects.listAllAuditLog()) seen.push(entry);

    expect(seen).toEqual([{ id: 1 }, { id: 2 }]);
    expect(getCall(fetchMock, 1).url).toBe("http://localhost/api/audit-log?cursor=n1");
  });

  test("getSecurity and getSetupState take the project id in the path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ suspended: false }));

    const security = await client.projects.getSecurity("p1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/projects/p1/security");
    expect(security).toEqual({ suspended: false });

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(envelope({ hasVerifiedDomain: true, contactCount: 3 }));
    const setup = await client.projects.getSetupState("p1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/projects/p1/setup-state");
    expect(setup.hasVerifiedDomain).toBe(true);
  });

  test("a project the key cannot reach is a typed permission error", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(problemResponse(403, { type: "about:blank", title: "Forbidden", code: "forbidden" }));
    expect(await rejection(client.projects.getSecurity("other"))).toBeInstanceOf(SendlyPermissionError);
  });
});
