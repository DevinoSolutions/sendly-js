import type { Sendly } from "../client";
import { idemHeader } from "./idempotency";
import type { IdempotencyOptions } from "./idempotency";
import type {
  BatchSendRequest,
  BatchSendResponse,
  EmailGetResponse,
  EmailListResponse,
  ListEmailsQuery,
  SendEmailData,
  SendEmailRequest,
  SuccessEmpty,
} from "../types";

// `IdempotencyOptions` now lives in ./idempotency, shared with every other
// resource that takes a replay key. Re-exported here so the long-standing
// `sendly-sdk` -> resources/emails import path keeps resolving.
export type { IdempotencyOptions } from "./idempotency";

export class EmailsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Send a single transactional email.
   *
   * Resolves the response's `data`: `{ emails, timestamp }`, where `emails`
   * has one entry per recipient (an array `to` fans out to several). Each
   * entry is `{ contact: { id, email }, email }` — `email` being the id of
   * the queued email record for that recipient (poll `emails.get(id)` for
   * its delivery status).
   */
  async send(body: SendEmailRequest, opts?: IdempotencyOptions): Promise<SendEmailData> {
    const envelope = await this.client.request<{ success: true; data: SendEmailData }>({
      method: "POST",
      path: "/api/emails",
      body,
      headers: idemHeader(opts),
    });
    return this.client.unwrap(envelope);
  }

  /** Send a batch (up to 100) of transactional emails in one call. */
  async batch(body: BatchSendRequest, opts?: IdempotencyOptions): Promise<BatchSendResponse> {
    return this.client.request<BatchSendResponse>({
      method: "POST",
      path: "/api/emails/batch",
      body,
      headers: idemHeader(opts),
    });
  }

  /** List emails with cursor-based pagination + filters. */
  async list(query?: ListEmailsQuery): Promise<EmailListResponse> {
    return this.client.request<EmailListResponse>({
      method: "GET",
      path: "/api/emails",
      query,
    });
  }

  /** Fetch a single email and its delivery events. */
  async get(id: string): Promise<EmailGetResponse> {
    return this.client.request<EmailGetResponse>({
      method: "GET",
      path: `/api/emails/${encodeURIComponent(id)}`,
    });
  }

  /** Cancel a scheduled (PENDING) email before it fires. */
  async cancelSchedule(id: string): Promise<SuccessEmpty> {
    return this.client.request<SuccessEmpty>({
      method: "DELETE",
      path: `/api/emails/${encodeURIComponent(id)}/schedule`,
    });
  }
}
