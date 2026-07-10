import type { Sendly } from "../client";
import type { VerifyEmailRequest, VerifyEmailResponse } from "../types";

export class VerifyResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Validate an email address — checks syntax, MX records, disposable domains,
   * and plus-addressing. The endpoint is unauthenticated; the SDK still sends
   * its bearer header, which the server harmlessly ignores.
   */
  async email(body: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    return this.client.request<VerifyEmailResponse>({
      method: "POST",
      path: "/api/verify",
      body,
    });
  }
}
