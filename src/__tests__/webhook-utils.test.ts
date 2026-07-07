import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { DEFAULT_TOLERANCE_MS, constructEvent, verifySignature } from "../index";

const SECRET = "whsec_test_secret";

/**
 * Mirrors the server's signing construction exactly
 * (apps/web/src/server/services/WebhookDeliveryService.ts `buildSignature`):
 * bare-hex HMAC_SHA256(secret, `${timestamp}.${body}`). If either side changes
 * this construction, these pins and the server's WebhookDeliver pins disagree.
 */
function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function freshDelivery(data: Record<string, unknown> = { emailId: "em_1" }) {
  const timestamp = Date.now().toString();
  const body = JSON.stringify({ event: "email.sent", data, timestamp });
  return { timestamp, body, signature: sign(SECRET, timestamp, body) };
}

describe("verifySignature", () => {
  test("accepts a signature built the way the server builds it", () => {
    const { timestamp, body, signature } = freshDelivery();
    expect(verifySignature(body, signature, timestamp, SECRET)).toBe(true);
  });

  test("accepts Buffer payloads", () => {
    const { timestamp, body, signature } = freshDelivery();
    expect(verifySignature(Buffer.from(body, "utf8"), signature, timestamp, SECRET)).toBe(true);
  });

  test("rejects a tampered body", () => {
    const { timestamp, body, signature } = freshDelivery();
    expect(verifySignature(body.replace("em_1", "em_2"), signature, timestamp, SECRET)).toBe(false);
  });

  test("rejects the wrong secret", () => {
    const { timestamp, body, signature } = freshDelivery();
    expect(verifySignature(body, signature, timestamp, "whsec_other")).toBe(false);
  });

  test("rejects a signature computed over a different timestamp", () => {
    const { timestamp, body } = freshDelivery();
    const otherTimestamp = String(Number(timestamp) + 1);
    expect(verifySignature(body, sign(SECRET, otherTimestamp, body), timestamp, SECRET)).toBe(false);
  });

  test("rejects the legacy sha256=-prefixed format", () => {
    const { timestamp, body, signature } = freshDelivery();
    expect(verifySignature(body, `sha256=${signature}`, timestamp, SECRET)).toBe(false);
  });

  test("rejects a timestamp outside the tolerance window (replay)", () => {
    const timestamp = String(Date.now() - DEFAULT_TOLERANCE_MS - 1000);
    const body = JSON.stringify({ event: "email.sent", data: {}, timestamp });
    expect(verifySignature(body, sign(SECRET, timestamp, body), timestamp, SECRET)).toBe(false);
  });

  test("accepts a stale timestamp when toleranceMs is Infinity", () => {
    const timestamp = String(Date.now() - DEFAULT_TOLERANCE_MS - 1000);
    const body = JSON.stringify({ event: "email.sent", data: {}, timestamp });
    const signature = sign(SECRET, timestamp, body);
    expect(verifySignature(body, signature, timestamp, SECRET, { toleranceMs: Infinity })).toBe(true);
  });

  test("rejects a non-numeric timestamp", () => {
    const body = JSON.stringify({ event: "email.sent", data: {} });
    expect(verifySignature(body, sign(SECRET, "not-a-number", body), "not-a-number", SECRET)).toBe(false);
  });
});

describe("constructEvent", () => {
  test("returns the parsed event when the signature is valid", () => {
    const { timestamp, body, signature } = freshDelivery({ emailId: "em_9" });
    const event = constructEvent<{ event: string; data: { emailId: string } }>(body, signature, timestamp, SECRET);
    expect(event.event).toBe("email.sent");
    expect(event.data.emailId).toBe("em_9");
  });

  test("throws on an invalid signature", () => {
    const { timestamp, body } = freshDelivery();
    expect(() => constructEvent(body, "0".repeat(64), timestamp, SECRET)).toThrow("Invalid webhook signature");
  });
});
