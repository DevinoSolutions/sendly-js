import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import { idemHeader } from "./idempotency";
import type { IdempotencyOptions } from "./idempotency";
import type {
  BulkContactActionRequest,
  BulkCreateContactsRequest,
  BulkDeleteContactsRequest,
  ContactDeletedV1,
  ContactFieldList,
  ContactFieldUsage,
  ContactFieldValues,
  DownloadLink,
  ContactImportFile,
  ContactListResponse,
  ContactListV1,
  ContactRecord,
  ContactTopicPreferencesV1,
  ContactV1,
  CreateContactRequest,
  CreateContactV1Request,
  ExportContactsQuery,
  IdAck,
  ListContactFieldValuesQuery,
  ListContactsQuery,
  ListContactsV1Query,
  LookupContactsRequest,
  LookupContactsResponse,
  MessageAck,
  QueuedAck,
  UpdateContactRequest,
  UpdateContactV1Request,
} from "../types";

/**
 * Contacts, on both surfaces.
 *
 * The unsuffixed methods speak the legacy `/api/*` dialect — camelCase bodies
 * inside a `{ success, data }` envelope the SDK unwraps. The `V1`-suffixed
 * methods speak `/api/v1`: bare snake_case bodies, cursor pagination, and
 * RFC 9457 problem documents on error. Both answer the same questions, so the
 * suffix is there to keep a call site from confusing one for the other.
 */
export class ContactsResource {
  constructor(private readonly client: Sendly) {}

  /** Create a new contact (fails on duplicate). */
  async create(body: CreateContactRequest, opts?: IdempotencyOptions): Promise<ContactRecord> {
    const envelope = await this.client.request<{ success: true; data: ContactRecord }>({
      method: "POST",
      path: "/api/contacts",
      body,
      headers: idemHeader(opts),
    });
    return this.client.unwrap(envelope);
  }

  /** Insert or update a contact identified by email. */
  async upsert(body: CreateContactRequest, opts?: IdempotencyOptions): Promise<ContactRecord> {
    const envelope = await this.client.request<{ success: true; data: ContactRecord }>({
      method: "POST",
      path: "/api/contacts/upsert",
      body,
      headers: idemHeader(opts),
    });
    return this.client.unwrap(envelope);
  }

  /** Bulk-create contacts (up to API limit). Returns per-row results. */
  async bulkCreate(body: BulkCreateContactsRequest, opts?: IdempotencyOptions): Promise<unknown> {
    return this.client.request<unknown>({
      method: "POST",
      path: "/api/contacts/bulk",
      body,
      headers: idemHeader(opts),
    });
  }

  /** Bulk-delete contacts by id or email. */
  async bulkDelete(body: BulkDeleteContactsRequest): Promise<unknown> {
    return this.client.request<unknown>({
      method: "DELETE",
      path: "/api/contacts/bulk",
      body,
    });
  }

  /** List contacts with search + cursor pagination. */
  async list(query?: ListContactsQuery): Promise<ContactListResponse> {
    return this.client.request<ContactListResponse>({
      method: "GET",
      path: "/api/contacts",
      query,
    });
  }

  /** Fetch a single contact by id. */
  async get(id: string): Promise<ContactRecord> {
    const envelope = await this.client.request<{ success: true; data: ContactRecord }>({
      method: "GET",
      path: `/api/contacts/${encodeURIComponent(id)}`,
    });
    return this.client.unwrap(envelope);
  }

  /** Patch a contact (partial update of `data`, `subscribed`, etc.). */
  async update(id: string, body: UpdateContactRequest): Promise<ContactRecord> {
    const envelope = await this.client.request<{ success: true; data: ContactRecord }>({
      method: "PATCH",
      path: `/api/contacts/${encodeURIComponent(id)}`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Delete a contact. The API answers 200 with `{ success, data: { id } }`; the SDK resolves void. */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/contacts/${encodeURIComponent(id)}`,
      noContent: true,
    });
  }

  /**
   * List contacts on the `/api/v1` surface.
   *
   * Cursor-paginated on `limit` + `after` with no total count, narrowed by
   * `search` (case-insensitive substring on the address) and `subscribed`.
   * Hold the filters steady for the whole walk — the cursor encodes them, and
   * changing one mid-pagination returns `422 validation_error` asking you to
   * restart. {@link listAllV1} drives the loop for you.
   */
  async listV1(query?: ListContactsV1Query): Promise<ContactListV1> {
    return this.client.request<ContactListV1>({
      method: "GET",
      path: "/api/v1/contacts",
      query,
    });
  }

  /** Iterate every v1 contact across pages, yielding one contact at a time. */
  async *listAllV1(query?: ListContactsV1Query): AsyncGenerator<ContactV1, void, undefined> {
    yield* paginateCursor<ContactV1>((after) => this.listV1({ ...query, after }), query?.after);
  }

  /**
   * Create a contact. Only `email` is required — `subscribed` defaults to true
   * server-side, and `custom_fields` is arbitrary JSON that templates can read
   * back as `{{ variables }}`.
   */
  async createV1(body: CreateContactV1Request): Promise<ContactV1> {
    return this.client.request<ContactV1>({
      method: "POST",
      path: "/api/v1/contacts",
      body,
    });
  }

  /**
   * Retrieve a single contact by id. v1 has no lookup-by-address route — reach
   * a contact you only know the email of through {@link listV1}'s `search`.
   */
  async getV1(id: string): Promise<ContactV1> {
    return this.client.request<ContactV1>({
      method: "GET",
      path: `/api/v1/contacts/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Patch a contact. Only the fields you send are changed, with two caveats.
   *
   * `email` is not patchable at all: an address is the contact's identity here,
   * and rewriting it in place would change who every earlier send was addressed
   * to. Create the new address instead.
   *
   * `custom_fields` is **replaced, not merged** — the object you send becomes
   * the whole of it, so read the contact and send back every key you mean to
   * keep. Sending a partial object silently drops the rest.
   */
  async updateV1(id: string, body: UpdateContactV1Request): Promise<ContactV1> {
    return this.client.request<ContactV1>({
      method: "PATCH",
      path: `/api/v1/contacts/${encodeURIComponent(id)}`,
      body,
    });
  }

  /**
   * Delete a contact. Unlike the legacy {@link delete}, this resolves the
   * `{ id, deleted }` acknowledgement rather than discarding it.
   */
  async deleteV1(id: string): Promise<ContactDeletedV1> {
    return this.client.request<ContactDeletedV1>({
      method: "DELETE",
      path: `/api/v1/contacts/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Read everything this contact has said about what they want.
   *
   * The top-level `subscribed` is the global marketing opt-out and outranks
   * every topic: false means nothing marketing reaches them whatever the topic
   * rows say. Each topic's own `subscribed` is the effective answer the send
   * path reaches today, with the topic's `default_opt_in` already folded in, so
   * a contact who has never answered still reads correctly.
   */
  async topicPreferences(id: string): Promise<ContactTopicPreferencesV1> {
    return this.client.request<ContactTopicPreferencesV1>({
      method: "GET",
      path: `/api/v1/contacts/${encodeURIComponent(id)}/topics`,
    });
  }

  /*
   * THE REST OF THE LEGACY `/api/contacts` SURFACE: custom-field management,
   * lookup, import/export, the bulk actions and erasure. All of it needs a full
   * key (it is refused to delegated OAuth callers).
   */

  /** List the custom fields in use across this project's contacts, with each field's type and coverage. */
  async listFields(): Promise<ContactFieldList> {
    const envelope = await this.client.request<{ success: true; data: ContactFieldList }>({
      method: "GET",
      path: "/api/contacts/fields",
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Remove a custom field and its values from every contact, as a background
   * job. Only custom fields can go: `field` must be the dotted path
   * (`customFields.plan`), and anything else is refused with `400`. Read
   * {@link getFieldUsage} first — segments and campaigns that use the field stop
   * matching.
   */
  async deleteField(field: string): Promise<QueuedAck> {
    const envelope = await this.client.request<{ success: true; data: QueuedAck }>({
      method: "DELETE",
      path: `/api/contacts/fields/${encodeURIComponent(field)}`,
    });
    return this.client.unwrap(envelope);
  }

  /** Which segments and campaigns use a custom field, how many contacts carry it, and whether it can be deleted. */
  async getFieldUsage(field: string): Promise<ContactFieldUsage> {
    const envelope = await this.client.request<{ success: true; data: ContactFieldUsage }>({
      method: "GET",
      path: `/api/contacts/fields/${encodeURIComponent(field)}/usage`,
    });
    return this.client.unwrap(envelope);
  }

  /** The distinct values stored in a custom field (`limit` up to 200, default 100). */
  async listFieldValues(field: string, query?: ListContactFieldValuesQuery): Promise<ContactFieldValues> {
    const envelope = await this.client.request<{ success: true; data: ContactFieldValues }>({
      method: "GET",
      path: `/api/contacts/fields/${encodeURIComponent(field)}/values`,
      query,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Get a ONE-TIME LINK a person opens to download this project's contacts as
   * CSV, optionally narrowed by `search` (part of an address) and `subscribed`.
   * With an API key the route does not stream the file: it answers a handoff
   * link (single-use, 15 minutes), so the SDK never downloads the CSV itself.
   * Needs `contacts:read`.
   */
  async exportLink(query?: ExportContactsQuery): Promise<DownloadLink> {
    return this.client.request<DownloadLink>({
      method: "GET",
      path: "/api/contacts/export",
      query,
    });
  }

  /**
   * Import contacts from a CSV, up to 5 MB, as a background job: the first row
   * is the header and must include an `email` column, and every other column
   * becomes a custom field. Pass a `File`/`Blob`, or the CSV text itself.
   * Resolves once the import is queued, not once it has finished. The file is
   * sent as multipart form data under `file`; the route also takes JSON
   * (`{ csv, filename? }`), but the contract publishes no request body for either.
   * `400 IMPORT_LIMIT_EXCEEDED` means the file has more rows than the project's
   * trust tier allows.
   */
  async importCsv(file: ContactImportFile, filename = "contacts.csv"): Promise<MessageAck> {
    const csv = typeof file === "string" ? new Blob([file], { type: "text/csv" }) : file;
    const form = new FormData();
    form.append("file", csv, filename);
    const envelope = await this.client.request<{ success: true; data: MessageAck }>({
      method: "POST",
      path: "/api/contacts/import",
      form,
    });
    return this.client.unwrap(envelope);
  }

  /** Find contacts by email address, up to 500 per call. Resolves which addresses were `found` and which were not. */
  async lookup(body: LookupContactsRequest): Promise<LookupContactsResponse> {
    const envelope = await this.client.request<{ success: true; data: LookupContactsResponse }>({
      method: "POST",
      path: "/api/contacts/lookup",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Delete up to 1000 contacts by id, as a background job. {@link bulkDelete}
   * is the older route that also takes addresses; this one takes ids only.
   */
  async queueBulkDelete(body: BulkContactActionRequest): Promise<MessageAck> {
    const envelope = await this.client.request<{ success: true; data: MessageAck }>({
      method: "POST",
      path: "/api/contacts/bulk-delete",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * PERMANENTLY ERASE up to 1000 contacts and their history, and block their
   * addresses from ever being mailed again (GDPR erasure), as a background job.
   * It cannot be undone.
   */
  async queueBulkPurge(body: BulkContactActionRequest): Promise<MessageAck> {
    const envelope = await this.client.request<{ success: true; data: MessageAck }>({
      method: "POST",
      path: "/api/contacts/bulk-purge",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Subscribe up to 1000 contacts at once, as a background job. */
  async queueBulkSubscribe(body: BulkContactActionRequest): Promise<MessageAck> {
    const envelope = await this.client.request<{ success: true; data: MessageAck }>({
      method: "POST",
      path: "/api/contacts/bulk-subscribe",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Unsubscribe up to 1000 contacts at once, as a background job. */
  async queueBulkUnsubscribe(body: BulkContactActionRequest): Promise<MessageAck> {
    const envelope = await this.client.request<{ success: true; data: MessageAck }>({
      method: "POST",
      path: "/api/contacts/bulk-unsubscribe",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * PERMANENTLY ERASE one contact and every event about them, and block the
   * address from ever being mailed again (GDPR erasure). It cannot be undone,
   * and unlike {@link delete} the address stays unmailable afterwards.
   */
  async purge(id: string): Promise<IdAck> {
    const envelope = await this.client.request<{ success: true; data: IdAck }>({
      method: "POST",
      path: `/api/contacts/${encodeURIComponent(id)}/purge`,
    });
    return this.client.unwrap(envelope);
  }
}
