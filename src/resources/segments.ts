import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  CreateSegmentV1Request,
  ListSegmentContactsV1Query,
  ListSegmentsV1Query,
  SegmentContactListV1,
  SegmentContactV1,
  SegmentDeletedV1,
  SegmentListV1,
  SegmentV1,
  UpdateSegmentV1Request,
} from "../types";

/**
 * Segments on the `/api/v1` surface — saved audience definitions, and the
 * contacts that currently match them.
 *
 * Responses are bare v1 bodies (no `{ success, data }` envelope) and errors are
 * RFC 9457 problem documents.
 */
export class SegmentsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * List segments, newest first.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Hold the filter
   * and sort arguments steady for the whole walk — changing them mid-pagination
   * returns `422 validation_error` asking you to restart. {@link listAll}
   * drives the loop for you.
   */
  async list(query?: ListSegmentsV1Query): Promise<SegmentListV1> {
    return this.client.request<SegmentListV1>({
      method: "GET",
      path: "/api/v1/segments",
      query,
    });
  }

  /** Iterate every segment across pages, yielding one segment at a time. */
  async *listAll(query?: ListSegmentsV1Query): AsyncGenerator<SegmentV1, void, undefined> {
    yield* paginateCursor<SegmentV1>((after) => this.list({ ...query, after }), query?.after);
  }

  /** Create a segment. */
  async create(body: CreateSegmentV1Request): Promise<SegmentV1> {
    return this.client.request<SegmentV1>({
      method: "POST",
      path: "/api/v1/segments",
      body,
    });
  }

  /** Retrieve a single segment. */
  async get(id: string): Promise<SegmentV1> {
    return this.client.request<SegmentV1>({
      method: "GET",
      path: `/api/v1/segments/${encodeURIComponent(id)}`,
    });
  }

  /** Patch a segment. Only the fields you send are changed. */
  async update(id: string, body: UpdateSegmentV1Request): Promise<SegmentV1> {
    return this.client.request<SegmentV1>({
      method: "PATCH",
      path: `/api/v1/segments/${encodeURIComponent(id)}`,
      body,
    });
  }

  /**
   * Delete a segment. Resolves `{ id, deleted }`. A segment still referenced by
   * a campaign is refused with `409 conflict`.
   */
  async delete(id: string): Promise<SegmentDeletedV1> {
    return this.client.request<SegmentDeletedV1>({
      method: "DELETE",
      path: `/api/v1/segments/${encodeURIComponent(id)}`,
    });
  }

  /** List the contacts currently matching a segment. Cursor-paginated. */
  async listContacts(id: string, query?: ListSegmentContactsV1Query): Promise<SegmentContactListV1> {
    return this.client.request<SegmentContactListV1>({
      method: "GET",
      path: `/api/v1/segments/${encodeURIComponent(id)}/contacts`,
      query,
    });
  }

  /** Iterate every contact in a segment across pages, one contact at a time. */
  async *listContactsAll(
    id: string,
    query?: ListSegmentContactsV1Query,
  ): AsyncGenerator<SegmentContactV1, void, undefined> {
    yield* paginateCursor<SegmentContactV1>((after) => this.listContacts(id, { ...query, after }), query?.after);
  }
}
