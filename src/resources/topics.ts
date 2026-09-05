import type { Sendly } from "../client";
import type {
  CreateTopicV1Request,
  ListTopicsV1Query,
  SetTopicSubscriptionV1Request,
  TopicListV1,
  TopicSubscriptionV1,
  TopicV1,
  UpdateTopicV1Request,
} from "../types";

/**
 * Topics on the `/api/v1` surface — the consent vocabulary a project mails
 * against. A contact subscribes to a topic rather than to a campaign, so
 * switching one off silences a whole audience.
 *
 * Responses are bare v1 bodies (no `{ success, data }` envelope) and errors are
 * RFC 9457 problem documents.
 */
export class TopicsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * List topics, newest first.
   *
   * Archived topics are omitted unless `include_archived` asks for them. There
   * is no delete — archiving is the retire button, because a topic is where
   * people's answers are recorded. {@link listAll} drives the loop for you.
   *
   * Paginated on `limit` + `cursor`, not the `after` the rest of v1 uses.
   */
  async list(query?: ListTopicsV1Query): Promise<TopicListV1> {
    return this.client.request<TopicListV1>({
      method: "GET",
      path: "/api/v1/topics",
      query,
    });
  }

  /**
   * Iterate every topic across pages, yielding one topic at a time.
   *
   * The walk is written out here rather than delegated to `paginateCursor`
   * because this endpoint names its cursor `cursor` on both sides — the query
   * parameter and the response field — where every other v1 list takes `after`
   * and answers `next_cursor`.
   */
  async *listAll(query?: ListTopicsV1Query): AsyncGenerator<TopicV1, void, undefined> {
    let cursor = query?.cursor;
    for (;;) {
      const page = await this.list({ ...query, cursor });
      for (const topic of page.data) {
        yield topic;
      }
      const next = page.cursor;
      // A page that repeats the cursor it was handed would otherwise spin forever.
      if (!page.has_more || next === null || next === cursor) return;
      cursor = next;
    }
  }

  /**
   * Create a topic.
   *
   * `key` is the stable name every preference form and integration refers to,
   * so it survives a rename of `name` and cannot be changed afterwards.
   *
   * `default_opt_in` decides what silence means for a contact who never
   * answers: true for a topic introduced over a list that already consented to
   * hear from you, false for anything a person has to ask for.
   */
  async create(body: CreateTopicV1Request): Promise<TopicV1> {
    return this.client.request<TopicV1>({
      method: "POST",
      path: "/api/v1/topics",
      body,
    });
  }

  /** Retrieve a single topic. */
  async get(id: string): Promise<TopicV1> {
    return this.client.request<TopicV1>({
      method: "GET",
      path: `/api/v1/topics/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Patch a topic. Only the fields you send are changed.
   *
   * `key` is not patchable, and `archived: true` stands in for the delete that
   * does not exist: it drops the topic from the preference centre and from new
   * sends while every opt-out recorded against it survives.
   */
  async update(id: string, body: UpdateTopicV1Request): Promise<TopicV1> {
    return this.client.request<TopicV1>({
      method: "PATCH",
      path: `/api/v1/topics/${encodeURIComponent(id)}`,
      body,
    });
  }

  /**
   * Record what one contact wants on one topic. The two directions are not
   * symmetric, on purpose.
   *
   * `subscribed: true` does NOT subscribe anybody: it parks the contact at
   * `pending` and answers a `confirmation_url`, and nothing is mailed on this
   * topic until someone opens that link. There is no parameter to skip it —
   * a caller asserting a subscription is not evidence the mailbox holder
   * agreed. Sendly does not send the confirmation email; you do, from your own
   * verified domain.
   *
   * `subscribed: false` records the opt-out immediately.
   */
  async setSubscription(id: string, body: SetTopicSubscriptionV1Request): Promise<TopicSubscriptionV1> {
    return this.client.request<TopicSubscriptionV1>({
      method: "POST",
      path: `/api/v1/topics/${encodeURIComponent(id)}/subscriptions`,
      body,
    });
  }
}
