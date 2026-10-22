import { describe, expect, test } from "vitest";
import { SendlyPermissionError } from "../index";
import { fileResponse, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

/** Only the fields these tests read; the rest of a conversation is the server's. */
function conversation(id: string) {
  return { id, subject: `Thread ${id}`, lastMessageAt: "2026-10-21T10:00:00.000Z" };
}

describe("mailboxes: reading and answering the mail", () => {
  test("listConversations GETs one page with the filters as query parameters and unwraps the envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, data: { items: [conversation("c1")], nextCursor: "c1" } }),
    );

    const page = await client.mailboxes.listConversations("mb_1", { view: "spam", status: "open", limit: 1 });

    expect(getCall(fetchMock).url).toBe(
      "http://localhost/api/mailboxes/mb_1/conversations?view=spam&status=open&limit=1",
    );
    expect(page.items.map((item) => item.id)).toEqual(["c1"]);
    expect(page.nextCursor).toBe("c1");
  });

  test("listAllConversations follows nextCursor as cursor until it is null, keeping the filters", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { items: [conversation("c1"), conversation("c2")], nextCursor: "c2" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { items: [conversation("c3")], nextCursor: null } }),
      );

    const ids: string[] = [];
    for await (const item of client.mailboxes.listAllConversations("mb_1", { q: "invoice" })) ids.push(item.id);

    expect(ids).toEqual(["c1", "c2", "c3"]);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "http://localhost/api/mailboxes/mb_1/conversations?q=invoice",
      "http://localhost/api/mailboxes/mb_1/conversations?q=invoice&cursor=c2",
    ]);
  });

  test("getConversation GETs the thread and resolves its messages", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: [{ id: "m1" }, { id: "m2" }] }));

    const messages = await client.mailboxes.getConversation("mb_1", "c1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/mailboxes/mb_1/conversations/c1");
    expect(messages.map((message) => message.id)).toEqual(["m1", "m2"]);
  });

  test("replyToConversation POSTs only the body: no recipient and no sender can be named", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { submitted: true, status: "queued" } }));

    const reply = await client.mailboxes.replyToConversation("mb_1", "c1", { body: "Thanks, sorted." });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes/mb_1/conversations/c1/reply");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ body: "Thanks, sorted." });
    expect(reply).toEqual({ submitted: true, status: "queued" });
  });

  test("a key without the opt-in conversation scope gets a permission error, not an empty inbox", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(403, {
        type: "about:blank",
        title: "Forbidden",
        detail: "Missing scope mailbox-conversations:read",
      }),
    );

    const error = await rejection(client.mailboxes.listConversations("mb_1"));

    expect(error).toBeInstanceOf(SendlyPermissionError);
  });

  test("downloadAttachment resolves the raw bytes and the sender's headers, never decoding them as text", async () => {
    const { client, fetchMock } = makeClient();
    // Not valid UTF-8: reading this as text would replace bytes with U+FFFD.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
    fetchMock.mockResolvedValue(
      fileResponse(bytes, { "content-type": "image/png", "content-disposition": 'attachment; filename="logo.png"' }),
    );

    const file = await client.mailboxes.downloadAttachment("mb_1", "att_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes/mb_1/attachments/att_1");
    expect((init.headers as Record<string, string>).Accept).toBe("*/*");
    expect([...new Uint8Array(file.data)]).toEqual([...bytes]);
    expect(file.contentType).toBe("image/png");
    expect(file.contentDisposition).toBe('attachment; filename="logo.png"');
  });

  test("a refused download throws the same typed error as any other call", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(problemResponse(403, { type: "about:blank", title: "Forbidden" }));

    const error = await rejection(client.mailboxes.downloadAttachment("mb_1", "att_1"));

    expect(error).toBeInstanceOf(SendlyPermissionError);
  });
});
