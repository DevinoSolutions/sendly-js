import { describe, expect, test } from "vitest";
import { getCall, jsonResponse, makeClient } from "./helpers";

const page = (data: unknown[], cursor: string | undefined) =>
  jsonResponse(200, { success: true, data: { data, cursor, hasMore: cursor !== undefined } });

describe("lists: members (legacy /api/lists, { data, cursor, hasMore })", () => {
  test("listMembers maps status, limit and cursor onto the query", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(page([{ id: "m1" }], "m1"));

    const result = await client.lists.listMembers("l1", { status: "SUBSCRIBED", limit: 50, cursor: "m0" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/lists/l1/members?status=SUBSCRIBED&limit=50&cursor=m0");
    expect(init.method).toBe("GET");
    expect(result.data).toEqual([{ id: "m1" }]);
    expect(result.cursor).toBe("m1");
    expect(result.hasMore).toBe(true);
  });

  test("listAllMembers pages on `cursor` until hasMore is false", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(page([{ id: "m1" }, { id: "m2" }], "m2"))
      .mockResolvedValueOnce(page([{ id: "m3" }], undefined));

    const seen: unknown[] = [];
    for await (const member of client.lists.listAllMembers("l1", { limit: 2 })) seen.push(member);

    expect(seen).toEqual([{ id: "m1" }, { id: "m2" }, { id: "m3" }]);
    expect(getCall(fetchMock, 0).url).toBe("http://localhost/api/lists/l1/members?limit=2");
    expect(getCall(fetchMock, 1).url).toBe("http://localhost/api/lists/l1/members?limit=2&cursor=m2");
  });

  test("listAllMembers stops when the server repeats the cursor it was given", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(page([{ id: "m1" }], "same"));

    const seen: unknown[] = [];
    for await (const member of client.lists.listAllMembers("l1", { cursor: "same" })) seen.push(member);

    expect(seen).toEqual([{ id: "m1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
