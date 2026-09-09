import type { Sendly } from "../client";
import type {
  CreateSnippetRequest,
  ListSnippetsQuery,
  SnippetListResponse,
  SnippetRecord,
  UpdateSnippetRequest,
} from "../types";

/**
 * Snippets — reusable body fragments a template pulls in with `{{> name}}`.
 *
 * Legacy dialect: `{ success, data }` envelopes and camelCase fields. Gated by
 * the same `templates:*` scopes as the templates that include them, because a
 * snippet is part of a template body rather than a resource with an audience of
 * its own.
 */
export class SnippetsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Create a snippet. `name` is the literal identifier templates include with
   * `{{> name}}` and is unique within the project, so a clash answers 409.
   */
  async create(body: CreateSnippetRequest): Promise<SnippetRecord> {
    const envelope = await this.client.request<{ success: true; data: SnippetRecord }>({
      method: "POST",
      path: "/api/snippets",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** List snippets with cursor pagination (`limit`/`cursor`) + optional `search` over name and description. */
  async list(query?: ListSnippetsQuery): Promise<SnippetListResponse> {
    return this.client.request<SnippetListResponse>({
      method: "GET",
      path: "/api/snippets",
      query,
    });
  }

  /** Fetch a single snippet by id. */
  async get(id: string): Promise<SnippetRecord> {
    const envelope = await this.client.request<{ success: true; data: SnippetRecord }>({
      method: "GET",
      path: `/api/snippets/${encodeURIComponent(id)}`,
    });
    return this.client.unwrap(envelope);
  }

  /** Patch an existing snippet. */
  async update(id: string, body: UpdateSnippetRequest): Promise<SnippetRecord> {
    const envelope = await this.client.request<{ success: true; data: SnippetRecord }>({
      method: "PATCH",
      path: `/api/snippets/${encodeURIComponent(id)}`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Delete a snippet. The API answers 200 with `{ success, data: { id } }`; the
   * SDK resolves void. Templates that still include it keep rendering — an
   * absent snippet renders as an empty string, like an absent variable.
   */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/snippets/${encodeURIComponent(id)}`,
      noContent: true,
    });
  }
}
