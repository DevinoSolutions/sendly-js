import { describe, expect, test } from "vitest";
import { getCall, jsonResponse, makeClient } from "./helpers";

const envelope = (data: unknown) => jsonResponse(200, { success: true, data });

describe("analytics: activity feed and top events (legacy dialect)", () => {
  test("listActivity maps every filter onto the query and resolves one page", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ data: [{ id: "a1" }], cursor: "1700_a1", hasMore: true }));

    const result = await client.analytics.listActivity({
      limit: 20,
      contactId: "c1",
      types: "email.sent,email.bounced",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    const query = new URL(url).searchParams;
    expect(new URL(url).pathname).toBe("/api/activity");
    expect(Object.fromEntries(query)).toEqual({
      limit: "20",
      contactId: "c1",
      types: "email.sent,email.bounced",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.data).toEqual([{ id: "a1" }]);
    expect(result.cursor).toBe("1700_a1");
  });

  test("listAllActivity walks the feed on `cursor`", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(envelope({ data: [{ id: "a1" }], cursor: "c1", hasMore: true }))
      .mockResolvedValueOnce(envelope({ data: [{ id: "a2" }], hasMore: false }));

    const seen: unknown[] = [];
    for await (const entry of client.analytics.listAllActivity({ types: "email.sent" })) seen.push(entry);

    expect(seen).toEqual([{ id: "a1" }, { id: "a2" }]);
    expect(getCall(fetchMock, 1).url).toBe("http://localhost/api/activity?types=email.sent&cursor=c1");
  });

  test.each([
    ["getActivityCount", "/api/activity/recent-count", { minutes: 15 }, "?minutes=15"],
    [
      "getActivityStats",
      "/api/activity/stats",
      { startDate: "2026-02-01", endDate: "2026-02-02" },
      "?startDate=2026-02-01&endDate=2026-02-02",
    ],
    ["listUpcomingActivity", "/api/activity/upcoming", { limit: 5, daysAhead: 3 }, "?limit=5&daysAhead=3"],
    [
      "listTopEvents",
      "/api/analytics/top-events",
      { limit: 3, startDate: "2026-02-01" },
      "?limit=3&startDate=2026-02-01",
    ],
  ] as const)("%s GETs %s and unwraps the envelope", async (method, path, query, qs) => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ total: 4 }));

    // The four queries differ in shape, so the call goes through the union of their parameter types.
    const result = await (client.analytics[method] as (q: typeof query) => Promise<unknown>)(query);

    const { url, init } = getCall(fetchMock);
    expect(url).toBe(`http://localhost${path}${qs}`);
    expect(init.method).toBe("GET");
    expect(result).toEqual({ total: 4 });
  });
});
