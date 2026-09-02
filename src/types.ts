/**
 * Curated, hand-friendly aliases for types generated from the OpenAPI spec.
 * Consumers import from here (or the package root) instead of the raw
 * `paths`/`operations`/`components` indirection.
 */
import type { components, paths } from "./types.generated";

// ---------- Codegen corrections ----------
//
// The generated types are stricter than the API actually is in one place.
// The correction is applied only to the alias below, never by editing
// `types.generated.ts` (which `pnpm build:types` overwrites).

/** Make `K` optional on `T`, leaving every other member as generated. */
type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

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

/**
 * The hand-off a caller opens in a browser to finish DNS setup. Inline in the
 * spec rather than a named component, so it is read off the path.
 */
export type DomainSetupSession = NonNullable<
  paths["/api/domains/{id}/dodomain-session"]["post"]["responses"][200]["content"]["application/json"]
>["data"];

// ---------- Mailboxes ----------

export type MailboxRecord = components["schemas"]["Mailbox"];
/** A mailbox plus the IMAP/SMTP host, port and username a mail client needs. */
export type MailboxDetail = components["schemas"]["MailboxDetail"];
export type AppPasswordRecord = components["schemas"]["AppPassword"];

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

// ---------- Lists ----------

/** `allowResubscribe` defaults to `false` server-side, so it is optional here. */
export type ListSubscribeRequest = PartialKeys<components["schemas"]["ListSubscribe"], "allowResubscribe">;
export type ListSubscribeResponse = components["schemas"]["ListSubscribeResponse"];
export type ListUnsubscribeRequest = components["schemas"]["ListUnsubscribe"];
export type ListUnsubscribeResponse = components["schemas"]["ListUnsubscribeResponse"];

// Inner `data` payloads the SDK unwraps to (the spec inlines them in the
// response envelopes, so they are derived rather than standalone schemas).
export type ListSubscribeData = ListSubscribeResponse["data"];
export type ListUnsubscribeData = ListUnsubscribeResponse["data"];

// ===========================================================================
// /api/v1 surface
//
// A different dialect from the legacy `/api/*` types above: success responses
// are the bare resource (no `{ success, data }` envelope), errors are RFC 9457
// problem documents, and every field is snake_case. Names carry a `V1` suffix
// so the two dialects never get mixed up at a call site.
// ===========================================================================

/** RFC 9457 problem document — the error body of every `/api/v1` 4xx/5xx. */
export type Problem = components["schemas"]["Problem"];

// ---------- Campaigns (v1) ----------

export type CampaignV1 = components["schemas"]["CampaignV1"];
export type CampaignListV1 = components["schemas"]["CampaignV1List"];
export type CampaignDeletedV1 = components["schemas"]["CampaignV1Deleted"];
export type CampaignStatsV1 = components["schemas"]["CampaignV1Stats"];
/** `type` defaults to `MARKETING` server-side, so it is optional here. */
export type CreateCampaignV1Request = PartialKeys<components["schemas"]["CampaignV1Create"], "type">;
export type UpdateCampaignV1Request = components["schemas"]["CampaignV1Update"];
export type SendCampaignV1Request = components["schemas"]["CampaignV1Send"];

export type ListCampaignsV1Query = NonNullable<paths["/api/v1/campaigns"]["get"]["parameters"]["query"]>;

// ---------- Segments (v1) ----------

export type SegmentV1 = components["schemas"]["SegmentV1"];
export type SegmentListV1 = components["schemas"]["SegmentV1List"];
export type SegmentDeletedV1 = components["schemas"]["SegmentV1Deleted"];
export type SegmentContactV1 = components["schemas"]["SegmentContactV1"];
export type SegmentContactListV1 = components["schemas"]["SegmentContactV1List"];
/** `type` (`DYNAMIC`) and `track_membership` (`false`) default server-side. */
export type CreateSegmentV1Request = PartialKeys<components["schemas"]["SegmentV1Create"], "type" | "track_membership">;
export type UpdateSegmentV1Request = components["schemas"]["SegmentV1Update"];

export type ListSegmentsV1Query = NonNullable<paths["/api/v1/segments"]["get"]["parameters"]["query"]>;
export type ListSegmentContactsV1Query = NonNullable<
  paths["/api/v1/segments/{id}/contacts"]["get"]["parameters"]["query"]
>;

// ---------- Workflows (v1) ----------

export type WorkflowV1 = components["schemas"]["WorkflowV1"];
export type WorkflowListV1 = components["schemas"]["WorkflowV1List"];
export type WorkflowDeletedV1 = components["schemas"]["WorkflowDeletedV1"];
export type WorkflowStatsV1 = components["schemas"]["WorkflowStatsV1"];
export type WorkflowExecutionV1 = components["schemas"]["WorkflowExecutionV1"];
export type WorkflowExecutionListV1 = components["schemas"]["WorkflowExecutionV1List"];
export type CreateWorkflowV1Request = components["schemas"]["WorkflowCreateV1"];
export type UpdateWorkflowV1Request = components["schemas"]["WorkflowUpdateV1"];
export type StartWorkflowExecutionV1Request = components["schemas"]["WorkflowExecutionStartV1"];

export type ListWorkflowsV1Query = NonNullable<paths["/api/v1/workflows"]["get"]["parameters"]["query"]>;
export type ListWorkflowExecutionsV1Query = NonNullable<
  paths["/api/v1/workflows/{id}/executions"]["get"]["parameters"]["query"]
>;
export type WorkflowStatsV1Query = NonNullable<paths["/api/v1/workflows/{id}/stats"]["get"]["parameters"]["query"]>;

// ---------- Events (v1) ----------

export type EventV1 = components["schemas"]["EventV1"];
export type EventListV1 = components["schemas"]["EventV1List"];
export type EventNamesV1 = components["schemas"]["EventNamesV1"];
export type EventStatsV1 = components["schemas"]["EventStatsV1"];
export type RecordEventV1Request = components["schemas"]["EventTrackV1"];

export type ListEventsV1Query = NonNullable<paths["/api/v1/events"]["get"]["parameters"]["query"]>;
export type EventStatsV1Query = NonNullable<paths["/api/v1/events/stats"]["get"]["parameters"]["query"]>;

// ---------- Analytics + usage (v1) ----------

export type AnalyticsWindowV1 = components["schemas"]["AnalyticsWindowV1"];
export type AnalyticsTimeseriesV1 = components["schemas"]["AnalyticsTimeseriesV1"];
export type AnalyticsCampaignStatsV1 = components["schemas"]["AnalyticsCampaignStatsV1"];
export type AnalyticsTopCampaignsV1 = components["schemas"]["AnalyticsTopCampaignsV1"];
export type UsageV1 = components["schemas"]["UsageV1"];

// ---------- Projects (v1) ----------

export type ProjectV1 = components["schemas"]["ProjectV1"];

// ---------- Email send (v1) ----------
//
// The versioned send. Distinct from the legacy `SendEmailRequest` above, which
// posts to `/api/emails` and answers with row ids and no delivery status.

export type SendEmailV1Request = components["schemas"]["SendEmailV1"];
export type EmailV1 = components["schemas"]["EmailV1"];
export type SendTestEmailV1Request = components["schemas"]["SendTestEmailV1"];
export type EmailTestV1 = components["schemas"]["EmailTestV1"];

export type AnalyticsTimeseriesV1Query = NonNullable<
  paths["/api/v1/analytics/timeseries"]["get"]["parameters"]["query"]
>;
export type AnalyticsCampaignsV1Query = NonNullable<paths["/api/v1/analytics/campaigns"]["get"]["parameters"]["query"]>;
export type ListTopCampaignsV1Query = NonNullable<
  paths["/api/v1/analytics/top-campaigns"]["get"]["parameters"]["query"]
>;

// Re-export the raw shapes for advanced use.
export type { components, operations, paths } from "./types.generated";
