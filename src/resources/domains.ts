import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  AddDomainRequest,
  AssignDomainStreamRequest,
  CreateDomainV1Request,
  DomainDeletedV1,
  DomainListResponse,
  DomainListV1,
  DomainRecord,
  DomainSetupSession,
  DomainV1,
  DomainVerificationStatus,
  ListDomainsV1Query,
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
   * The response includes DNS records to set.
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

  /** Trigger SES verification for a domain. */
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
}
