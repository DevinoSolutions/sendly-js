import type { Sendly } from "../client";
import type { CreateSupportTicketV1Request, SupportTicketCreatedV1, SupportTicketListV1 } from "../types";

/**
 * Sendly support tickets on the versioned `/api/v1` surface.
 *
 * Responses are bare v1 bodies and errors are RFC 9457 problem documents.
 */
export class SupportResource {
  constructor(private readonly client: Sendly) {}

  /** The project's tickets, newest first, up to 50. Needs `support:read`. */
  async listTickets(): Promise<SupportTicketListV1> {
    return this.client.request<SupportTicketListV1>({
      method: "GET",
      path: "/api/v1/support/tickets",
    });
  }

  /**
   * Write to Sendly support. The message goes to the support inbox, and an API
   * key has no account email to reply to, so send `wantsReply: false`.
   * `attachments` are https links the support team opens; nothing fetches them.
   * Limited to ten tickets per caller per hour. Needs `support:write`.
   */
  async createTicket(body: CreateSupportTicketV1Request): Promise<SupportTicketCreatedV1> {
    return this.client.request<SupportTicketCreatedV1>({
      method: "POST",
      path: "/api/v1/support/tickets",
      body,
    });
  }
}
