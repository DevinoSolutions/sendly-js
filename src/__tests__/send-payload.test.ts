import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { SendlyValidationError } from "../index";
import { ALL_SEND_KEYS_LISTED, SEND_EMAIL_V1_KEYS } from "../resources/send-payload";
import type { SendEmailV1Request } from "../types";
import { getCall, getCallBody, jsonResponse, makeClient, rejection } from "./helpers";

const RECEIPT = { id: "em_1", status: "PENDING", to: "test+user@example.com", from: "hi@acme.com" };

/** What a useSend/Resend-shaped transport builds: valid for them, wrong for Sendly. */
function foreignPayload(extra: Record<string, unknown>): SendEmailV1Request {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- a payload built elsewhere is exactly what excess-property checks miss
  return { to: "test+user@example.com", subject: "hi", ...extra } as unknown as SendEmailV1Request;
}

describe("emails.send refuses keys outside the send schema (#9)", () => {
  test("html throws and points at body, and nothing is sent", async () => {
    const { client, fetchMock } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ html: "<p>hi</p>" })));

    expect(error).toBeInstanceOf(SendlyValidationError);
    expect(error.errorCode).toBe("unknown_field");
    expect(error.message).toBe(`unknown field "html"; Sendly's HTML content field is "body"`);
    expect(error.fieldErrors).toEqual([
      {
        pointer: "/html",
        code: "unknown_field",
        message: `unknown field "html"; Sendly's HTML content field is "body"`,
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("replyTo throws and points at reply", async () => {
    const { client, fetchMock } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ replyTo: "a@b.com" })));

    expect(error.message).toBe(`unknown field "replyTo"; Sendly's reply-to field is "reply"`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("every unknown key is reported, not just the first", async () => {
    const { client } = makeClient();

    const error = await rejection<SendlyValidationError>(
      client.emails.send(foreignPayload({ html: "<p>hi</p>", replyTo: "a@b.com" })),
    );

    expect(error.fieldErrors?.map((entry) => entry.pointer)).toEqual(["/html", "/replyTo"]);
    expect(error.message).toContain(`"html"`);
    expect(error.message).toContain(`"replyTo"`);
  });

  test.each([
    ["htmlBody", "body"],
    ["html_body", "body"],
    ["reply_to", "reply"],
    ["templateId", "template"],
    ["template_id", "template"],
  ])("%s names %s", async (wrong, right) => {
    const { client } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ [wrong]: "x" })));

    expect(error.message).toMatch(new RegExp(`^unknown field "${wrong}"; .* is "${right}"$`));
  });

  test.each(["text", "textBody", "text_body"])("%s says Sendly has no plain-text field", async (wrong) => {
    const { client } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ [wrong]: "plain" })));

    expect(error.message).toBe(
      `unknown field "${wrong}"; Sendly has no separate plain-text field; the message content goes in "body"`,
    );
  });

  test.each([
    ["CC", "cc"],
    ["Bcc", "bcc"],
    ["Subject", "subject"],
    ["Headers", "headers"],
    ["Tags", "tags"],
  ])("%s is a case mistake for %s", async (wrong, right) => {
    const { client } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ [wrong]: "x" })));

    expect(error.message).toBe(`unknown field "${wrong}"; did you mean "${right}"? Field names are case-sensitive`);
  });

  test("an unknown key with no known intent lists the accepted fields", async () => {
    const { client, fetchMock } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ zzz_not_a_field: 1 })));

    expect(error.errorCode).toBe("unknown_field");
    expect(error.message).toContain(`unknown field "zzz_not_a_field"; accepted fields are `);
    for (const key of SEND_EMAIL_V1_KEYS) expect(error.message).toContain(`"${key}"`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a key named like an Object.prototype member is just unknown", async () => {
    const { client } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ constructor: "x" })));

    expect(error.message).toContain(`unknown field "constructor"; accepted fields are `);
  });

  test("a JSON pointer escapes the characters it reserves", async () => {
    const { client } = makeClient();

    const error = await rejection<SendlyValidationError>(client.emails.send(foreignPayload({ "a/b~c": 1 })));

    expect(error.fieldErrors?.[0]?.pointer).toBe("/a~1b~0c");
  });

  test("a valid payload is forwarded unchanged", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, RECEIPT));
    const payload: SendEmailV1Request = {
      to: { email: "test+user@example.com", name: "Test User" },
      from: { email: "hi@acme.com", name: "Acme" },
      cc: ["test+cc@example.com"],
      bcc: ["test+bcc@example.com"],
      reply: "support@acme.com",
      subject: "Report",
      body: "<p>Attached.</p>",
      headers: { "X-Entity-Ref-ID": "abc" },
      tags: ["welcome"],
      data: { plan: "pro" },
      name: "Welcome",
      subscribed: true,
      attachments: [{ filename: "report.pdf", content: "JVBERi0=", contentType: "application/pdf" }],
    };

    const receipt = await client.emails.send(payload);

    expect(receipt).toEqual(RECEIPT);
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/emails");
    expect(getCallBody(fetchMock)).toEqual(payload);
  });

  test("a template send passes through", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, RECEIPT));

    await client.emails.send({ to: "test+user@example.com", template: "0b0f8e0e-6c1f-4b8e-9d3a-2f6f7a1c9d11" });

    expect(getCallBody(fetchMock)).toEqual({
      to: "test+user@example.com",
      template: "0b0f8e0e-6c1f-4b8e-9d3a-2f6f7a1c9d11",
    });
  });

  test("listUnsubscribe, the sender's own one-click endpoint, is forwarded as given", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, RECEIPT));
    const payload: SendEmailV1Request = {
      to: "test+user@example.com",
      subject: "hi",
      listUnsubscribe: "https://notify.example.com/unsubscribe?token=abc123",
    };

    await client.emails.send(payload);

    expect(getCallBody(fetchMock)).toEqual(payload);
  });

  test("only unknown keys are refused client-side; value validation stays the server's", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, RECEIPT));

    await client.emails.send({ to: "not-an-email" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("the accepted key list cannot drift from the schema", () => {
  const spec = JSON.parse(readFileSync(fileURLToPath(new URL("../../openapi.json", import.meta.url)), "utf8")) as {
    components: { schemas: { SendEmailV1: { properties: Record<string, unknown> } } };
  };

  test("it equals the committed SendEmailV1 properties", () => {
    expect([...SEND_EMAIL_V1_KEYS].sort()).toEqual(Object.keys(spec.components.schemas.SendEmailV1.properties).sort());
  });

  test("it lists every generated key (also enforced by the type checker)", () => {
    expect(ALL_SEND_KEYS_LISTED).toBe(true);
    expect(new Set(SEND_EMAIL_V1_KEYS).size).toBe(SEND_EMAIL_V1_KEYS.length);
  });
});
