import type { Sendly } from "../client";
import type { AddDomainRequest, DomainListResponse, DomainRecord, DomainVerificationStatus } from "../types";

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

  /** Delete a domain. */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/domains/${encodeURIComponent(id)}`,
    });
  }
}
