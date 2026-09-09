import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import { idemHeader } from "./idempotency";
import type { IdempotencyOptions } from "./idempotency";
import type {
  CampaignDeletedV1,
  CampaignFailureListV1,
  CampaignFailureV1,
  CampaignListV1,
  CampaignRetryFailedV1,
  CampaignStatsV1,
  CampaignV1,
  CreateCampaignV1Request,
  ListCampaignFailuresV1Query,
  ListCampaignsV1Query,
  SendCampaignV1Request,
  UpdateCampaignV1Request,
} from "../types";

/**
 * Campaigns on the `/api/v1` surface.
 *
 * Unlike the legacy `/api/*` resources, every method here resolves the bare
 * response body — there is no `{ success, data }` envelope to unwrap — and
 * failures arrive as RFC 9457 problem documents mapped onto the usual
 * `SendlyError` subclasses, with the registry `code` on `err.errorCode`.
 */
export class CampaignsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * List campaigns, newest first.
   *
   * Cursor-paginated: pass the previous response's `next_cursor` as `after` to
   * page forward, and stop when `has_more` is false. There is deliberately no
   * total count. Keep the filter and sort arguments identical across the whole
   * walk — changing them mid-pagination is rejected with `422 validation_error`
   * asking you to restart from the first page. Use {@link listAll} to let the
   * SDK drive the loop.
   */
  async list(query?: ListCampaignsV1Query): Promise<CampaignListV1> {
    return this.client.request<CampaignListV1>({
      method: "GET",
      path: "/api/v1/campaigns",
      query,
    });
  }

  /** Iterate every campaign across pages, yielding one campaign at a time. */
  async *listAll(query?: ListCampaignsV1Query): AsyncGenerator<CampaignV1, void, undefined> {
    yield* paginateCursor<CampaignV1>((after) => this.list({ ...query, after }), query?.after);
  }

  /**
   * Create a campaign. It lands in `DRAFT` — creating never sends; call
   * {@link send} for that.
   */
  async create(body: CreateCampaignV1Request, opts?: IdempotencyOptions): Promise<CampaignV1> {
    return this.client.request<CampaignV1>({
      method: "POST",
      path: "/api/v1/campaigns",
      body,
      headers: idemHeader(opts),
    });
  }

  /** Retrieve a single campaign. */
  async get(id: string): Promise<CampaignV1> {
    return this.client.request<CampaignV1>({
      method: "GET",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}`,
    });
  }

  /** Patch a campaign. Only the fields you send are changed. */
  async update(id: string, body: UpdateCampaignV1Request): Promise<CampaignV1> {
    return this.client.request<CampaignV1>({
      method: "PATCH",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}`,
      body,
    });
  }

  /** Delete a campaign. Resolves `{ id, deleted }`. */
  async delete(id: string): Promise<CampaignDeletedV1> {
    return this.client.request<CampaignDeletedV1>({
      method: "DELETE",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Send a campaign, or schedule it by passing `{ scheduled_for }`.
   *
   * Sending is the one irreversible campaign operation, so it takes an
   * idempotency key: reuse the same key only to retry the identical request.
   */
  async send(id: string, body?: SendCampaignV1Request, opts?: IdempotencyOptions): Promise<CampaignV1> {
    return this.client.request<CampaignV1>({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/send`,
      body,
      headers: idemHeader(opts),
    });
  }

  /** Cancel a scheduled or sending campaign. */
  async cancel(id: string): Promise<CampaignV1> {
    return this.client.request<CampaignV1>({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/cancel`,
    });
  }

  /** Pause a sending campaign. */
  async pause(id: string): Promise<CampaignV1> {
    return this.client.request<CampaignV1>({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/pause`,
    });
  }

  /** Resume a paused campaign. */
  async resume(id: string): Promise<CampaignV1> {
    return this.client.request<CampaignV1>({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/resume`,
    });
  }

  /** Delivery and engagement counters plus derived rates for one campaign. */
  async stats(id: string): Promise<CampaignStatsV1> {
    return this.client.request<CampaignStatsV1>({
      method: "GET",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/stats`,
    });
  }

  /**
   * The recipients this campaign did not reach, and why.
   *
   * {@link stats} says how many sends failed; only this says who. `reason`
   * comes from a fixed vocabulary rather than the underlying error text, so it
   * is stable enough to branch on — and it is `null` on rows recorded before
   * reasons were captured.
   *
   * Cursor-paginated like every other v1 list, but uniquely it also carries
   * `total`: {@link retryFailed} acts on that number, and `has_more` alone
   * cannot tell you whether 3 or 30,000 sends failed.
   */
  async listFailures(id: string, query?: ListCampaignFailuresV1Query): Promise<CampaignFailureListV1> {
    return this.client.request<CampaignFailureListV1>({
      method: "GET",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/failures`,
      query,
    });
  }

  /** Iterate every failed send across pages, yielding one recipient at a time. */
  async *listFailuresAll(
    id: string,
    query?: ListCampaignFailuresV1Query,
  ): AsyncGenerator<CampaignFailureV1, void, undefined> {
    yield* paginateCursor<CampaignFailureV1>((after) => this.listFailures(id, { ...query, after }), query?.after);
  }

  /**
   * Re-drive only the recipients whose send failed. Nobody who already received
   * the campaign is mailed a second time — each ledger row is claimed before it
   * is touched, and a row whose email exists already is re-queued, not re-sent.
   *
   * The walk runs in the background, so this resolves as soon as it is queued,
   * reporting `queued`: how many failed rows it was started for. Only a `SENT`
   * campaign qualifies (`400 validation_error` otherwise), and a retry already
   * running answers `409 conflict`. Takes no body.
   */
  async retryFailed(id: string): Promise<CampaignRetryFailedV1> {
    return this.client.request<CampaignRetryFailedV1>({
      method: "POST",
      path: `/api/v1/campaigns/${encodeURIComponent(id)}/retry-failed`,
    });
  }
}
