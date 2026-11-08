import type { Sendly } from "../client";
import { paginateLegacyCursor } from "../pagination";
import type {
  ActivityCountQuery,
  ActivityDateRangeQuery,
  AnalyticsCampaignStatsV1,
  AnalyticsCampaignsV1Query,
  AnalyticsTimeseriesV1,
  AnalyticsTimeseriesV1Query,
  AnalyticsTopCampaignsV1,
  ApiObject,
  LegacyCursorPage,
  ListActivityQuery,
  ListTopCampaignsV1Query,
  ListTopEventsQuery,
  ListUpcomingActivityQuery,
} from "../types";

/**
 * Sending analytics on the `/api/v1` surface.
 *
 * Every method takes an optional `{ from, to }` window that defaults to the
 * last 30 days and is clamped to at most 90 days back. A wider request is
 * narrowed rather than refused, so read the `window` field on the response
 * before comparing two results — it states the range actually covered.
 *
 * None of these endpoints are cursor-paginated (a leaderboard is a top-N by
 * definition, and a timeseries is bounded by its window), so there are no
 * `*All` iterators here.
 */
export class AnalyticsResource {
  constructor(private readonly client: Sendly) {}

  /** Daily sending and engagement counts across the window. */
  async timeseries(query?: AnalyticsTimeseriesV1Query): Promise<AnalyticsTimeseriesV1> {
    return this.client.request<AnalyticsTimeseriesV1>({
      method: "GET",
      path: "/api/v1/analytics/timeseries",
      query,
    });
  }

  /** Campaign totals for the window: how many ran, and their average rates. */
  async campaigns(query?: AnalyticsCampaignsV1Query): Promise<AnalyticsCampaignStatsV1> {
    return this.client.request<AnalyticsCampaignStatsV1>({
      method: "GET",
      path: "/api/v1/analytics/campaigns",
      query,
    });
  }

  /** Campaigns sent in the window ranked by open rate, capped at 50 rows. */
  async topCampaigns(query?: ListTopCampaignsV1Query): Promise<AnalyticsTopCampaignsV1> {
    return this.client.request<AnalyticsTopCampaignsV1>({
      method: "GET",
      path: "/api/v1/analytics/top-campaigns",
      query,
    });
  }

  /*
   * THE ACTIVITY FEED and a few legacy aggregates (`/api/activity`,
   * `/api/analytics/top-events`). These speak the legacy dialect: query
   * parameters are camelCase and responses are unwrapped from a
   * `{ success, data }` envelope.
   */

  /**
   * One page of this project's activity feed: sends, opens, bounces, workflow
   * steps and more. Pages on `limit` + `cursor` and answers
   * `{ data, cursor, hasMore }`; {@link listAllActivity} drives the loop. Keep
   * the filters (`contactId`, `types`, `startDate`, `endDate`) fixed for a walk.
   */
  async listActivity(query?: ListActivityQuery): Promise<LegacyCursorPage<ApiObject>> {
    const envelope = await this.client.request<{ success: true; data: LegacyCursorPage<ApiObject> }>({
      method: "GET",
      path: "/api/activity",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Iterate the whole activity feed across pages, one entry at a time. */
  async *listAllActivity(query?: ListActivityQuery): AsyncGenerator<ApiObject, void, undefined> {
    yield* paginateLegacyCursor<ApiObject>((cursor) => this.listActivity({ ...query, cursor }), query?.cursor);
  }

  /** Count this project's activity in the last few minutes (`minutes`, 1 to 60). */
  async getActivityCount(query?: ActivityCountQuery): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: "/api/activity/recent-count",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Summarise this project's activity by type over `startDate`..`endDate`. */
  async getActivityStats(query?: ActivityDateRangeQuery): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: "/api/activity/stats",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Scheduled sends and workflow steps due soon (`limit` up to 100, `daysAhead` up to 90). */
  async listUpcomingActivity(query?: ListUpcomingActivityQuery): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: "/api/activity/upcoming",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** The most frequent events in a period (`limit` up to 20, then `startDate`..`endDate`). */
  async listTopEvents(query?: ListTopEventsQuery): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: "/api/analytics/top-events",
      query,
    });
    return this.client.unwrap(envelope);
  }
}
