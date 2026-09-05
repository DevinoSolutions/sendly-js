import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  EmailValidationBatchV1,
  EmailValidationResultListV1,
  EmailValidationResultV1,
  EmailValidationRunV1,
  ListValidationResultsV1Query,
  ValidateEmailsV1Request,
} from "../types";

/**
 * Email validation on the `/api/v1` surface — check addresses before you mail
 * them, and read back what a bulk run found.
 *
 * Responses are bare v1 bodies (no `{ success, data }` envelope) and errors are
 * RFC 9457 problem documents.
 */
export class ValidationResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Check a batch of addresses. **This is billed per address checked** — every
   * entry in `emails` costs money, so looping this over a contact list is
   * looping over your invoice. Validate a whole list with the background run
   * (`lists.startValidationRun`) instead of paging it through here.
   *
   * At most 50 addresses per call. That ceiling is a latency bound, not a
   * payload one: every distinct domain in the batch costs a DNS round trip.
   *
   * Branch on each result's `verdict`, never on the flags — `is_personal`
   * (Gmail, Outlook) and `is_role_address` (`support@`) describe ordinary,
   * deliverable addresses that real customers use. A verdict of `unknown` means
   * DNS did not answer in time, so that address was NOT checked; it is a
   * separate value from `undeliverable` on purpose, and deleting a contact on
   * `unknown` deletes a live one over a network hiccup.
   */
  async validateEmails(body: ValidateEmailsV1Request): Promise<EmailValidationBatchV1> {
    return this.client.request<EmailValidationBatchV1>({
      method: "POST",
      path: "/api/v1/email-validations",
      body,
    });
  }

  /**
   * Retrieve a bulk validation run: how far it has got, and what it found.
   *
   * The other way a run starts is `lists.startValidationRun`, which validates
   * every address on a list in the background and answers with the run this
   * method polls. A run is finished when `status` is `completed` or `failed` —
   * never when a percentage reaches 100, because there is deliberately no total
   * to divide by: a list changes size while a run walks it.
   */
  async getRun(id: string): Promise<EmailValidationRunV1> {
    return this.client.request<EmailValidationRunV1>({
      method: "GET",
      path: `/api/v1/validation-runs/${encodeURIComponent(id)}`,
    });
  }

  /**
   * List one page of a run's verdicts. Filter with `verdict` — `undeliverable`
   * is the page to read before acting on a run, and `unknown` is the one never
   * to act on, since those addresses were not actually checked.
   *
   * Pages on `after` and answers `next_cursor`, like every other v1
   * collection. {@link listResultsAll} drives that loop for you.
   */
  async listResults(id: string, query?: ListValidationResultsV1Query): Promise<EmailValidationResultListV1> {
    return this.client.request<EmailValidationResultListV1>({
      method: "GET",
      path: `/api/v1/validation-runs/${encodeURIComponent(id)}/results`,
      query,
    });
  }

  /**
   * Iterate every result across pages, yielding one address's verdict at a time.
   *
   * This was hand-rolled through 1.0, because the endpoint spoke `cursor` on
   * both sides while the shared helper sends `after` and reads `next_cursor` —
   * so routing it through the helper would have sent an ignored parameter and
   * re-fetched page one forever. The route speaks the one dialect now.
   */
  async *listResultsAll(
    id: string,
    query?: ListValidationResultsV1Query,
  ): AsyncGenerator<EmailValidationResultV1, void, undefined> {
    yield* paginateCursor<EmailValidationResultV1>((after) => this.listResults(id, { ...query, after }), query?.after);
  }
}
