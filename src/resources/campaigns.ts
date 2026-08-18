import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import { idemHeader } from "./idempotency";
import type { IdempotencyOptions } from "./idempotency";
import type {
  CampaignDeletedV1,
  CampaignListV1,
  CampaignStatsV1,
  CampaignV1,
  CreateCampaignV1Request,
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
}
