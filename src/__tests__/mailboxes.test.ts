import { describe, expect, test } from "vitest";
import { SendlyNotFoundError } from "../index";
import { getCall, jsonResponse, makeClient, rejection } from "./helpers";

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
});
