import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  DeliverabilityDiagnosisV1,
  DiagnoseDeliverabilityV1Query,
  DmarcReportListV1,
  DmarcReportV1,
  ListDmarcReportsV1Query,
  ListRecipientDomainStatsV1Query,
  RecipientDomainStatsListV1,
  RecipientDomainStatsV1,
} from "../types";

/**
 * Deliverability on the `/api/v1` surface — why mail from your domains is, or
 * is not, arriving.
 *
 * Responses are bare v1 bodies (no `{ success, data }` envelope) and errors are
 * RFC 9457 problem documents.
 */
export class DeliverabilityResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Diagnose one of your SENDING domains: its DNS identity, the project's
   * recent delivery outcomes, optionally one recipient's suppression state, and
   * the `findings` drawn from them, worst first. Branch on a finding's `code`,
   * never on its prose.
   *
   * `query.domain` is required — the endpoint answers about one domain. The
   * optional `address` is a RECIPIENT to check alongside it, because being
   * suppressed is the single most common reason one person stops receiving mail
   * while everyone else still does. `window_days` (1–30, default 7) only moves
   * the delivery counters.
   *
   * Nothing here is looked up live: the DNS statuses are the verification
   * refresh job's cached results, and `identity.last_checked_at` says when they
   * were filled. `recent_delivery` is project-wide rather than per-domain — its
   * own `scope` field says so — because an email row records no sending domain.
   */
  async diagnose(query: DiagnoseDeliverabilityV1Query): Promise<DeliverabilityDiagnosisV1> {
    return this.client.request<DeliverabilityDiagnosisV1>({
      method: "GET",
      path: "/api/v1/deliverability/diagnose",
      query,
    });
  }

  /**
   * Delivery outcomes broken out by RECIPIENT domain and UTC day, newest day
   * first.
   *
   * These are the domains you send TO — `gmail.com`, `outlook.com` — not the
   * domains you send FROM. That is the axis {@link diagnose} cannot report: its
   * project-wide rates hide the case that matters most, one recipient domain
   * refusing nearly everything while the rest of your mail is healthy.
   *
   * Cursor-paginated on `limit` + `after`. The counts come from an hourly
   * rollup job over a rolling 30-day window, not from a query run on request;
   * each row's `computed_at` says when it was last rebuilt. No rate is
   * published, because a rate over three sends is not information.
   */
  async listDomainStats(query?: ListRecipientDomainStatsV1Query): Promise<RecipientDomainStatsListV1> {
    return this.client.request<RecipientDomainStatsListV1>({
      method: "GET",
      path: "/api/v1/deliverability/domains",
      query,
    });
  }

  /** Iterate every recipient-domain row across pages, one day-and-domain at a time. */
  async *listDomainStatsAll(
    query?: ListRecipientDomainStatsV1Query,
  ): AsyncGenerator<RecipientDomainStatsV1, void, undefined> {
    yield* paginateCursor<RecipientDomainStatsV1>((after) => this.listDomainStats({ ...query, after }), query?.after);
  }

  /**
   * DMARC aggregate (RUA) reports that receiving providers have sent about your
   * domains, newest reporting window first. Cursor-paginated on `limit` +
   * `after`.
   *
   * An empty list is the correct answer, not a bug, until a policy domain is
   * registered in this project and its DMARC record names an address we
   * receive: only reports about a registered domain are stored, and receivers
   * send them on their own schedule (typically once a day).
   *
   * `pass_count` counts DMARC ALIGNMENT taken from `policy_evaluated`, not raw
   * authentication results — a message can pass SPF for a domain that is not
   * the one in its From header, which is exactly the case DMARC exists to
   * catch.
   */
  async listDmarcReports(query?: ListDmarcReportsV1Query): Promise<DmarcReportListV1> {
    return this.client.request<DmarcReportListV1>({
      method: "GET",
      path: "/api/v1/deliverability/dmarc",
      query,
    });
  }

  /** Iterate every DMARC report across pages, one report at a time. */
  async *listDmarcReportsAll(query?: ListDmarcReportsV1Query): AsyncGenerator<DmarcReportV1, void, undefined> {
    yield* paginateCursor<DmarcReportV1>((after) => this.listDmarcReports({ ...query, after }), query?.after);
  }
}
