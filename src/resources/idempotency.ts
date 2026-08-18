/**
 * Shared idempotency plumbing. Every write endpoint that accepts a replay key
 * takes the same option bag, so it lives here rather than being redeclared per
 * resource.
 */

export interface IdempotencyOptions {
  /** Optional idempotency key (1–255 chars). Sent as `Idempotency-Key` header. Replays are deduped for 24h. */
  idempotencyKey?: string;
}

/** Build the `Idempotency-Key` header, or nothing when no key was supplied. */
export function idemHeader(opts?: IdempotencyOptions): Record<string, string> | undefined {
  if (!opts?.idempotencyKey) return undefined;
  return { "Idempotency-Key": opts.idempotencyKey };
}
