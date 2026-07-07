import type { Sendly } from "../client";
import type {
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookCallsListResponse,
  WebhookCreateResponse,
  WebhookGetResponse,
  WebhookListResponse,
  WebhookRecord,
  WebhookRotateSecretResponse,
} from "../types";

export type ListWebhookCallsQuery = {
  limit?: number;
  cursor?: string;
};

export class WebhooksResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Create a new outbound webhook subscription. The response includes the
   * signing secret — store it now, it is only returned in full at creation
   * and rotation time.
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
}
