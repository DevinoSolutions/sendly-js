/**
 * @sendly/sdk — official TypeScript SDK for the Sendly REST API.
 *
 * @example
 * ```ts
 * import { Sendly } from '@sendly/sdk';
 * const sendly = new Sendly({ apiKey: process.env.SENDLY_API_KEY! });
 * await sendly.emails.send({ from: 'a@b.com', to: 'c@d.com', subject: 'hi', html: '<p>hi</p>' });
 * ```
 */

export { Sendly, DEFAULT_BASE_URL, SDK_VERSION } from "./client";
export type { SendlyClientOptions, RequestOptions } from "./client";

export { EmailsResource } from "./resources/emails";
export type { IdempotencyOptions } from "./resources/emails";
export { ContactsResource } from "./resources/contacts";
export { DomainsResource } from "./resources/domains";
export { TemplatesResource } from "./resources/templates";
export { WebhooksResource } from "./resources/webhooks";
export type { ListWebhookCallsQuery } from "./resources/webhooks";
export { SuppressionResource } from "./resources/suppression";
export { EventsResource } from "./resources/events";
export { VerifyResource } from "./resources/verify";

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
} from "./errors";

export type * from "./types";

export { verifySignature, constructEvent, DEFAULT_TOLERANCE_MS } from "./webhook-utils";
export type { VerifySignatureOptions } from "./webhook-utils";
