/**
 * Cursor pagination for the `/api/v1` surface.
 *
 * Every v1 list endpoint answers with the same envelope and takes the same two
 * query parameters, so the page-walking loop is written once here and each
 * resource's `<method>All` generator just supplies the fetch.
 */

/** The list envelope every `/api/v1` collection endpoint returns. */
export interface CursorPage<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** The two query parameters every `/api/v1` collection endpoint accepts. */
export interface CursorPageQuery {
  /** Page size, 1–100. Defaults to 20 server-side. */
  limit?: number;
  /** Opaque cursor from a previous response's `next_cursor`. */
  after?: string;
}

/**
 * Walk a cursor-paginated v1 collection, yielding items rather than pages.
 *
 * Terminates when the server reports `has_more: false` or hands back a null
 * cursor. It also stops if the server ever repeats the cursor it was just
 * given, so a misbehaving page can't spin the loop forever.
 *
 * The filter and sort arguments must stay fixed for the whole walk — the
 * cursor encodes them, and changing them mid-pagination is answered with
 * `422 validation_error` telling the caller to restart from the first page.
 */
export async function* paginateCursor<T>(
  fetchPage: (after: string | undefined) => Promise<CursorPage<T>>,
  startAfter?: string,
): AsyncGenerator<T, void, undefined> {
  let after = startAfter;
  for (;;) {
    const page = await fetchPage(after);
    for (const item of page.data ?? []) {
      yield item;
    }
    const next = page.next_cursor;
    if (!page.has_more || next === null || next === undefined || next === after) return;
    after = next;
  }
}
