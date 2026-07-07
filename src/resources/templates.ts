import type { Sendly } from "../client";
import type {
  CreateTemplateRequest,
  ListTemplatesQuery,
  TemplateListResponse,
  TemplateRecord,
  UpdateTemplateRequest,
} from "../types";

export class TemplatesResource {
  constructor(private readonly client: Sendly) {}

  /** Create a reusable email template. */
  async create(body: CreateTemplateRequest): Promise<TemplateRecord> {
    const envelope = await this.client.request<{ success: true; data: TemplateRecord }>({
      method: "POST",
      path: "/api/templates",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** List templates with offset pagination + optional type filter. */
  async list(query?: ListTemplatesQuery): Promise<TemplateListResponse> {
    return this.client.request<TemplateListResponse>({
      method: "GET",
      path: "/api/templates",
      query,
    });
  }

  /** Fetch a single template by id. */
  async get(id: string): Promise<TemplateRecord> {
    const envelope = await this.client.request<{ success: true; data: TemplateRecord }>({
      method: "GET",
      path: `/api/templates/${encodeURIComponent(id)}`,
    });
    return this.client.unwrap(envelope);
  }

  /** Patch an existing template. */
  async update(id: string, body: UpdateTemplateRequest): Promise<TemplateRecord> {
    const envelope = await this.client.request<{ success: true; data: TemplateRecord }>({
      method: "PATCH",
      path: `/api/templates/${encodeURIComponent(id)}`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Delete a template. Returns 204 unless still referenced. */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/templates/${encodeURIComponent(id)}`,
      noContent: true,
    });
  }
}
