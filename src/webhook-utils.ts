import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the `X-Sendly-Signature` header on an inbound webhook delivery.
 *
 * Uses timing-safe comparison to prevent timing oracle attacks.
 *
 * @param payload  Raw request body (string or Buffer). Do NOT parse JSON first —
 *                 pass the raw body bytes exactly as received.
 * @param signature  Value of the `X-Sendly-Signature` header (e.g. `sha256=abc...`).
 * @param secret  Webhook signing secret from your Sendly dashboard.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export function verifySignature(payload: string | Buffer, signature: string, secret: string): boolean {
  const body = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length) return false;
  try {
    return timingSafeEqual(sigBuffer, expBuffer);
    // eslint-disable-next-line sendly/no-silent-catch -- timingSafeEqual throws on Buffer length mismatch; "invalid signature" (false) is the correct result, not an error
  } catch {
    return false;
  }
}

/**
 * Verify the signature and parse the webhook payload in one step.
 *
 * Throws if the signature is invalid. Returns the parsed event object if valid.
 *
 * @param payload  Raw request body (string or Buffer). Do NOT parse JSON first.
 * @param signature  Value of the `X-Sendly-Signature` header.
 * @param secret  Webhook signing secret from your Sendly dashboard.
 * @returns Parsed event payload typed as `T`.
 * @throws `Error` with message `'Invalid webhook signature'` if verification fails.
 *
 * @example
 * ```ts
 * import { constructEvent } from '@sendly/sdk';
 * // Express
 * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
 *   const event = constructEvent(req.body, req.headers['x-sendly-signature'], secret);
 *   // event.type, event.data, etc.
 *   res.sendStatus(200);
 * });
 * ```
 */
export function constructEvent<T = Record<string, unknown>>(
  payload: string | Buffer,
  signature: string,
  secret: string,
): T {
  if (!verifySignature(payload, signature, secret)) {
    throw new Error("Invalid webhook signature");
  }
  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  return JSON.parse(body) as T;
}
