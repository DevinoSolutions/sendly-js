import { describe, expect, test } from "vitest";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

const envelope = (data: unknown) => jsonResponse(200, { success: true, data });

describe("inbox: project-wide conversations", () => {
  test("inbox.listConversations maps the filters onto the query and resolves one page", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ items: [{ id: "cv1" }], nextCursor: "cv1" }));

    const page = await client.inbox.listConversations({
      view: "spam",
      status: "open",
      q: "refund",
      limit: 10,
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/inbox/conversations?view=spam&status=open&q=refund&limit=10");
    expect(init.method).toBe("GET");
    expect(page.items).toEqual([{ id: "cv1" }]);
    expect(page.nextCursor).toBe("cv1");
  });

  test("inbox.listAllConversations follows nextCursor as `cursor` until it is null", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(envelope({ items: [{ id: "cv1" }, { id: "cv2" }], nextCursor: "cv2" }))
      .mockResolvedValueOnce(envelope({ items: [{ id: "cv3" }], nextCursor: null }));

    const seen: unknown[] = [];
    for await (const conversation of client.inbox.listAllConversations({ limit: 2 })) seen.push(conversation);

    expect(seen).toEqual([{ id: "cv1" }, { id: "cv2" }, { id: "cv3" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getCall(fetchMock, 0).url).toBe("http://localhost/api/inbox/conversations?limit=2");
    expect(getCall(fetchMock, 1).url).toBe("http://localhost/api/inbox/conversations?limit=2&cursor=cv2");
  });
});

describe("mailboxes: conversation management", () => {
  test("getConversationContact GETs the contact timeline", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ contact: { id: "c1", email: "a@example.com" }, timeline: [] }));

    const result = await client.mailboxes.getConversationContact("mb1", "cv1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/mailboxes/mb1/conversations/cv1/contact");
    expect(result.timeline).toEqual([]);
  });

  test("setConversationStatus PATCHes status and assignee, and null unassigns", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "cv1", status: "CLOSED" }));

    const result = await client.mailboxes.setConversationStatus("mb1", "cv1", { status: "CLOSED", assigneeId: null });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes/mb1/conversations/cv1/status");
    expect(init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ status: "CLOSED", assigneeId: null });
    expect(result.status).toBe("CLOSED");
  });

  test("setConversationSpam POSTs the flag, in both directions", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "cv1", spamFiled: false }));

    await client.mailboxes.setConversationSpam("mb1", "cv1", { spam: false });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes/mb1/conversations/cv1/spam");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ spam: false });
  });

  test("deleteConversation DELETEs the thread", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "cv1" }));

    const result = await client.mailboxes.deleteConversation("mb1", "cv1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes/mb1/conversations/cv1");
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({ id: "cv1" });
  });

  describe("inbox.listAllConversations: repeated cursor", () => {
    test("stops when the server hands back the cursor it was given", async () => {
      const { client, fetchMock } = makeClient();
      fetchMock.mockResolvedValue(envelope({ items: [{ id: "cv1" }], nextCursor: "same" }));

      const seen: unknown[] = [];
      for await (const conversation of client.inbox.listAllConversations({ cursor: "same" })) seen.push(conversation);

      expect(seen).toEqual([{ id: "cv1" }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("mailboxes.listAllConversations stops on a repeated cursor too", async () => {
      const { client, fetchMock } = makeClient();
      fetchMock.mockResolvedValue(envelope({ items: [{ id: "cv1" }], nextCursor: "same" }));

      const seen: unknown[] = [];
      for await (const conversation of client.mailboxes.listAllConversations("mb1", { cursor: "same" })) {
        seen.push(conversation);
      }

      expect(seen).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
