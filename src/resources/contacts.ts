import type { Sendly } from "../client";
import type { IdempotencyOptions } from "./emails";
import type {
  BulkCreateContactsRequest,
  BulkDeleteContactsRequest,
  ContactListResponse,
  ContactRecord,
  CreateContactRequest,
  ListContactsQuery,
  UpdateContactRequest,
} from "../types";

function idemHeader(opts?: IdempotencyOptions): Record<string, string> | undefined {
  if (!opts?.idempotencyKey) return undefined;
  return { "Idempotency-Key": opts.idempotencyKey };
}

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

  /** Delete a contact. Returns 204. */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/contacts/${encodeURIComponent(id)}`,
      noContent: true,
    });
  }
}
