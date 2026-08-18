import type { Sendly } from "../client";
import type { UsageV1 } from "../types";

/**
 * Current usage against the limits that are actually enforced, on the
 * `/api/v1` surface.
 */
export class UsageResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Retrieve this month's email counts per source category against the monthly
   * cap, plus today's sends against the daily ceiling.
   *
   * Every figure is read from an enforcement path, so what this reports and
   * what refuses a send cannot disagree. Note the two windows differ: the
   * monthly counters roll over on the billing period, the daily one on the day.
   */
  async get(): Promise<UsageV1> {
    return this.client.request<UsageV1>({
      method: "GET",
      path: "/api/v1/usage",
    });
  }
}
