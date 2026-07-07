import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Default allowed clock skew between `X-Sendly-Timestamp` and the verifier's
 * clock: 5 minutes. Deliveries older (or further in the future) than this are
 * rejected to blunt replay attacks.
 */
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export interface VerifySignatureOptions {
  /**
   * Maximum allowed distance (in milliseconds) between the delivery's
   * `X-Sendly-Timestamp` and the current clock. Pass
   * `Number.POSITIVE_INFINITY` to skip the timestamp freshness check (e.g.
   * when replaying stored deliveries). Defaults to {@link DEFAULT_TOLERANCE_MS}.
   */
  toleranceMs?: number;
}

/**
 * Verify a Sendly webhook delivery.
 *
 * Sendly signs every delivery as `HMAC_SHA256(secret, "<timestamp>.<body>")`
 * and sends the bare hex digest in `X-Sendly-Signature` plus the
 * millisecond-epoch timestamp in `X-Sendly-Timestamp`. Binding the timestamp
 * into the signed message (and checking it against the clock) prevents
 * replaying captured deliveries.
 *
 * Uses timing-safe comparison to prevent timing oracle attacks.
 *
 * @param payload  Raw request body (string or Buffer). Do NOT parse JSON first —
 *                 pass the raw body bytes exactly as received.
 * @param signature  Value of the `X-Sendly-Signature` header (bare hex digest).
 * @param timestamp  Value of the `X-Sendly-Timestamp` header (milliseconds
 *                   since epoch, as a decimal string).
 * @param secret  Webhook signing secret from your Sendly dashboard.
 * @returns `true` if the signature is valid and the timestamp is within
 *          tolerance, `false` otherwise.
 */
export function verifySignature(
  payload: string | Buffer,
  signature: string,
  timestamp: string,
  secret: string,
  options: VerifySignatureOptions = {},
): boolean {
  const toleranceMs = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > toleranceMs) return false;

  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
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
 * @param timestamp  Value of the `X-Sendly-Timestamp` header.
 * @param secret  Webhook signing secret from your Sendly dashboard.
 * @returns Parsed event payload typed as `T`.
 * @throws `Error` with message `'Invalid webhook signature'` if verification fails.
 *
 * @example
 * ```ts
 * import { constructEvent } from '@sendly/sdk';
 * // Express
 * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
 *   const event = constructEvent(
 *     req.body,
 *     req.headers['x-sendly-signature'],
 *     req.headers['x-sendly-timestamp'],
 *     secret,
 *   );
 *   // event.event, event.data, etc.
 *   res.sendStatus(200);
 * });
 * ```
 */
export function constructEvent<T = Record<string, unknown>>(
  payload: string | Buffer,
  signature: string,
  timestamp: string,
  secret: string,
  options: VerifySignatureOptions = {},
): T {
  if (!verifySignature(payload, signature, timestamp, secret, options)) {
    throw new Error("Invalid webhook signature");
  }
  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  return JSON.parse(body) as T;
}
