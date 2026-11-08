import type { Sendly } from "../client";
import { paginateLegacyCursor } from "../pagination";
import type { ApiObject, LegacyCursorPage, ListAuditLogQuery } from "../types";

/**
 * Who changed what in the project, newest first. Legacy `/api/audit-log`
 * route; needs `projects:read`.
 */
export class AuditLogResource {
  constructor(private readonly client: Sendly) {}

  /**
   * One page of the log. Pages on `limit` + `cursor` and answers
   * `{ data, total, cursor, hasMore }`. `action` is a prefix such as `contact.`.
   */
  async list(query?: ListAuditLogQuery): Promise<LegacyCursorPage<ApiObject>> {
    const envelope = await this.client.request<{ success: true; data: LegacyCursorPage<ApiObject> }>({
      method: "GET",
      path: "/api/audit-log",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Iterate the whole log across pages, one entry at a time. */
  async *listAll(query?: ListAuditLogQuery): AsyncGenerator<ApiObject, void, undefined> {
    yield* paginateLegacyCursor<ApiObject>((cursor) => this.list({ ...query, cursor }), query?.cursor);
  }
}
