import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import type { SegmentContactV1, SegmentV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

function segment(id: string): SegmentV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, name: `Segment ${id}`, type: "DYNAMIC" } as unknown as SegmentV1;
}

function segmentContact(id: string): SegmentContactV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, email: `${id}@example.com`, subscribed: true } as unknown as SegmentContactV1;
}

describe("segments resource (/api/v1)", () => {
  test("create POSTs /api/v1/segments and resolves the bare segment", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "seg_1", name: "Engaged", type: "DYNAMIC" }));

    const created = await client.segments.create({ name: "Engaged", track_membership: true });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/segments");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ name: "Engaged", track_membership: true });
    expect(created.id).toBe("seg_1");
  });

  test("create accepts just a name — `type` and `track_membership` default server-side", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "seg_1", name: "Engaged" }));
    await client.segments.create({ name: "Engaged" });
    expect(getCallBody(fetchMock)).toEqual({ name: "Engaged" });
  });

  test("get, update and delete build the right verb and path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "seg_1", deleted: true }));

    await client.segments.get("seg_1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/segments/seg_1");

    fetchMock.mockClear();
    await client.segments.update("seg_1", { name: "Renamed" });
    expect(getCall(fetchMock).init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ name: "Renamed" });

    fetchMock.mockClear();
    const deleted = await client.segments.delete("seg_1");
    expect(getCall(fetchMock).init.method).toBe("DELETE");
    expect(deleted).toEqual({ id: "seg_1", deleted: true });
  });

  test("list serializes cursor query params", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([], null));
    await client.segments.list({ limit: 10, after: "cur_seg" });
    const { url } = getCall(fetchMock);
    expect(url).toContain("limit=10");
    expect(url).toContain("after=cur_seg");
  });

  test("listAll walks every page and yields individual segments", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([segment("seg_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([segment("seg_2"), segment("seg_3")], null));

    const seen: string[] = [];
    for await (const item of client.segments.listAll()) seen.push(item.id);

    expect(seen).toEqual(["seg_1", "seg_2", "seg_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
  });

  test("listContacts targets the segment's contacts sub-path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([segmentContact("ct_1")], null));

    const page = await client.segments.listContacts("seg_1", { limit: 5 });

    const { url, init } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/v1/segments/seg_1/contacts");
    expect(url).toContain("limit=5");
    expect(init.method).toBe("GET");
    expect(page.data[0]?.email).toBe("ct_1@example.com");
  });

  test("listContactsAll pages through a segment's membership", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([segmentContact("ct_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([segmentContact("ct_2")], null));

    const seen: string[] = [];
    for await (const contact of client.segments.listContactsAll("seg_1")) seen.push(contact.id);

    expect(seen).toEqual(["ct_1", "ct_2"]);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
    expect(getCall(fetchMock, 1).url).toContain("/segments/seg_1/contacts");
  });

  test("deleting a segment still referenced by a campaign surfaces the conflict code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(409, {
        type: "https://docs.sendly.now/errors/conflict",
        title: "Conflict",
        detail: "Segment is referenced by 2 campaigns.",
        code: "conflict",
        request_id: "req_seg_conflict",
      }),
    );

    const error = await rejection<SendlyConflictError>(client.segments.delete("seg_1"));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("conflict");
    expect(error.requestId).toBe("req_seg_conflict");
  });
});
