import type { Sendly } from "../client";
import type { TrackEventData, TrackEventRequest } from "../types";

export class EventsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Track a custom event for a contact. Both FULL (`sk_*`) and SENDING_ONLY
   * (`pk_*`) keys are accepted, but reserved system event names are rejected.
   */
  async track(body: TrackEventRequest): Promise<TrackEventData> {
    const envelope = await this.client.request<{ success: true; data: TrackEventData }>({
      method: "POST",
      path: "/api/track",
      body,
    });
    return this.client.unwrap(envelope);
  }
}
