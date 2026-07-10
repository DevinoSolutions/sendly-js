import type { Sendly } from "../client";
import type { VerifyEmailData, VerifyEmailRequest } from "../types";

export class VerifyResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Validate an email address — checks syntax, MX records, disposable domains,
   * and plus-addressing. The endpoint is unauthenticated; the SDK still sends
   * its bearer header, which the server harmlessly ignores.
   */
  async email(body: VerifyEmailRequest): Promise<VerifyEmailData> {
    const envelope = await this.client.request<{ success: true; data: VerifyEmailData }>({
      method: "POST",
      path: "/api/verify",
      body,
    });
    return this.client.unwrap(envelope);
  }
}
