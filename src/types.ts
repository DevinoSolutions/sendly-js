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

/**
 * One transition in a message's delivery history — the append-only record
 * behind `status`. `status` says where the message is now; these say how it got
 * there.
 */
export type EmailEvent = components["schemas"]["EmailEvent"];

/** An email together with its delivery history, oldest first. */
export type EmailWithEvents = components["schemas"]["EmailWithEvents"];

/**
 * A single email with no history — what `emails.cancelSchedule` resolves.
 *
 * Was `EmailGetResponse` in 1.0, which named the operation rather than the
 * shape and was then reused by an operation that is not a GET.
 */
export type EmailResponse = components["schemas"]["EmailResponse"];

/** `emails.get` — one email plus its delivery events. */
export type EmailDetailResponse = components["schemas"]["EmailDetailResponse"];

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
/** Body for pointing a verified domain at a sending stream. */
export type AssignDomainStreamRequest = components["schemas"]["AssignDomainStream"];
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

/** Body for composing and SENDING from a hosted mailbox, as that address. */
export type ComposeMailboxMessageRequest = components["schemas"]["ComposeMailboxMessage"];
/**
 * Body for asking Sendly's assistant to WRITE mailbox text — a message from a
 * brief, a rewrite, or subject-line alternatives.
 *
 * It stores nothing and sends nothing: the answer is text handed back for you to
 * review, with no id of any kind. `mailboxes:read` is enough to call it, where
 * sending needs `mailboxes:send`.
 */
export type DraftMailboxMessageRequest = components["schemas"]["DraftMailboxMessage"];

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

// ---------- Snippets ----------
//
// Reusable fragments a template pulls in with `{{> name}}`. Legacy dialect
// (envelope + camelCase), and gated by the same `templates:*` scopes as the
// templates that include them — a snippet is part of a template body, not a
// resource with an audience of its own.

export type SnippetRecord = components["schemas"]["Snippet"];
export type SnippetListResponse = components["schemas"]["SnippetListResponse"];
export type CreateSnippetRequest = components["schemas"]["CreateSnippet"];
export type UpdateSnippetRequest = components["schemas"]["UpdateSnippet"];

export type ListSnippetsQuery = NonNullable<paths["/api/snippets"]["get"]["parameters"]["query"]>;

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
/** `email_category` defaults to `MARKETING` server-side, so it is optional here. */
export type CreateCampaignV1Request = PartialKeys<components["schemas"]["CampaignV1Create"], "email_category">;
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

// ---------- Contacts (v1) ----------

export type ContactV1 = components["schemas"]["ContactV1"];
export type ContactListV1 = components["schemas"]["ContactV1List"];
export type ContactDeletedV1 = components["schemas"]["ContactV1Deleted"];
/** `subscribed` defaults to `true` server-side, so it is optional here. */
export type CreateContactV1Request = PartialKeys<components["schemas"]["ContactV1Create"], "subscribed">;
export type UpdateContactV1Request = components["schemas"]["ContactV1Update"];
/** Everything one contact has said they want, topic by topic. */
export type ContactTopicPreferencesV1 = components["schemas"]["ContactTopicPreferencesV1"];

export type ListContactsV1Query = NonNullable<paths["/api/v1/contacts"]["get"]["parameters"]["query"]>;

// ---------- Lists (v1) ----------

export type ListV1 = components["schemas"]["ListV1"];
export type ListListV1 = components["schemas"]["ListV1List"];
export type ListDeletedV1 = components["schemas"]["ListV1Deleted"];
/** `double_opt_in` defaults to `false` server-side, so it is optional here. */
export type CreateListV1Request = PartialKeys<components["schemas"]["ListV1Create"], "double_opt_in">;
export type UpdateListV1Request = components["schemas"]["ListV1Update"];

export type ListListsV1Query = NonNullable<paths["/api/v1/lists"]["get"]["parameters"]["query"]>;

// ---------- Templates (v1) ----------

export type TemplateV1 = components["schemas"]["TemplateV1"];
export type TemplateListV1 = components["schemas"]["TemplateV1List"];
export type TemplateDeletedV1 = components["schemas"]["TemplateV1Deleted"];
/** `email_category` defaults to `MARKETING` server-side, so it is optional here. */
export type CreateTemplateV1Request = PartialKeys<components["schemas"]["TemplateV1Create"], "email_category">;
export type UpdateTemplateV1Request = components["schemas"]["TemplateV1Update"];

export type ListTemplatesV1Query = NonNullable<paths["/api/v1/templates"]["get"]["parameters"]["query"]>;

// ---------- Domains (v1) ----------

export type DomainV1 = components["schemas"]["DomainV1"];
export type DomainListV1 = components["schemas"]["DomainV1List"];
export type DomainDeletedV1 = components["schemas"]["DomainV1Deleted"];
export type CreateDomainV1Request = components["schemas"]["DomainV1Create"];

export type ListDomainsV1Query = NonNullable<paths["/api/v1/domains"]["get"]["parameters"]["query"]>;

// ---------- Webhooks (v1) ----------

export type WebhookV1 = components["schemas"]["WebhookV1"];
export type WebhookListV1 = components["schemas"]["WebhookV1List"];
export type WebhookDeletedV1 = components["schemas"]["WebhookV1Deleted"];
/** The create response, and the only time the signing secret is readable. */
export type WebhookCreatedV1 = components["schemas"]["WebhookV1Created"];
/** Rotation answers the new secret once, for the same reason. */
export type WebhookSecretRotatedV1 = components["schemas"]["WebhookV1SecretRotated"];
export type CreateWebhookV1Request = components["schemas"]["WebhookV1Create"];
export type UpdateWebhookV1Request = components["schemas"]["WebhookV1Update"];

export type ListWebhooksV1Query = NonNullable<paths["/api/v1/webhooks"]["get"]["parameters"]["query"]>;

// ---------- Suppressions (v1) ----------

export type SuppressionV1 = components["schemas"]["SuppressionV1"];
export type SuppressionListV1 = components["schemas"]["SuppressionV1List"];
export type SuppressionDeletedV1 = components["schemas"]["SuppressionV1Deleted"];
/** `reason` defaults to `MANUAL` server-side, so it is optional here. */
export type CreateSuppressionV1Request = PartialKeys<components["schemas"]["SuppressionV1Create"], "reason">;

export type ListSuppressionsV1Query = NonNullable<paths["/api/v1/suppressions"]["get"]["parameters"]["query"]>;

// ---------- Topics (v1) ----------

export type TopicV1 = components["schemas"]["TopicV1"];
export type TopicListV1 = components["schemas"]["TopicListV1"];
export type CreateTopicV1Request = components["schemas"]["TopicCreateV1"];
export type UpdateTopicV1Request = components["schemas"]["TopicUpdateV1"];
export type SetTopicSubscriptionV1Request = components["schemas"]["TopicSubscribeV1"];
export type TopicSubscriptionV1 = components["schemas"]["TopicSubscriptionV1"];
export type TopicSubscriptionStatusV1 = components["schemas"]["TopicSubscriptionStatusV1"];

export type ListTopicsV1Query = NonNullable<paths["/api/v1/topics"]["get"]["parameters"]["query"]>;

// ---------- Email validation (v1) ----------

export type ValidateEmailsV1Request = components["schemas"]["EmailValidationBatchRequestV1"];
export type EmailValidationBatchV1 = components["schemas"]["EmailValidationBatchV1"];
export type EmailValidationV1 = components["schemas"]["EmailValidationV1"];
export type EmailValidationVerdictV1 = components["schemas"]["EmailValidationVerdictV1"];
export type EmailValidationRunV1 = components["schemas"]["EmailValidationRunV1"];
export type EmailValidationResultListV1 = components["schemas"]["EmailValidationResultListV1"];
/**
 * One address's verdict inside a run's results — a validation plus the
 * `contact_id` it came from. The spec composes it inline rather than naming a
 * component, so it is read off the page it appears in.
 */
export type EmailValidationResultV1 = EmailValidationResultListV1["data"][number];

export type ListValidationResultsV1Query = NonNullable<
  paths["/api/v1/validation-runs/{id}/results"]["get"]["parameters"]["query"]
>;

// ---------- Deliverability (v1) ----------

export type DeliverabilityDiagnosisV1 = components["schemas"]["DeliverabilityDiagnosisV1"];
export type DeliverabilityFindingV1 = components["schemas"]["DeliverabilityFindingV1"];
export type DeliverabilityFindingSeverityV1 = components["schemas"]["DeliverabilityFindingSeverityV1"];
export type DeliverabilityIdentityV1 = components["schemas"]["DeliverabilityIdentityV1"];
export type DeliverabilityRecentDeliveryV1 = components["schemas"]["DeliverabilityRecentDeliveryV1"];
export type DeliverabilitySuppressionV1 = components["schemas"]["DeliverabilitySuppressionV1"];
export type RecipientDomainStatsV1 = components["schemas"]["RecipientDomainStatsV1"];
export type RecipientDomainStatsListV1 = components["schemas"]["RecipientDomainStatsV1List"];
export type DmarcReportV1 = components["schemas"]["DmarcReportV1"];
export type DmarcReportListV1 = components["schemas"]["DmarcReportV1List"];

export type DiagnoseDeliverabilityV1Query = NonNullable<
  paths["/api/v1/deliverability/diagnose"]["get"]["parameters"]["query"]
>;
export type ListRecipientDomainStatsV1Query = NonNullable<
  paths["/api/v1/deliverability/domains"]["get"]["parameters"]["query"]
>;
export type ListDmarcReportsV1Query = NonNullable<paths["/api/v1/deliverability/dmarc"]["get"]["parameters"]["query"]>;

// ---------- Campaign failures (v1) ----------

export type CampaignFailureV1 = components["schemas"]["CampaignV1Failure"];
export type CampaignFailureListV1 = components["schemas"]["CampaignV1FailureList"];
export type CampaignRetryFailedV1 = components["schemas"]["CampaignV1RetryFailed"];

export type ListCampaignFailuresV1Query = NonNullable<
  paths["/api/v1/campaigns/{id}/failures"]["get"]["parameters"]["query"]
>;

// ---------- Workflow graph and lifecycle (v1) ----------

export type WorkflowGraphV1 = components["schemas"]["WorkflowGraphV1"];
export type ReplaceWorkflowGraphV1Request = components["schemas"]["WorkflowGraphReplaceV1"];
export type CloneWorkflowV1Request = components["schemas"]["WorkflowCloneV1"];
export type WorkflowStateChangeV1 = components["schemas"]["WorkflowStateChangeV1"];

// Re-export the raw shapes for advanced use.
export type { components, operations, paths } from "./types.generated";
