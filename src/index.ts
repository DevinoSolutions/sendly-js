/**
 * sendly-sdk — official TypeScript SDK for the Sendly REST API.
 *
 * @example
 * ```ts
 * import { Sendly } from 'sendly-sdk';
 * const sendly = new Sendly({ apiKey: process.env.SENDLY_API_KEY! });
 * await sendly.emails.send({ from: 'a@b.com', to: 'c@d.com', subject: 'hi', html: '<p>hi</p>' });
 * ```
 */

export { Sendly, DEFAULT_BASE_URL, SDK_VERSION } from "./client";
export type { SendlyClientOptions, RequestOptions } from "./client";

export { EmailsResource } from "./resources/emails";
export type { IdempotencyOptions } from "./resources/idempotency";
export { ContactsResource } from "./resources/contacts";
export { DomainsResource } from "./resources/domains";
export { TemplatesResource } from "./resources/templates";
export { WebhooksResource } from "./resources/webhooks";
export type { ListWebhookCallsQuery } from "./resources/webhooks";
export { SuppressionResource } from "./resources/suppression";
export { EventsResource } from "./resources/events";
export { VerifyResource } from "./resources/verify";
export { ListsResource } from "./resources/lists";
export { MailboxesResource } from "./resources/mailboxes";

// /api/v1 resources — bare responses, snake_case fields, RFC 9457 errors.
export { CampaignsResource } from "./resources/campaigns";
export { SegmentsResource } from "./resources/segments";
export { WorkflowsResource } from "./resources/workflows";
export { AnalyticsResource } from "./resources/analytics";
export { UsageResource } from "./resources/usage";
export { ProjectsResource } from "./resources/projects";

export { paginateCursor } from "./pagination";
export type { CursorPage, CursorPageQuery } from "./pagination";

export {
  SendlyError,
  SendlyValidationError,
  SendlyAuthenticationError,
  SendlyPermissionError,
  SendlyNotFoundError,
  SendlyConflictError,
  SendlyRateLimitError,
  SendlyServerError,
  SendlyConnectionError,
  asProblemDocument,
} from "./errors";
export type { ProblemDocument, ProblemFieldError } from "./errors";

export type * from "./types";

export { verifySignature, constructEvent, DEFAULT_TOLERANCE_MS } from "./webhook-utils";
export type { VerifySignatureOptions } from "./webhook-utils";
