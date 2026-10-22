import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  AddDomainRequest,
  AssignDomainStreamRequest,
  CreateDomainV1Request,
  DomainDeletedV1,
  DomainListResponse,
  DomainListV1,
  DomainLogoReadinessV1,
  DomainLogoV1,
  DomainRecord,
  DomainSetupSession,
  DomainV1,
  DomainVerificationStatus,
  ListDomainsV1Query,
  UploadDomainLogoV1Request,
} from "../types";

/**
 * Sending domains, on both surfaces.
 *
 * The unsuffixed methods speak the legacy `/api/*` dialect — camelCase bodies
 * inside a `{ success, data }` envelope the SDK unwraps. The `V1`-suffixed
 * methods speak `/api/v1`: bare snake_case bodies, cursor pagination, and
 * RFC 9457 problem documents on error. Both answer the same questions, so the
 * suffix is there to keep a call site from confusing one for the other.
 */
export class DomainsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Register a new sending domain.
   *
   * Pass `region` to pin this domain to a specific AWS SES region (e.g.
   * `eu-west-1`). On the very first domain for a project this also locks the
   * project's region; subsequent calls must match.
   *
   * The response carries `dkimTokens` — the SES DKIM tokens to publish as
   * CNAME records before the domain can verify — alongside `dkimStatus`,
   * `spfStatus` and `dmarcStatus`, each the result of the last DNS check for
   * that record type.
   */
  async create(body: AddDomainRequest): Promise<DomainRecord> {
    const envelope = await this.client.request<{ success: true; data: DomainRecord }>({
      method: "POST",
      path: "/api/domains",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** List all domains for the project. */
  async list(): Promise<DomainListResponse> {
    return this.client.request<DomainListResponse>({
      method: "GET",
      path: "/api/domains",
    });
  }

  /** Fetch a single domain. */
  async get(id: string): Promise<DomainRecord> {
    const envelope = await this.client.request<{ success: true; data: DomainRecord }>({
      method: "GET",
      path: `/api/domains/${encodeURIComponent(id)}`,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Trigger SES verification for a domain.
   *
   * `status` is SES's own raw DKIM verification state (`Success`, `Pending`),
   * while `dkimStatus`, `spfStatus` and `dmarcStatus` are this platform's own
   * DNS check per record type. `tokens` carries the DKIM tokens SES has still
   * to report and is absent once verification has resolved.
   */
  async verify(id: string): Promise<DomainVerificationStatus> {
    const envelope = await this.client.request<{ success: true; data: DomainVerificationStatus }>({
      method: "POST",
      path: `/api/domains/${encodeURIComponent(id)}/verify`,
    });
    return this.client.unwrap(envelope);
  }

  /** Read current SES verification status for a domain. */
  async getVerification(id: string): Promise<DomainVerificationStatus> {
    const envelope = await this.client.request<{ success: true; data: DomainVerificationStatus }>({
      method: "GET",
      path: `/api/domains/${encodeURIComponent(id)}/verify`,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Start the guided DNS setup hand-off for a domain.
   *
   * Returns the session as the route returns it: a `connectUrl` to open in a
   * browser, the `token` that url carries, and `expiresAt`. Nothing here is
   * derived or reshaped — finishing setup means a person visiting that url and
   * authorising the DNS change at their registrar, so the SDK's job is to hand
   * back the link, not to model the flow behind it.
   */
  async startSetup(id: string): Promise<DomainSetupSession> {
    const envelope = await this.client.request<{ success: true; data: DomainSetupSession }>({
      method: "POST",
      path: `/api/domains/${encodeURIComponent(id)}/dodomain-session`,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Assign this sending identity to transactional or marketing traffic.
   *
   * Streams are enforced, not labelled: once assigned, a send of the other kind
   * from this identity is refused with 403 — which is what keeps a campaign's
   * complaint rate off the identity your password resets go out on. Pass
   * `stream: null` to unassign, returning it to carrying both.
   *
   * `streamDefault` demotes whichever identity currently holds the default for
   * that stream, and `defaultFromAddress` has to be an address on this
   * identity's own host. Every field is optional; an omitted one is left alone.
   *
   * Legacy dialect: camelCase body, and the updated domain arrives inside the
   * `{ success, data }` envelope this method unwraps for you.
   */
  async assignStream(id: string, body: AssignDomainStreamRequest): Promise<DomainRecord> {
    const envelope = await this.client.request<{ success: true; data: DomainRecord }>({
      method: "PATCH",
      path: `/api/domains/${encodeURIComponent(id)}`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Delete a domain. */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/domains/${encodeURIComponent(id)}`,
    });
  }

  /**
   * List sending domains, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. {@link listAllV1}
   * drives the loop for you.
   *
   * `verified` is SES's verdict on the identity and is what decides whether mail
   * can leave from this domain; `dkim_verified` is a separate fact — what the
   * DNS health refresh last read for the DKIM records — so the two disagree
   * while a re-check is in flight and neither is a spelling of the other.
   */
  async listV1(query?: ListDomainsV1Query): Promise<DomainListV1> {
    return this.client.request<DomainListV1>({
      method: "GET",
      path: "/api/v1/domains",
      query,
    });
  }

  /** Iterate every sending domain across pages, yielding one domain at a time. */
  async *listAllV1(query?: ListDomainsV1Query): AsyncGenerator<DomainV1, void, undefined> {
    yield* paginateCursor<DomainV1>((after) => this.listV1({ ...query, after }), query?.after);
  }

  /**
   * Register a sending domain and start SES DKIM verification.
   *
   * The identity comes back with `verified: false` — nothing is verified until
   * the DKIM records are published in the domain's own DNS and SES resolves
   * them, so poll {@link verifyV1} after publishing them.
   *
   * The first domain a project adds LOCKS the project's SES `region`; every
   * later domain must match it. `stream_default` requires `stream`, and sending
   * it alone is answered with `422 validation_error` rather than ignored.
   */
  async createV1(body: CreateDomainV1Request): Promise<DomainV1> {
    return this.client.request<DomainV1>({
      method: "POST",
      path: "/api/v1/domains",
      body,
    });
  }

  /** Retrieve a single sending domain. */
  async getV1(id: string): Promise<DomainV1> {
    return this.client.request<DomainV1>({
      method: "GET",
      path: `/api/v1/domains/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Re-read the domain's state from SES and DNS, and resolve the refreshed
   * document.
   *
   * This does not verify anything and changes none of the domain's own fields.
   * Verification happens in the domain's DNS, when its owner publishes the DKIM
   * records SES minted at creation, and Amazon decides when those resolve. What
   * this call does is ask SES what it currently sees, re-check SPF and DMARC,
   * and persist that answer — so a caller polling after a DNS change learns the
   * outcome without waiting for the periodic sweep. Calling it on a domain whose
   * records are not published yet is not an error and does not hurry anything.
   *
   * A POST rather than a GET because the refreshed state is persisted and a
   * verified/unverified transition notifies the project.
   */
  async verifyV1(id: string): Promise<DomainV1> {
    return this.client.request<DomainV1>({
      method: "POST",
      path: `/api/v1/domains/${encodeURIComponent(id)}/verify`,
    });
  }

  /**
   * Remove a sending domain. Resolves `{ id, deleted }`.
   *
   * Refused with `409 conflict` while a template, workflow step or active
   * campaign still sends from an address on this host. The SES identity goes
   * too unless another project holds the same host — and its DKIM keys with it,
   * so re-adding later mints records that must be published again.
   */
  async deleteV1(id: string): Promise<DomainDeletedV1> {
    return this.client.request<DomainDeletedV1>({
      method: "DELETE",
      path: `/api/v1/domains/${encodeURIComponent(id)}`,
    });
  }

  /**
   * The logo this identity serves to inboxes (BIMI), the `default._bimi` TXT
   * record that makes them fetch it (`bimi_record`), and a fresh DNS reading of
   * whether they will show it today. The URL never changes, so the record is
   * published once. Until a logo is uploaded it serves a default (the domain's
   * initial), and it serves nothing until the identity verifies.
   *
   * Providers decide whether to display a logo, so DNS readiness is not a
   * promise of display; Gmail also needs a VMC or CMC certificate, which Sendly
   * neither issues nor checks. {@link getLogoReadinessV1} is the full checklist.
   */
  async getLogoV1(id: string): Promise<DomainLogoV1> {
    return this.client.request<DomainLogoV1>({
      method: "GET",
      path: `/api/v1/domains/${encodeURIComponent(id)}/logo`,
    });
  }

  /**
   * Replace the logo with an SVG. It is rebuilt into SVG Tiny PS, the profile
   * BIMI requires: it must be square, draw with shapes rather than `<text>`,
   * reference nothing outside itself, and come to at most 32 KB once rebuilt.
   * A file that cannot be rebuilt answers `422 validation_error` with a
   * `detail` naming what to change, and the previous logo stays in place.
   */
  async uploadLogoV1(id: string, body: UploadDomainLogoV1Request): Promise<DomainLogoV1> {
    return this.client.request<DomainLogoV1>({
      method: "PUT",
      path: `/api/v1/domains/${encodeURIComponent(id)}/logo`,
      body,
    });
  }

  /**
   * Remove the uploaded logo, so the URL serves the default again. Resolves the
   * logo now served; removing one that was never uploaded is not an error. The
   * DNS record does not change.
   */
  async deleteLogoV1(id: string): Promise<DomainLogoV1> {
    return this.client.request<DomainLogoV1>({
      method: "DELETE",
      path: `/api/v1/domains/${encodeURIComponent(id)}/logo`,
    });
  }

  /**
   * How ready the identity is to show its logo as the inbox avatar: each step
   * (DMARC at enforcement on the host and its organizational domain, the BIMI
   * record, the logo file, the mark certificate) as `met`, `missing`, `unknown`
   * or `not_applicable` with a plain-English `reason`, and one checklist per
   * inbox (Gmail, Yahoo, Apple Mail, Fastmail). For the certificate only "the
   * URL answers with a PEM file" is checked; its chain is not validated.
   */
  async getLogoReadinessV1(id: string): Promise<DomainLogoReadinessV1> {
    return this.client.request<DomainLogoReadinessV1>({
      method: "GET",
      path: `/api/v1/domains/${encodeURIComponent(id)}/logo/readiness`,
    });
  }
}
