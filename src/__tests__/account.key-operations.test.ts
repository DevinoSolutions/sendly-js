import { describe, expect, test } from "vitest";
import { SendlyRateLimitError } from "../index";
import type { BillingStatusV1, ConnectLinksV1, PlanListV1, SupportTicketListV1 } from "../types";
import { getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

// Minimal fixtures: only the fields under assertion matter.
function asFixture<T>(value: unknown): T {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return value as unknown as T;
}

describe("billing (/api/v1/billing)", () => {
  test("get GETs /api/v1/billing and resolves the bare status", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, asFixture<BillingStatusV1>({ plan: "payg", pro: null })));

    const status = await client.billing.get();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/billing");
    expect(init.method).toBe("GET");
    expect(status.pro).toBeNull();
  });

  test("listPlans GETs /api/v1/billing/plans", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, asFixture<PlanListV1>({ plans: [{ id: "free" }, { id: "payg" }] })));

    const result = await client.billing.listPlans();

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/billing/plans");
    expect(result.plans.map((p) => p.id)).toEqual(["free", "payg"]);
  });
});

describe("connections (/api/v1/connections)", () => {
  test("list GETs /api/v1/connections", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { connectedApps: null, domains: [], slack: null }));

    const result = await client.connections.list();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/connections");
    expect(init.method).toBe("GET");
    expect(result.connectedApps).toBeNull();
  });

  test("createLinks POSTs the provider and domain, and resolves the one-time links", async () => {
    const { client, fetchMock } = makeClient();
    const links = asFixture<ConnectLinksV1>({
      links: [
        { provider: "dodomain", domainId: "d1", status: "action_required", expires_in: 900, url: "https://x/go/1" },
      ],
    });
    fetchMock.mockResolvedValue(jsonResponse(200, links));

    const result = await client.connections.createLinks({ provider: "dodomain", domainId: "d1" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/connections/links");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ provider: "dodomain", domainId: "d1" });
    expect(result.links[0]?.provider).toBe("dodomain");
  });

  test("createLinks with no argument still sends an empty JSON object, which the route requires", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { links: [] }));

    await client.connections.createLinks();

    const { init } = getCall(fetchMock);
    expect(init.body).toBe("{}");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  test("a DoDomain link requested twice inside the cooldown is a typed rate-limit error", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(429, { type: "about:blank", title: "Too Many Requests", code: "DODOMAIN_SESSION_COOLDOWN" }),
    );
    expect(await rejection(client.connections.createLinks({ provider: "dodomain", domainId: "d1" }))).toBeInstanceOf(
      SendlyRateLimitError,
    );
  });
});

describe("support (/api/v1/support/tickets)", () => {
  test("listTickets GETs the project's tickets", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, asFixture<SupportTicketListV1>({ items: [{ id: "tk1", status: "sent" }] })),
    );

    const result = await client.support.listTickets();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/support/tickets");
    expect(init.method).toBe("GET");
    expect(result.items[0]?.id).toBe("tk1");
  });

  test("createTicket POSTs the ticket and resolves its id and status", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { ticketId: "tk2", status: "sent" }));

    const result = await client.support.createTicket({
      subject: "Bounces",
      body: "Why?",
      type: "question",
      wantsReply: false,
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/support/tickets");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ subject: "Bounces", body: "Why?", type: "question", wantsReply: false });
    expect(result).toEqual({ ticketId: "tk2", status: "sent" });
  });
});
