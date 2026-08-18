import type { Sendly } from "../client";
import type {
  ListSubscribeData,
  ListSubscribeRequest,
  ListSubscribeResponse,
  ListUnsubscribeData,
  ListUnsubscribeRequest,
  ListUnsubscribeResponse,
} from "../types";

/**
 * Subscription management for a mailing list, on the legacy `/api/*` surface
 * (envelope responses, camelCase — the SDK unwraps to `data`).
 */
export class ListsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Subscribe a contact to a list, creating the contact if it does not exist.
   * Accepts SENDING_ONLY (`pk_*`) keys, so it can back a public subscribe form.
   *
   * **Double opt-in.** When the list has `doubleOptIn` enabled the membership
   * is created as `PENDING` and the result carries a `confirmToken`. Sendly
   * does **not** send the confirmation email — your application must deliver
   * `/api/lists/confirm?token=<confirmToken>` to the contact itself. The token
   * is valid for 24 hours.
   *
   * **Re-subscribing after an opt-out.** If the email already holds an
   * `UNSUBSCRIBED` membership on this list, the call fails with
   * `409 RESUBSCRIBE_CONFIRMATION_REQUIRED` unless the body sets
   * `allowResubscribe: true`. Reversing an opt-out is a consent decision, so it
   * is never the default — set the flag only when the contact themselves asked
   * to be re-subscribed.
   *
   * Prefer `previousStatus` over `created` when describing the transition to a
   * user; it reports the status held before the call, or `null` if there was no
   * membership.
   */
  async subscribe(id: string, body: ListSubscribeRequest): Promise<ListSubscribeData> {
    const envelope = await this.client.request<ListSubscribeResponse>({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/subscribe`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Unsubscribe a contact from a list. Resolves the address that was removed. */
  async unsubscribe(id: string, body: ListUnsubscribeRequest): Promise<ListUnsubscribeData> {
    const envelope = await this.client.request<ListUnsubscribeResponse>({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/unsubscribe`,
      body,
    });
    return this.client.unwrap(envelope);
  }
}
