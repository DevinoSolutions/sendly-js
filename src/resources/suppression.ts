import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  AddSuppressionRequest,
  CreateSuppressionV1Request,
  ListSuppressionsQuery,
  ListSuppressionsV1Query,
  SuppressionCheckResponse,
  SuppressionDeletedV1,
  SuppressionListResponse,
  SuppressionListV1,
  SuppressionRecord,
  SuppressionV1,
} from "../types";

/**
 * The project suppression list — the addresses no send may reach — in both
 * dialects.
 *
 * The unsuffixed methods speak legacy `/api/suppression` (singular path,
 * `{ success, data }` envelopes); the `V1` methods speak `/api/v1/suppressions`
 * (plural path, bare bodies, RFC 9457 problem documents). Both answer the same
 * question, so the suffix is what stops a call site from reaching for one and
 * reading the other's shape.
 */
export class SuppressionResource {
  constructor(private readonly client: Sendly) {}

  /** Add an email to the project suppression list. */
  async add(body: AddSuppressionRequest): Promise<SuppressionRecord> {
    const envelope = await this.client.request<{ success: true; data: SuppressionRecord }>({
      method: "POST",
      path: "/api/suppression",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * List suppressions with optional reason filter + cursor pagination.
   *
   * Alone among the legacy reads, this route answers no `{ success, data }`
   * envelope: the page IS the body, `{ items, nextCursor }`, so nothing is
   * unwrapped. Each record carries `scope` — `PROJECT` for every record this
   * API creates or returns today.
   */
  async list(query?: ListSuppressionsQuery): Promise<SuppressionListResponse> {
    return this.client.request<SuppressionListResponse>({
      method: "GET",
      path: "/api/suppression",
      query,
    });
  }

  /** Check whether a given email is suppressed. */
  async get(email: string): Promise<SuppressionCheckResponse> {
    return this.client.request<SuppressionCheckResponse>({
      method: "GET",
      path: `/api/suppression/${encodeURIComponent(email)}`,
    });
  }

  /** Remove an email from the suppression list. Returns 204. */
  async remove(email: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/suppression/${encodeURIComponent(email)}`,
      noContent: true,
    });
  }

  /**
   * List suppressed addresses, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Hold `reason`
   * steady for the whole walk — changing it mid-pagination returns
   * `422 validation_error` asking you to restart. {@link listAllV1} drives the
   * loop for you.
   */
  async listV1(query?: ListSuppressionsV1Query): Promise<SuppressionListV1> {
    return this.client.request<SuppressionListV1>({
      method: "GET",
      path: "/api/v1/suppressions",
      query,
    });
  }

  /** Iterate every suppressed address across pages, yielding one record at a time. */
  async *listAllV1(query?: ListSuppressionsV1Query): AsyncGenerator<SuppressionV1, void, undefined> {
    yield* paginateCursor<SuppressionV1>((after) => this.listV1({ ...query, after }), query?.after);
  }

  /**
   * Suppress an address, so no further send reaches it.
   *
   * Idempotent: an already-suppressed address answers `201` with the existing
   * record, and the first `reason` wins — a later manual entry must not
   * overwrite what an SES bounce recorded. `source` is not accepted in the
   * body; it is derived from the credential, so a record's provenance cannot be
   * dressed up as a deliverability fact.
   */
  async createV1(body: CreateSuppressionV1Request): Promise<SuppressionV1> {
    return this.client.request<SuppressionV1>({
      method: "POST",
      path: "/api/v1/suppressions",
      body,
    });
  }

  /**
   * Retrieve the suppression record for one address.
   *
   * The answer is definite either way: `200` means suppressed and says why,
   * `404 resource_not_found` means the address is not on the list. A `200` may
   * also come from a platform-wide block recorded outside this project.
   */
  async getV1(email: string): Promise<SuppressionV1> {
    return this.client.request<SuppressionV1>({
      method: "GET",
      path: `/api/v1/suppressions/${encodeURIComponent(email)}`,
    });
  }

  /**
   * Un-suppress an address: mail can flow to it again. Resolves
   * `{ email, deleted }`.
   *
   * This is the one call on this surface that can put mail back into an inbox
   * that asked you to stop. It does NOT clear AWS SES's own account-level
   * suppression list, so an address SES suppressed after a hard bounce stays
   * undeliverable through SES even once this record is gone. Idempotent: an
   * address that was never suppressed answers `200` too.
   */
  async deleteV1(email: string): Promise<SuppressionDeletedV1> {
    return this.client.request<SuppressionDeletedV1>({
      method: "DELETE",
      path: `/api/v1/suppressions/${encodeURIComponent(email)}`,
    });
  }
}
