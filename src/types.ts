/**
 * Curated, hand-friendly aliases for types generated from the OpenAPI spec.
 * Consumers import from here (or the package root) instead of the raw
 * `paths`/`operations`/`components` indirection.
 */
import type { components, paths } from "./types.generated";

// ---------- Generic envelopes ----------

export type ErrorEnvelope = components["schemas"]["Error"];
export type SuccessEmpty = components["schemas"]["SuccessEmpty"];
/** `{ success, data: { id } }` envelope returned by delete endpoints (formerly the page-based `Pagination` schema, now removed in favor of cursor pagination). */
export type IdResponse = components["schemas"]["IdResponse"];

// ---------- Emails ----------

export type SendEmailRequest = components["schemas"]["SendEmail"];
export type SendEmailData = components["schemas"]["SendEmailData"];
export type SendEmailResponse = components["schemas"]["SendEmailResponse"];

export type BatchSendRequest = components["schemas"]["BatchSendBody"];
export type BatchSendResponse = components["schemas"]["BatchSendResponse"];
export type BatchEntryResult = components["schemas"]["BatchEntryResult"];

export type EmailRecord = components["schemas"]["Email"];
export type EmailListResponse = components["schemas"]["EmailListResponse"];
export type EmailGetResponse = components["schemas"]["EmailGetResponse"];

export type ListEmailsQuery = NonNullable<paths["/api/emails"]["get"]["parameters"]["query"]>;

// ---------- Contacts ----------

export type ContactRecord = components["schemas"]["Contact"];
export type ContactListResponse = components["schemas"]["ContactListResponse"];
export type CreateContactRequest = components["schemas"]["CreateContact"];
export type UpdateContactRequest = components["schemas"]["UpdateContactBody"];
export type BulkCreateContactsRequest = components["schemas"]["ContactBulkCreateBody"];
export type BulkDeleteContactsRequest = components["schemas"]["ContactBulkDeleteBody"];

export type ListContactsQuery = NonNullable<paths["/api/contacts"]["get"]["parameters"]["query"]>;

// ---------- Domains ----------

export type DomainRecord = components["schemas"]["Domain"];
export type DomainListResponse = components["schemas"]["DomainListResponse"];
export type AddDomainRequest = components["schemas"]["AddDomainBody"];
export type DomainVerificationStatus = components["schemas"]["DomainVerificationStatus"];

// ---------- Templates ----------

export type TemplateRecord = components["schemas"]["Template"];
export type TemplateListResponse = components["schemas"]["TemplateListResponse"];
export type CreateTemplateRequest = components["schemas"]["CreateTemplate"];
export type UpdateTemplateRequest = components["schemas"]["UpdateTemplate"];

export type ListTemplatesQuery = NonNullable<paths["/api/templates"]["get"]["parameters"]["query"]>;

// ---------- Webhooks ----------

export type WebhookRecord = components["schemas"]["Webhook"];
export type WebhookCreateResponse = components["schemas"]["WebhookCreateResponse"];
export type WebhookGetResponse = components["schemas"]["WebhookGetResponse"];
export type WebhookListResponse = components["schemas"]["WebhookListResponse"];
export type WebhookRotateSecretResponse = components["schemas"]["WebhookRotateSecretResponse"];
export type CreateWebhookRequest = components["schemas"]["CreateWebhook"];
export type UpdateWebhookRequest = components["schemas"]["UpdateWebhook"];
export type WebhookCall = components["schemas"]["WebhookCall"];
export type WebhookCallsListResponse = components["schemas"]["WebhookCallsListResponse"];

// ---------- Suppression ----------

export type SuppressionRecord = components["schemas"]["Suppression"];
export type SuppressionListResponse = components["schemas"]["SuppressionListResponse"];
export type SuppressionCheckResponse = components["schemas"]["SuppressionCheckResponse"];
export type AddSuppressionRequest = components["schemas"]["AddSuppression"];

export type ListSuppressionsQuery = NonNullable<paths["/api/suppression"]["get"]["parameters"]["query"]>;

// ---------- Track / verify ----------

export type TrackEventRequest = components["schemas"]["TrackEvent"];
export type TrackEventResponse = components["schemas"]["TrackEventResponse"];
// Inner `data` payload the SDK unwraps to (the spec inlines it in the response
// envelope, so it is derived rather than a standalone component schema).
export type TrackEventData = TrackEventResponse["data"];
export type VerifyEmailRequest = components["schemas"]["VerifyEmail"];
export type VerifyEmailResponse = components["schemas"]["VerifyEmailResponse"];
export type VerifyEmailData = VerifyEmailResponse["data"];

// Re-export the raw shapes for advanced use.
export type { components, operations, paths } from "./types.generated";
