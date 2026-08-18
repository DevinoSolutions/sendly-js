import { describe, expect, test } from "vitest";
import { SendlyPermissionError } from "../index";
import { getCall, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

const WINDOW = { from: "2026-07-19T00:00:00.000Z", to: "2026-08-18T00:00:00.000Z" };

describe("analytics resource (/api/v1)", () => {
  test("timeseries GETs /api/v1/analytics/timeseries and resolves the bare body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: [{ date: WINDOW.from, emails: 12, delivered: 11 }], window: WINDOW }),
    );

    const result = await client.analytics.timeseries({ from: WINDOW.from, to: WINDOW.to });

    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("http://localhost/api/v1/analytics/timeseries");
    expect(url).toContain(`from=${encodeURIComponent(WINDOW.from)}`);
    expect(url).toContain(`to=${encodeURIComponent(WINDOW.to)}`);
    // The `window` field reports the range actually covered after clamping.
    expect(result.window).toEqual(WINDOW);
    expect(result.data).toHaveLength(1);
  });

  test("campaigns GETs /api/v1/analytics/campaigns", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { total: 4, active: 1, completed: 3, average_open_rate: 0.4, window: WINDOW }),
    );

    const result = await client.analytics.campaigns();

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/analytics/campaigns");
    expect(result.total).toBe(4);
  });

  test("topCampaigns forwards its limit and resolves a non-cursor leaderboard", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: [{ id: "cmp_1", subject: "Hi", sent: 10, opened: 8 }], window: WINDOW }),
    );

    const result = await client.analytics.topCampaigns({ limit: 5 });

    expect(getCall(fetchMock).url).toContain("limit=5");
    // Deliberately not a cursor envelope — a top-N leaderboard has no next page.
    expect(result).not.toHaveProperty("next_cursor");
    expect(result.data[0]?.id).toBe("cmp_1");
  });

  test("a missing analytics scope maps to SendlyPermissionError with scope_missing", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(403, {
        type: "https://docs.sendly.now/errors/scope_missing",
        title: "Scope missing",
        detail: "This key is missing the analytics:read scope.",
        code: "scope_missing",
        request_id: "req_scope",
      }),
    );

    const error = await rejection<SendlyPermissionError>(client.analytics.timeseries());
    expect(error).toBeInstanceOf(SendlyPermissionError);
    expect(error.errorCode).toBe("scope_missing");
    expect(error.requestId).toBe("req_scope");
  });
});
