import type { Sendly } from "../client";
import type {
  ListSubscribeRequest,
  ListSubscribeResponse,
  ListUnsubscribeRequest,
  ListUnsubscribeResponse,
} from "../types";

/**
 * Subscription management for a mailing list, on the legacy `/api/*` surface
 * (envelope responses, camelCase).
 */
export class ListsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Subscribe a contact to a list, creating the contact if it does not exist.
   * Pass `allowResubscribe` to re-subscribe someone who previously opted out.
   */
  async subscribe(id: string, body: ListSubscribeRequest): Promise<ListSubscribeResponse> {
    return this.client.request<ListSubscribeResponse>({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/subscribe`,
      body,
    });
  }

  /** Unsubscribe a contact from a list. */
  async unsubscribe(id: string, body: ListUnsubscribeRequest): Promise<ListUnsubscribeResponse> {
    return this.client.request<ListUnsubscribeResponse>({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/unsubscribe`,
      body,
    });
  }
}
