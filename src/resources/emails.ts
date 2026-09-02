import type { Sendly } from "../client";
import { idemHeader } from "./idempotency";
import type { IdempotencyOptions } from "./idempotency";
import type {
  BatchSendRequest,
  BatchSendResponse,
  EmailGetResponse,
  EmailListResponse,
  EmailTestV1,
  EmailV1,
  ListEmailsQuery,
  SendEmailData,
  SendEmailRequest,
  SendEmailV1Request,
  SendTestEmailV1Request,
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

  /**
   * Send one email on the versioned `/api/v1` surface, which reports delivery
   * status.
   *
   * ADDITIVE — {@link send} is untouched and still posts to the legacy
   * `/api/emails`. The two differ in what they can tell you: the legacy send
   * answers with row ids and no status, so a caller cannot learn whether the
   * message went anywhere; this one answers `202` with `{ id, status, to, from }`
   * and the status is a real delivery state. It also takes a single recipient
   * (`cc`/`bcc` copy others) rather than fanning an array out.
   *
   * Repointing `send()` here would change what existing callers receive, so it
   * is deliberately not done as part of adding this. Which one becomes the
   * default is a breaking-change decision.
   */
  async sendV1(body: SendEmailV1Request, opts?: IdempotencyOptions): Promise<EmailV1> {
    return this.client.request<EmailV1>({
      method: "POST",
      path: "/api/v1/emails",
      body,
      headers: idemHeader(opts),
    });
  }

  /**
   * Send a test email to the project's sandbox address.
   *
   * Goes nowhere real: delivery is to the sandbox, so this exercises rendering
   * and the send path without touching a live recipient or a reputation. Read
   * `projects.get().sandbox_address` to know where it lands — the response's
   * `sandbox: true` says only that it was one.
   */
  async sendTestV1(body: SendTestEmailV1Request): Promise<EmailTestV1> {
    return this.client.request<EmailTestV1>({
      method: "POST",
      path: "/api/v1/emails/test",
      body,
    });
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
