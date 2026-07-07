import type { Sendly } from "../client";
import type {
  AddSuppressionRequest,
  ListSuppressionsQuery,
  SuppressionCheckResponse,
  SuppressionListResponse,
  SuppressionRecord,
} from "../types";

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

  /** List suppressions with optional reason filter + cursor pagination. */
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
}
