import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  CreateTemplateRequest,
  CreateTemplateV1Request,
  ListTemplatesQuery,
  ListTemplatesV1Query,
  TemplateDeletedV1,
  TemplateListResponse,
  TemplateListV1,
  TemplateRecord,
  TemplateV1,
  UpdateTemplateRequest,
  UpdateTemplateV1Request,
} from "../types";

/**
 * Reusable email templates, in both dialects.
 *
 * The unsuffixed methods speak legacy `/api/templates` — `{ success, data }`
 * envelopes and camelCase fields. The `V1` methods speak `/api/v1/templates` —
 * bare bodies, snake_case fields and RFC 9457 problem documents. Both answer
 * the same question, so the suffix is what stops a call site from reaching for
 * one and reading the other's shape.
 */
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

  /** List templates with cursor pagination (`limit`/`cursor`) + optional `emailCategory` filter. */
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

  /**
   * Patch an existing template.
   *
   * An update that changes the rendered content increments `currentVersion`;
   * one that only renames leaves it alone. A campaign records the version it
   * sent, so comparing the two is how a caller tells "the template changed
   * since" from "the template was renamed".
   */
  async update(id: string, body: UpdateTemplateRequest): Promise<TemplateRecord> {
    const envelope = await this.client.request<{ success: true; data: TemplateRecord }>({
      method: "PATCH",
      path: `/api/templates/${encodeURIComponent(id)}`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /** Delete a template. The API answers 200 with `{ success, data: { id } }` (409 if still referenced); the SDK resolves void. */
  async delete(id: string): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/api/templates/${encodeURIComponent(id)}`,
      noContent: true,
    });
  }

  /**
   * List templates, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. `search` here
   * matches the name only — narrower than the dashboard's search, which also
   * reads description and subject. Hold `search` and `email_category` steady
   * for the whole walk; changing either mid-pagination returns
   * `422 validation_error` asking you to restart. {@link listAllV1} drives the
   * loop for you.
   */
  async listV1(query?: ListTemplatesV1Query): Promise<TemplateListV1> {
    return this.client.request<TemplateListV1>({
      method: "GET",
      path: "/api/v1/templates",
      query,
    });
  }

  /** Iterate every template across pages, yielding one template at a time. */
  async *listAllV1(query?: ListTemplatesV1Query): AsyncGenerator<TemplateV1, void, undefined> {
    yield* paginateCursor<TemplateV1>((after) => this.listV1({ ...query, after }), query?.after);
  }

  /**
   * Create a template. `email_category` defaults to `MARKETING` server-side.
   *
   * The `from` domain must already be a verified sending identity — an
   * unverified sender is refused with `403 forbidden` here rather than becoming
   * a campaign that fails at send time.
   */
  async createV1(body: CreateTemplateV1Request): Promise<TemplateV1> {
    return this.client.request<TemplateV1>({
      method: "POST",
      path: "/api/v1/templates",
      body,
    });
  }

  /** Retrieve a single template. */
  async getV1(id: string): Promise<TemplateV1> {
    return this.client.request<TemplateV1>({
      method: "GET",
      path: `/api/v1/templates/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Patch a template. Only the fields you send are changed.
   *
   * Touching `subject`, `body`, `from`, `from_name` or `reply_to` snapshots the
   * previous content into version history and increments `version`; touching
   * only `name`, `description` or `email_category` does not, because neither is
   * content a send would have rendered.
   */
  async updateV1(id: string, body: UpdateTemplateV1Request): Promise<TemplateV1> {
    return this.client.request<TemplateV1>({
      method: "PATCH",
      path: `/api/v1/templates/${encodeURIComponent(id)}`,
      body,
    });
  }

  /**
   * Delete a template. Resolves `{ id, deleted }` — the legacy `delete` above
   * discards that body, this one hands it back.
   *
   * A template a workflow step or an active campaign (DRAFT, SCHEDULED or
   * SENDING) still points at is refused with `409 conflict`. Emails already
   * sent from it are not erased.
   */
  async deleteV1(id: string): Promise<TemplateDeletedV1> {
    return this.client.request<TemplateDeletedV1>({
      method: "DELETE",
      path: `/api/v1/templates/${encodeURIComponent(id)}`,
    });
  }
}
