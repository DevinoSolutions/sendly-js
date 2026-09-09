import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import type { ListV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient, rejection } from "./helpers";

function listV1(id: string): ListV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, name: `List ${id}`, double_opt_in: false, member_count: 3 } as unknown as ListV1;
}

describe("lists resource (legacy /api)", () => {
  test("subscribe POSTs /api/lists/{id}/subscribe and unwraps the envelope to data", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { membershipId: "mem_1", status: "CONFIRMED", created: true, previousStatus: null },
      }),
    );

    const result = await client.lists.subscribe("lst_1", {
      email: "user@example.com",
      data: { firstName: "Ada" },
      allowResubscribe: true,
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/lists/lst_1/subscribe");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toMatchObject({ email: "user@example.com", allowResubscribe: true });
    // Legacy dialect: the `{ success, data }` envelope is unwrapped to `data`.
    expect(result).toEqual({ membershipId: "mem_1", status: "CONFIRMED", created: true, previousStatus: null });
  });

  test("a double-opt-in list yields PENDING plus the confirmToken the caller must deliver", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          membershipId: "mem_2",
          status: "PENDING",
          created: true,
          previousStatus: null,
          confirmToken: "tok_abc",
        },
      }),
    );

    const result = await client.lists.subscribe("lst_1", { email: "user@example.com" });

    // Sendly does not send the confirmation email — the caller delivers
    // /api/lists/confirm-subscription?token=<confirmToken> to the contact.
    expect(result.status).toBe("PENDING");
    expect(result.confirmToken).toBe("tok_abc");
  });

  test("subscribe accepts just an email — allowResubscribe defaults to false server-side", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.lists.subscribe("lst_1", { email: "user@example.com" });
    expect(getCallBody(fetchMock)).toEqual({ email: "user@example.com" });
  });

  test("unsubscribe POSTs /api/lists/{id}/unsubscribe and unwraps to the echoed address", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { email: "user@example.com" } }));

    const result = await client.lists.unsubscribe("lst_1", { email: "user@example.com" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/lists/lst_1/unsubscribe");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ email: "user@example.com" });
    expect(result).toEqual({ email: "user@example.com" });
  });

  test("list ids are URL-encoded into the path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await client.lists.subscribe("a/b", { email: "user@example.com" });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/lists/a%2Fb/subscribe");
  });

  test("re-subscribing an opted-out address 409s unless allowResubscribe is set", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        success: false,
        error: { message: "Contact previously unsubscribed", code: "RESUBSCRIBE_CONFIRMATION_REQUIRED" },
      }),
    );

    const error = await rejection<SendlyConflictError>(client.lists.subscribe("lst_1", { email: "user@example.com" }));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("RESUBSCRIBE_CONFIRMATION_REQUIRED");
  });
});

describe("lists resource (/api/v1)", () => {
  test("createV1 POSTs /api/v1/lists and resolves the bare body, unwrapping nothing", async () => {
    const { client, fetchMock } = makeClient();
    const body = {
      id: "lst_1",
      name: "Weekly digest",
      description: null,
      double_opt_in: true,
      confirmation_template_id: null,
      redirect_url: null,
      member_count: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(201, body));

    const created = await client.lists.createV1({ name: "Weekly digest", double_opt_in: true });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/lists");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ name: "Weekly digest", double_opt_in: true });
    // v1 answers a bare body: the whole document reaches the caller.
    expect(created).toEqual(body);
  });

  test("getV1, updateV1 and deleteV1 build the right verb and path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "lst_1", deleted: true }));

    await client.lists.getV1("lst_1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/lists/lst_1");
    expect(getCall(fetchMock).init.method).toBe("GET");

    fetchMock.mockClear();
    await client.lists.updateV1("lst_1", { name: "Renamed", redirect_url: null });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/lists/lst_1");
    expect(getCall(fetchMock).init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ name: "Renamed", redirect_url: null });

    fetchMock.mockClear();
    const deleted = await client.lists.deleteV1("lst_1");
    expect(getCall(fetchMock).init.method).toBe("DELETE");
    expect(deleted).toEqual({ id: "lst_1", deleted: true });
  });

  test("listV1 serializes cursor query params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));

    await client.lists.listV1({ limit: 25, after: "cur_lst" });

    const { url, init } = getCall(fetchMock);
    expect(url).toContain("/api/v1/lists?");
    expect(url).toContain("limit=25");
    expect(url).toContain("after=cur_lst");
    expect(init.method).toBe("GET");
  });

  test("listV1 resolves the cursor envelope itself, not just its rows", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([listV1("lst_1")], "cur_2"));

    const page = await client.lists.listV1();

    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toBe("cur_2");
    expect(page.data[0]?.member_count).toBe(3);
  });

  test("listAllV1 walks every page and yields individual lists", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([listV1("lst_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([listV1("lst_2"), listV1("lst_3")], null));

    const seen: string[] = [];
    for await (const item of client.lists.listAllV1({ limit: 1 })) seen.push(item.id);

    expect(seen).toEqual(["lst_1", "lst_2", "lst_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).toContain("limit=1");
  });

  test("startValidationRun POSTs the list's validation-runs sub-path and resolves the pending run", async () => {
    const { client, fetchMock } = makeClient();
    const run = {
      id: "vrun_1",
      list_id: "lst_1",
      status: "pending",
      processed_count: 0,
      deliverable_count: 0,
      undeliverable_count: 0,
      risky_count: 0,
      started_at: null,
      completed_at: null,
      failure_reason: null,
      created_at: "2026-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValue(jsonResponse(202, run));

    const started = await client.lists.startValidationRun("lst_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/lists/lst_1/validation-runs");
    expect(init.method).toBe("POST");
    // Billed per address checked, so the caller must be able to see the run it just paid to start.
    expect(started).toEqual(run);
  });

  test("list ids are URL-encoded into every v1 path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, listV1("a/b")));

    await client.lists.getV1("a/b");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/lists/a%2Fb");

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(202, { id: "vrun_1" }));
    await client.lists.startValidationRun("a/b");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/lists/a%2Fb/validation-runs");
  });

  test("deleting a list still referenced elsewhere surfaces the problem document's code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        success: false,
        error: { message: "List is referenced by 1 campaign.", code: "conflict" },
      }),
    );

    const error = await rejection<SendlyConflictError>(client.lists.deleteV1("lst_1"));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("conflict");
  });
});
