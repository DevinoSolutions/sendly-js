import type { Sendly } from "../client";
import { idemHeader } from "./idempotency";
import type { IdempotencyOptions } from "./idempotency";
import type {
  BatchSendRequest,
  BatchSendResponse,
  EmailDetailResponse,
  EmailListResponse,
  EmailTestV1,
  EmailV1,
  ListEmailsQuery,
  SendEmailData,
  SendEmailRequest,
  SendEmailV1Request,
  EmailResponse,
  SendTestEmailV1Request,
} from "../types";

// `IdempotencyOptions` now lives in ./idempotency, shared with every other
// resource that takes a replay key. Re-exported here so the long-standing
// `sendly-sdk` -> resources/emails import path keeps resolving.
export type { IdempotencyOptions } from "./idempotency";

export class EmailsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Send one transactional email.
   *
   * Posts to the versioned `POST /api/v1/emails` and resolves the bare receipt
   * it answers `202` with: `{ id, status, to, from }`. `status` is a real
   * delivery state — poll `emails.get(id)` for the events behind it. Takes a
   * single recipient; `cc`/`bcc` copy others.
   *
   * Before 1.0 this posted to the legacy `POST /api/emails`, which answered
   * with row ids and no delivery status and fanned an array `to` out to several
   * recipients. That behaviour is {@link sendLegacy}, unchanged.
   */
  async send(body: SendEmailV1Request, opts?: IdempotencyOptions): Promise<EmailV1> {
    return this.client.request<EmailV1>({
      method: "POST",
      path: "/api/v1/emails",
      body,
      headers: idemHeader(opts),
    });
  }

  /**
   * The pre-1.0 `send()`: the legacy `POST /api/emails`.
   *
   * Resolves the envelope's `data`, `{ emails, timestamp }`, where `emails` has
   * one entry per recipient (an array `to` fans out to several). Each entry is
   * `{ contact: { id, email }, email }` — `email` being the id of the queued
   * email record for that recipient. Reports no delivery status of its own.
   *
   * Kept as the escape hatch for a caller that depends on the fan-out or on the
   * envelope shape. New code should use {@link send}.
   */
  async sendLegacy(body: SendEmailRequest, opts?: IdempotencyOptions): Promise<SendEmailData> {
    const envelope = await this.client.request<{ success: true; data: SendEmailData }>({
      method: "POST",
      path: "/api/emails",
      body,
      headers: idemHeader(opts),
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Send a test email from the project's sandbox address.
   *
   * Goes nowhere real: the sandbox address is the SENDER, resolved server-side
   * (naming a `from` is refused), and the mail lands in the project owner's own
   * verified inbox. This exercises rendering and the send path without touching
   * a live recipient or a reputation. Read `projects.get().sandbox_address` to
   * know what it sends from — the response's `sandbox: true` says only that it
   * was one.
   */
  async sendTest(body: SendTestEmailV1Request): Promise<EmailTestV1> {
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

  /**
   * Fetch a single email together with its DELIVERY history, oldest first.
   *
   * `events` here is the delivery timeline behind `status` — not the custom
   * events recorded with `events.record`, which are read from `events.list`.
   * Before 1.1 this operation answered the wrong relation and published the
   * message's dedup and idempotency ledger keys along with it.
   */
  async get(id: string): Promise<EmailDetailResponse> {
    return this.client.request<EmailDetailResponse>({
      method: "GET",
      path: `/api/emails/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Cancel a scheduled (PENDING) email before it fires.
   *
   * Resolves the email itself, not an empty acknowledgement: the contract has
   * always published `EmailResponse` here, and the caller wants the row's new
   * status more than it wants a `{ success: true }` it already inferred from the
   * absence of an exception.
   */
  async cancelSchedule(id: string): Promise<EmailResponse> {
    return this.client.request<EmailResponse>({
      method: "DELETE",
      path: `/api/emails/${encodeURIComponent(id)}/schedule`,
    });
  }
}
