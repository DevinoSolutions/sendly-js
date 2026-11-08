import type { Sendly } from "../client";
import type { ApiObject, InboxConversationPage, ListInboxConversationsQuery } from "../types";

/**
 * Conversations across EVERY mailbox in the project. Legacy `/api/inbox` route;
 * needs `mailbox-conversations:read`, an opt-in scope.
 */
export class InboxResource {
  constructor(private readonly client: Sendly) {}

  /**
   * One page of conversations, newest first. `view` picks the inbox or spam,
   * `status` narrows by state, and `q` searches subject and sender. Page by
   * passing `nextCursor` back as `cursor` until it is null;
   * {@link listAllConversations} does that for you.
   */
  async listConversations(query?: ListInboxConversationsQuery): Promise<InboxConversationPage> {
    const envelope = await this.client.request<{ success: true; data: InboxConversationPage }>({
      method: "GET",
      path: "/api/inbox/conversations",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Iterate every conversation across pages, one at a time. */
  async *listAllConversations(query?: ListInboxConversationsQuery): AsyncGenerator<ApiObject, void, undefined> {
    let cursor = query?.cursor;
    do {
      const page = await this.listConversations({ ...query, cursor });
      yield* page.items;
      const next = page.nextCursor ?? undefined;
      // A server that repeats the cursor it was given would otherwise loop forever.
      if (next === cursor) return;
      cursor = next;
    } while (cursor);
  }
}
