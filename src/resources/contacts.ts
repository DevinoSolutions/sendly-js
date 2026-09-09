import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import { idemHeader } from "./idempotency";
import type { IdempotencyOptions } from "./idempotency";
import type {
  BulkCreateContactsRequest,
  BulkDeleteContactsRequest,
  ContactDeletedV1,
  ContactListResponse,
  ContactListV1,
  ContactRecord,
  ContactTopicPreferencesV1,
  ContactV1,
  CreateContactRequest,
  CreateContactV1Request,
  ListContactsQuery,
  ListContactsV1Query,
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
}
