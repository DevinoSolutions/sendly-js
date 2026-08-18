import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  EventListV1,
  EventNamesV1,
  EventStatsV1,
  EventStatsV1Query,
  EventV1,
  ListEventsV1Query,
  RecordEventV1Request,
  TrackEventData,
  TrackEventRequest,
} from "../types";

/**
 * Custom events — the only resource that spans both API dialects.
 *
 * {@link track} is the legacy `/api/track` endpoint (envelope response,
 * camelCase); everything else is the `/api/v1/events` surface (bare responses,
 * snake_case, RFC 9457 errors). See {@link record} for which one to reach for.
 */
export class EventsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Track a custom event for a contact via the legacy `/api/track` endpoint.
   * Both FULL (`sk_*`) and SENDING_ONLY (`pk_*`) keys are accepted, but
   * reserved system event names are rejected.
   *
   * Prefer {@link record} for new integrations — it is the same capability on
   * the versioned `/api/v1` surface.
   */
  async track(body: TrackEventRequest): Promise<TrackEventData> {
    const envelope = await this.client.request<{ success: true; data: TrackEventData }>({
      method: "POST",
      path: "/api/track",
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * Record a custom event on the `/api/v1` surface.
   *
   * Named `record` rather than `track` because {@link track} already holds that
   * name for the legacy endpoint. The two do the same job; this one resolves
   * the bare created event (snake_case) and reports failures as RFC 9457
   * problem documents.
   *
   * Takes no idempotency key: events are append-only high-volume writes, and
   * the only `Idempotency-Key` endpoints on v1 are `campaigns.create` and
   * `campaigns.send`.
   */
  async record(body: RecordEventV1Request): Promise<EventV1> {
    return this.client.request<EventV1>({
      method: "POST",
      path: "/api/v1/events",
      body,
    });
  }

  /**
   * List recorded events, newest first, optionally filtered by `event_name`.
   *
   * Cursor-paginated on `limit` + `after` with no total count. Keep the filter
   * fixed across the whole walk — changing it mid-pagination returns
   * `422 validation_error` asking you to restart from the first page.
   */
  async list(query?: ListEventsV1Query): Promise<EventListV1> {
    return this.client.request<EventListV1>({
      method: "GET",
      path: "/api/v1/events",
      query,
    });
  }

  /** Iterate every event across pages, yielding one event at a time. */
  async *listAll(query?: ListEventsV1Query): AsyncGenerator<EventV1, void, undefined> {
    yield* paginateCursor<EventV1>((after) => this.list({ ...query, after }), query?.after);
  }

  /**
   * Every distinct event name in the project, most frequent first — the
   * vocabulary to filter {@link list} by or point a workflow trigger at.
   * Unpaginated: the set is bounded by what the integration emits.
   */
  async listNames(): Promise<EventNamesV1> {
    return this.client.request<EventNamesV1>({
      method: "GET",
      path: "/api/v1/events/names",
    });
  }

  /** Per-name event counts over an optional `{ from, to }` window. */
  async stats(query?: EventStatsV1Query): Promise<EventStatsV1> {
    return this.client.request<EventStatsV1>({
      method: "GET",
      path: "/api/v1/events/stats",
      query,
    });
  }
}
