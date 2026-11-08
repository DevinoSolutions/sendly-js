import type { Sendly } from "../client";
import { paginateLegacyCursor } from "../pagination";
import type {
  ActivityCountQuery,
  ActivityDateRangeQuery,
  ApiObject,
  LegacyCursorPage,
  ListActivityQuery,
  ListUpcomingActivityQuery,
} from "../types";

/**
 * The project's activity feed: sends, opens, bounces, workflow steps and more.
 *
 * Legacy `/api/activity` routes: query parameters are camelCase and responses
 * are unwrapped from a `{ success, data }` envelope. Needs `analytics:read`.
 */
export class ActivityResource {
  constructor(private readonly client: Sendly) {}

  /**
   * One page of the feed. Pages on `limit` + `cursor` and answers
   * `{ data, cursor, hasMore }`; {@link listAll} drives the loop. Keep the
   * filters (`contactId`, `types`, `startDate`, `endDate`) fixed for a walk.
   */
  async list(query?: ListActivityQuery): Promise<LegacyCursorPage<ApiObject>> {
    const envelope = await this.client.request<{ success: true; data: LegacyCursorPage<ApiObject> }>({
      method: "GET",
      path: "/api/activity",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Iterate the whole feed across pages, one entry at a time. */
  async *listAll(query?: ListActivityQuery): AsyncGenerator<ApiObject, void, undefined> {
    yield* paginateLegacyCursor<ApiObject>((cursor) => this.list({ ...query, cursor }), query?.cursor);
  }

  /** Count activity in the last few minutes (`minutes`, 1 to 60). */
  async recentCount(query?: ActivityCountQuery): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: "/api/activity/recent-count",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Summarise activity by type over `startDate`..`endDate`. */
  async stats(query?: ActivityDateRangeQuery): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: "/api/activity/stats",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Scheduled sends and workflow steps due soon (`limit` up to 100, `daysAhead` up to 90). */
  async upcoming(query?: ListUpcomingActivityQuery): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: "/api/activity/upcoming",
      query,
    });
    return this.client.unwrap(envelope);
  }
}
