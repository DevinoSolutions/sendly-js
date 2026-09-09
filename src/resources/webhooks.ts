import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  CreateWebhookRequest,
  CreateWebhookV1Request,
  ListWebhooksV1Query,
  UpdateWebhookRequest,
  UpdateWebhookV1Request,
  WebhookCallsListResponse,
  WebhookCreatedV1,
  WebhookCreateResponse,
  WebhookDeletedV1,
  WebhookGetResponse,
  WebhookListResponse,
  WebhookListV1,
  WebhookRecord,
  WebhookRotateSecretResponse,
  WebhookSecretRotatedV1,
  WebhookV1,
} from "../types";

export type ListWebhookCallsQuery = {
  limit?: number;
  cursor?: string;
};

/**
 * Webhook endpoints, on both surfaces.
 *
 * The unsuffixed methods speak the legacy `/api/*` dialect — camelCase bodies
 * inside a `{ success, data }` envelope the SDK unwraps. The `V1`-suffixed
 * methods speak `/api/v1`: bare snake_case bodies, cursor pagination, and
 * RFC 9457 problem documents on error. Both answer the same questions, so the
 * suffix is there to keep a call site from confusing one for the other.
 */
export class WebhooksResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Create a new outbound webhook subscription. The response includes the
   * signing secret — store it now, it is only returned in full at creation
   * and rotation time.
   *
   * `data` holds the two separately: `data.webhook` is the endpoint and
   * `data.secret` is the plaintext. The endpoint's own fields are NOT spread
   * alongside the secret, so the id is `data.webhook.id`.
   */
  async create(body: CreateWebhookRequest): Promise<WebhookCreateResponse> {
    return this.client.request<WebhookCreateResponse>({
      method: "POST",
      path: "/api/webhooks",
      body,
    });
  }

  /** List all webhooks for the project. */
  async list(): Promise<WebhookListResponse> {
    return this.client.request<WebhookListResponse>({
      method: "GET",
      path: "/api/webhooks",
    });
  }

  /** Fetch a single webhook (without its signing secret). */
  async get(id: string): Promise<WebhookGetResponse> {
    return this.client.request<WebhookGetResponse>({
      method: "GET",
      path: `/api/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /** Patch a webhook (URL, event types, active flag). */
  async update(id: string, body: UpdateWebhookRequest): Promise<WebhookRecord> {
    const envelope = await this.client.request<{ success: true; data: WebhookRecord }>({
      method: "PATCH",
      path: `/api/webhooks/${encodeURIComponent(id)}`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Delete a webhook. */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /** Rotate the webhook signing secret. The response contains the new secret. */
  async rotateSecret(id: string): Promise<WebhookRotateSecretResponse> {
    return this.client.request<WebhookRotateSecretResponse>({
      method: "POST",
      path: `/api/webhooks/${encodeURIComponent(id)}/rotate-secret`,
    });
  }

  /** List recent delivery attempts for a webhook. */
  async listCalls(id: string, query?: ListWebhookCallsQuery): Promise<WebhookCallsListResponse> {
    return this.client.request<WebhookCallsListResponse>({
      method: "GET",
      path: `/api/webhooks/${encodeURIComponent(id)}/calls`,
      query,
    });
  }

  /**
   * List webhook endpoints, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count.
   * {@link listAllV1} drives the loop for you. Signing secrets are not on this
   * response — see {@link rotateSecretV1} if you have lost one.
   */
  async listV1(query?: ListWebhooksV1Query): Promise<WebhookListV1> {
    return this.client.request<WebhookListV1>({
      method: "GET",
      path: "/api/v1/webhooks",
      query,
    });
  }

  /** Iterate every webhook endpoint across pages, yielding one endpoint at a time. */
  async *listAllV1(query?: ListWebhooksV1Query): AsyncGenerator<WebhookV1, void, undefined> {
    yield* paginateCursor<WebhookV1>((after) => this.listV1({ ...query, after }), query?.after);
  }

  /**
   * Register an endpoint to receive HMAC-signed deliveries for the events named
   * in `event_types`.
   *
   * Resolves `{ webhook, secret }`, and this is one of only two calls that ever
   * carry the signing secret — {@link rotateSecretV1} is the other. It is shown
   * exactly once: no read endpoint returns it, so store it now, because a
   * secret you lose is replaced by rotating rather than recovered. Feed it to
   * `verifySignature` to authenticate the deliveries that arrive at your
   * endpoint.
   */
  async createV1(body: CreateWebhookV1Request): Promise<WebhookCreatedV1> {
    return this.client.request<WebhookCreatedV1>({
      method: "POST",
      path: "/api/v1/webhooks",
      body,
    });
  }

  /** Retrieve a single webhook endpoint. The signing secret is not on this response. */
  async getV1(id: string): Promise<WebhookV1> {
    return this.client.request<WebhookV1>({
      method: "GET",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Patch a webhook endpoint. Omitted fields are left alone.
   *
   * `event_types` REPLACES the stored subscription list rather than merging
   * into it, so an event you omit is unsubscribed. Setting `status` back to
   * `ACTIVE` from `DISABLED` also clears the consecutive-failure counter, so an
   * auto-disabled endpoint gets a clean slate. The signing secret is untouched
   * by an update, and is not on this response.
   */
  async updateV1(id: string, body: UpdateWebhookV1Request): Promise<WebhookV1> {
    return this.client.request<WebhookV1>({
      method: "PATCH",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}`,
      body,
    });
  }

  /**
   * Delete a webhook endpoint, and its delivery history with it — a delivery
   * attempt is a fact about this endpoint and means nothing once the endpoint is
   * gone. Resolves `{ id, deleted }`. Deliveries already in flight are not
   * recalled, so the endpoint may still receive an event shortly after this.
   */
  async deleteV1(id: string): Promise<WebhookDeletedV1> {
    return this.client.request<WebhookDeletedV1>({
      method: "DELETE",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Mint a fresh signing secret for an endpoint.
   *
   * The new plaintext is returned exactly once, here — this and
   * {@link createV1} are the only two responses that ever carry the secret, and
   * no read endpoint hands it back, so store it now and give it to
   * `verifySignature`. A secret you lose is replaced by rotating again rather
   * than recovered.
   *
   * The outgoing secret is not cut off at once: it keeps verifying until
   * `previous_secret_expires_at`, and every delivery inside that window carries
   * BOTH signatures, so a verifier can be redeployed without dropping an event.
   * Past that moment the old secret starts being rejected — as does the older of
   * two secrets if you rotate twice inside the window, because only one previous
   * secret is ever live. `url`, `event_types` and `status` are unchanged.
   */
  async rotateSecretV1(id: string): Promise<WebhookSecretRotatedV1> {
    return this.client.request<WebhookSecretRotatedV1>({
      method: "POST",
      path: `/api/v1/webhooks/${encodeURIComponent(id)}/rotate-secret`,
    });
  }
}
