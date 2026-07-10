import type { Sendly } from "../client";
import type { TrackEventRequest, TrackEventResponse } from "../types";

export class EventsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Track a custom event for a contact. Both FULL (`sk_*`) and SENDING_ONLY
   * (`pk_*`) keys are accepted, but reserved system event names are rejected.
   */
  async track(body: TrackEventRequest): Promise<TrackEventResponse> {
    return this.client.request<TrackEventResponse>({
      method: "POST",
      path: "/api/track",
      body,
    });
  }
}
