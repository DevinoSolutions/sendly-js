import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  CreateListV1Request,
  EmailValidationRunV1,
  ListDeletedV1,
  ListListV1,
  ListListsV1Query,
  ListSubscribeData,
  ListSubscribeRequest,
  ListSubscribeResponse,
  ListUnsubscribeData,
  ListUnsubscribeRequest,
  ListUnsubscribeResponse,
  ListV1,
  UpdateListV1Request,
} from "../types";

/**
 * Subscriber lists, on both surfaces.
 *
 * {@link subscribe} and {@link unsubscribe} speak the legacy `/api/*` dialect
 * (camelCase inside a `{ success, data }` envelope the SDK unwraps) and accept
 * SENDING_ONLY keys. The `V1`-suffixed methods manage the lists themselves on
 * `/api/v1`: bare snake_case bodies and RFC 9457 problem documents. Both
 * dialects describe the same lists, so the suffix is there to keep a call site
 * from confusing one for the other.
 */
export class ListsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Subscribe a contact to a list, creating the contact if it does not exist.
   * Accepts SENDING_ONLY (`pk_*`) keys, so it can back a public subscribe form.
   *
   * **Double opt-in.** When the list has `doubleOptIn` enabled the membership
   * is created as `PENDING` and the result carries a `confirmToken`. Sendly
   * does **not** send the confirmation email — your application must deliver
   * `/api/lists/confirm-subscription?token=<confirmToken>` to the contact
   * itself. The token is valid for 24 hours.
   *
   * **Re-subscribing after an opt-out.** If the email already holds an
   * `UNSUBSCRIBED` membership on this list, the call fails with
   * `409 RESUBSCRIBE_CONFIRMATION_REQUIRED` unless the body sets
   * `allowResubscribe: true`. Reversing an opt-out is a consent decision, so it
   * is never the default — set the flag only when the contact themselves asked
   * to be re-subscribed.
   *
   * Prefer `previousStatus` over `created` when describing the transition to a
   * user; it reports the status held before the call, or `null` if there was no
   * membership.
   */
  async subscribe(id: string, body: ListSubscribeRequest): Promise<ListSubscribeData> {
    const envelope = await this.client.request<ListSubscribeResponse>({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/subscribe`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Unsubscribe a contact from a list. Resolves the address that was removed. */
  async unsubscribe(id: string, body: ListUnsubscribeRequest): Promise<ListUnsubscribeData> {
    const envelope = await this.client.request<ListUnsubscribeResponse>({
      method: "POST",
      path: `/api/lists/${encodeURIComponent(id)}/unsubscribe`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * List the project's subscriber lists on the `/api/v1` surface.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Hold the
   * arguments steady for the whole walk — changing them mid-pagination returns
   * `422 validation_error` asking you to restart. {@link listAllV1} drives the
   * loop for you.
   */
  async listV1(query?: ListListsV1Query): Promise<ListListV1> {
    return this.client.request<ListListV1>({
      method: "GET",
      path: "/api/v1/lists",
      query,
    });
  }

  /** Iterate every list across pages, yielding one list at a time. */
  async *listAllV1(query?: ListListsV1Query): AsyncGenerator<ListV1, void, undefined> {
    yield* paginateCursor<ListV1>((after) => this.listV1({ ...query, after }), query?.after);
  }

  /**
   * Create a list. Only `name` is required; `double_opt_in` defaults to false.
   *
   * Turning double opt-in on does not make Sendly send anything — it only
   * changes {@link subscribe} to create the membership as `PENDING` and hand
   * back the `confirmToken` your application delivers.
   */
  async createV1(body: CreateListV1Request): Promise<ListV1> {
    return this.client.request<ListV1>({
      method: "POST",
      path: "/api/v1/lists",
      body,
    });
  }

  /**
   * Retrieve a single list. `member_count` counts memberships in *any* status,
   * `PENDING` and `UNSUBSCRIBED` included, so it is not the size of the
   * audience a campaign would reach.
   */
  async getV1(id: string): Promise<ListV1> {
    return this.client.request<ListV1>({
      method: "GET",
      path: `/api/v1/lists/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Patch a list's name, description, opt-in mode, confirmation template, or
   * redirect URL. Only the fields you send are changed; `member_count` is
   * derived and never accepted here.
   */
  async updateV1(id: string, body: UpdateListV1Request): Promise<ListV1> {
    return this.client.request<ListV1>({
      method: "PATCH",
      path: `/api/v1/lists/${encodeURIComponent(id)}`,
      body,
    });
  }

  /** Delete a list. Resolves `{ id, deleted }`. Removes the list, not its contacts. */
  async deleteV1(id: string): Promise<ListDeletedV1> {
    return this.client.request<ListDeletedV1>({
      method: "DELETE",
      path: `/api/v1/lists/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Start a bulk address-validation run over the list's members.
   *
   * **Billed per address checked**, so starting a run over a large list costs
   * real money every time — it is not a free refresh. Answers `202` with the
   * run in `pending`; read its progress and counts back with
   * `validation.getRun`.
   */
  async startValidationRun(id: string): Promise<EmailValidationRunV1> {
    return this.client.request<EmailValidationRunV1>({
      method: "POST",
      path: `/api/v1/lists/${encodeURIComponent(id)}/validation-runs`,
    });
  }
}
