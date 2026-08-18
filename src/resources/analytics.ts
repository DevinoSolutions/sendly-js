import type { Sendly } from "../client";
import type {
  AnalyticsCampaignStatsV1,
  AnalyticsCampaignsV1Query,
  AnalyticsTimeseriesV1,
  AnalyticsTimeseriesV1Query,
  AnalyticsTopCampaignsV1,
  ListTopCampaignsV1Query,
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
}
