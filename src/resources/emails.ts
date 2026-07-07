import type { Sendly } from "../client";
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

export interface IdempotencyOptions {
  /** Optional idempotency key (1–255 chars). Sent as `Idempotency-Key` header. Replays are deduped for 24h. */
  idempotencyKey?: string;
}

function idemHeader(opts?: IdempotencyOptions): Record<string, string> | undefined {
  if (!opts?.idempotencyKey) return undefined;
  return { "Idempotency-Key": opts.idempotencyKey };
}

export class EmailsResource {
  constructor(private readonly client: Sendly) {}

  /** Send a single transactional email. */
  async send(body: SendEmailRequest, opts?: IdempotencyOptions): Promise<SendEmailData | SendEmailData[]> {
    const envelope = await this.client.request<{ success: true; data: SendEmailData | SendEmailData[] }>({
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
