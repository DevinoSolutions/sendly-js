import { describe, expect, test } from "vitest";
import type { DmarcReportV1, RecipientDomainStatsV1 } from "../types";
import { cursorPage, getCall, jsonResponse, makeClient } from "./helpers";

function domainStats(domain: string, day: string): RecipientDomainStatsV1 {
  return {
    domain,
    day,
    sent: 100,
    delivered: 92,
    bounced: 7,
    complained: 1,
    opened: 40,
    computed_at: "2026-09-01T00:00:00.000Z",
  };
}

function dmarcReport(id: string): DmarcReportV1 {
  return {
    id,
    report_id: `rpt_${id}`,
    org_name: "google.com",
    policy_domain: "example.com",
    range_begin: "2026-09-01T00:00:00.000Z",
    range_end: "2026-09-02T00:00:00.000Z",
    total_count: 10,
    pass_count: 9,
    fail_count: 1,
    sources: [],
    received_at: "2026-09-02T06:00:00.000Z",
  };
}

describe("deliverability resource (/api/v1)", () => {
  test("diagnose GETs /deliverability/diagnose with every query parameter serialized", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { domain: "example.com", address: null, findings: [] }));

    await client.deliverability.diagnose({
      domain: "example.com",
      address: "person@gmail.com",
      window_days: 14,
    });

    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("http://localhost/api/v1/deliverability/diagnose?");
    expect(url).toContain("domain=example.com");
    expect(url).toContain("address=person%40gmail.com");
    expect(url).toContain("window_days=14");
  });

  test("diagnose resolves the diagnosis body as sent, findings and all", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        domain: "example.com",
        address: null,
        checked_at: "2026-09-01T00:00:00.000Z",
        identity: { registered: true, verified: false, dkim_status: "FAILED" },
        suppression: null,
        recent_delivery: { window_days: 7, scope: "project", sent: 500, bounced: 40 },
        findings: [{ code: "dkim_failed", severity: "critical", summary: "DKIM is failing.", remedy: "Re-add DNS." }],
      }),
    );

    const diagnosis = await client.deliverability.diagnose({ domain: "example.com" });

    expect(diagnosis.findings[0]?.code).toBe("dkim_failed");
    expect(diagnosis.recent_delivery.scope).toBe("project");
  });

  test("listDomainStats GETs the recipient-domain rollup with its filters", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([domainStats("gmail.com", "2026-09-01")], null));

    const page = await client.deliverability.listDomainStats({ limit: 50, days: 7, domain: "gmail.com" });

    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("http://localhost/api/v1/deliverability/domains?");
    expect(url).toContain("limit=50");
    expect(url).toContain("days=7");
    expect(url).toContain("domain=gmail.com");
    // Not unwrapped: the caller gets the envelope, not its `data` array.
    expect(page.has_more).toBe(false);
    expect(page.data[0]?.domain).toBe("gmail.com");
  });

  test("listDomainStatsAll walks two pages on `after` and stops", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([domainStats("gmail.com", "2026-09-02")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([domainStats("outlook.com", "2026-09-02")], null));

    const seen: string[] = [];
    for await (const row of client.deliverability.listDomainStatsAll({ days: 2 })) seen.push(row.domain);

    expect(seen).toEqual(["gmail.com", "outlook.com"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    const second = getCall(fetchMock, 1).url;
    expect(second).toContain("after=cur_2");
    expect(second).not.toContain("cursor=cur_2");
    expect(second).toContain("days=2");
  });

  test("listDmarcReports GETs /deliverability/dmarc and returns the envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([dmarcReport("dmr_1")], null));

    const page = await client.deliverability.listDmarcReports({ limit: 10, days: 90, domain: "example.com" });

    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("http://localhost/api/v1/deliverability/dmarc?");
    expect(url).toContain("limit=10");
    expect(url).toContain("days=90");
    expect(url).toContain("domain=example.com");
    expect(page.next_cursor).toBeNull();
    expect(page.data[0]?.policy_domain).toBe("example.com");
  });

  test("an empty DMARC page is a well-formed answer, not an error", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));

    const page = await client.deliverability.listDmarcReports();

    expect(page.data).toEqual([]);
    expect(page.has_more).toBe(false);
  });

  test("listDmarcReportsAll walks two pages on `after` and stops", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([dmarcReport("dmr_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([dmarcReport("dmr_2")], null));

    const seen: string[] = [];
    for await (const report of client.deliverability.listDmarcReportsAll()) seen.push(report.id);

    expect(seen).toEqual(["dmr_1", "dmr_2"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).not.toContain("cursor=");
  });
});
