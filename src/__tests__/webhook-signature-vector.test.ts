import { afterEach, describe, expect, test, vi } from "vitest";
import { constructEvent, verifySignature } from "../index";

/**
 * The published test vector (README "Verifying webhooks" and the webhooks guide
 * at https://docs.sendly.now/guides/webhooks). The expected digest is a literal,
 * produced by Sendly's own server-side signer, not recomputed here: a test that
 * rebuilt the HMAC the way the verifier does would pass whatever the verifier did.
 * If this fails, the documented scheme and the SDK disagree; fix the SDK or the
 * docs, never just the literal.
 */
const SECRET = "whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYX";
const TIMESTAMP = "1700000000000";
const BODY = '{"event":"email.sent","data":{"emailId":"e1"},"timestamp":"1700000000000"}';
const SIGNATURE = "e8f3ca5c77d88269b09281a87b5fc48618b3be252093374345312315a92be620";

afterEach(() => {
  vi.useRealTimers();
});

describe("published webhook test vector", () => {
  test("verifies with the freshness check disabled", () => {
    expect(verifySignature(BODY, SIGNATURE, TIMESTAMP, SECRET, { toleranceMs: Infinity })).toBe(true);
  });

  test("verifies under the default tolerance when the clock is at the vector's instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Number(TIMESTAMP));
    expect(verifySignature(BODY, SIGNATURE, TIMESTAMP, SECRET)).toBe(true);
    expect(constructEvent<{ event: string }>(BODY, SIGNATURE, TIMESTAMP, SECRET).event).toBe("email.sent");
  });

  test("is rejected as stale under the default tolerance on the real clock", () => {
    expect(verifySignature(BODY, SIGNATURE, TIMESTAMP, SECRET)).toBe(false);
  });

  test("keys the whole stored secret, whsec_ prefix included, without base64-decoding it", () => {
    const decoded = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYX";
    expect(verifySignature(BODY, SIGNATURE, TIMESTAMP, decoded, { toleranceMs: Infinity })).toBe(false);
  });

  test("rejects a one-character change to the digest", () => {
    const tampered = `${SIGNATURE.slice(0, -1)}1`;
    expect(verifySignature(BODY, tampered, TIMESTAMP, SECRET, { toleranceMs: Infinity })).toBe(false);
  });
});
