import { describe, expect, test } from "vitest";
import { SendlyNotFoundError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient, rejection } from "./helpers";

const MAILBOX = {
  id: "mb_1",
  address: "support@example.com",
  displayName: "Support",
  status: "ACTIVE",
  quotaBytes: null,
  domainId: "dom_1",
  createdAt: "2026-09-01T00:00:00.000Z",
};

describe("mailboxes resource", () => {
  test("list GETs /api/mailboxes and unwraps the legacy envelope to an array", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: [MAILBOX] }));

    const mailboxes = await client.mailboxes.list();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes");
    expect(init.method).toBe("GET");
    // The caller gets the array itself, not the `{ success, data }` wrapper.
    expect(mailboxes).toHaveLength(1);
    expect(mailboxes[0]?.address).toBe("support@example.com");
  });

  test("get returns the connection settings a mail client needs, and no password", async () => {
    const { client, fetchMock } = makeClient();
    const settings = {
      imap: { host: "mail.example.com", port: 993, security: "SSL/TLS", username: "support@example.com" },
      smtp: { host: "mail.example.com", port: 465, security: "SSL/TLS", username: "support@example.com" },
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: { ...MAILBOX, settings } }));

    const mailbox = await client.mailboxes.get("mb_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/mailboxes/mb_1");
    expect(mailbox.settings.imap.port).toBe(993);
    expect(mailbox.settings.smtp.port).toBe(465);
    // The secret is never on this endpoint — app passwords carry it, once.
    expect(Object.keys(mailbox.settings.imap)).not.toContain("password");
  });

  test("listAppPasswords returns metadata only — lastFour, never the secret", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          {
            id: "ap_1",
            name: "Thunderbird",
            scopes: ["imap", "smtp"],
            lastFour: "9x2k",
            lastUsedAt: null,
            createdAt: "2026-09-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const passwords = await client.mailboxes.listAppPasswords("mb_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/mailboxes/mb_1/app-passwords");
    expect(passwords[0]?.lastFour).toBe("9x2k");
    expect(Object.keys(passwords[0] ?? {})).not.toContain("password");
  });

  test("percent-encodes the id rather than splicing it into the path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));

    await client.mailboxes.listAppPasswords("mb/../evil");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/mailboxes/mb%2F..%2Fevil/app-passwords");
  });

  test("an unknown mailbox maps to SendlyNotFoundError", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(404, { success: false, error: { message: "Mailbox not found", code: "NOT_FOUND" } }),
    );

    const error = await rejection<SendlyNotFoundError>(client.mailboxes.get("nope"));
    expect(error).toBeInstanceOf(SendlyNotFoundError);
  });

  test("sendMessage POSTs the composed body to /messages and unwraps the legacy envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { submitted: true, conversationId: "cv_1", messageId: "msg_1" },
      }),
    );

    const submitted = await client.mailboxes.sendMessage("mb_1", {
      to: ["customer@example.com"],
      subject: "Your order",
      body: "It shipped this morning.",
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes/mb_1/messages");
    expect(init.method).toBe("POST");
    // Unlike the v1 resources, this legacy route's `{ success, data }` wrapper is stripped.
    expect(submitted).toEqual({ submitted: true, conversationId: "cv_1", messageId: "msg_1" });
  });

  test("sendMessage takes no `from` — the mailbox in the path is the sender", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        success: true,
        data: { submitted: true, conversationId: "cv_1", messageId: "msg_1" },
      }),
    );

    await client.mailboxes.sendMessage("mb_1", {
      to: ["customer@example.com"],
      bcc: ["archive@example.com"],
      subject: "Your order",
      body: "It shipped this morning.",
    });

    const body = getCallBody(fetchMock) as Record<string, unknown>;
    expect(body).toEqual({
      to: ["customer@example.com"],
      bcc: ["archive@example.com"],
      subject: "Your order",
      body: "It shipped this morning.",
    });
    expect(Object.keys(body)).not.toContain("from");
  });

  test("draftMessage POSTs to /drafts, unwraps, and comes back with sent: false", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { subject: "Your order shipped", body: "Hi there —", subjects: [], sent: false },
      }),
    );

    const draft = await client.mailboxes.draftMessage("mb_1", { mode: "draft", brief: "order shipped" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/mailboxes/mb_1/drafts");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ mode: "draft", brief: "order shipped" });
    // The whole safety story of this pair: drafting never mails anybody.
    expect(draft.sent).toBe(false);
    expect(draft.subject).toBe("Your order shipped");
  });

  test("draftMessage in subject mode returns the alternatives, not a send receipt", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { subject: null, body: null, subjects: ["Shipped!", "On its way"], sent: false },
      }),
    );

    const draft = await client.mailboxes.draftMessage("mb_1", { mode: "subject", draft: "your order shipped" });

    expect(draft.subjects).toEqual(["Shipped!", "On its way"]);
    // A draft carries no conversation or message id — nothing was created.
    expect(Object.keys(draft)).not.toContain("messageId");
  });

  test("the composition routes percent-encode the mailbox id too", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, data: { subject: null, body: null, subjects: [], sent: false } }),
    );

    await client.mailboxes.draftMessage("mb/../evil", { mode: "draft" });

    expect(getCall(fetchMock).url).toBe("http://localhost/api/mailboxes/mb%2F..%2Fevil/drafts");
  });
});
