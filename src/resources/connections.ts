import type { Sendly } from "../client";
import type { ConnectionsV1, ConnectLinksV1, CreateConnectLinksV1Request } from "../types";

/**
 * Connected services on the versioned `/api/v1` surface: the project's Slack
 * connection and the domains whose DNS DoDomain manages.
 *
 * Responses are bare v1 bodies and errors are RFC 9457 problem documents.
 */
export class ConnectionsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * List the project's connected services. `connectedApps` is null for an API
   * key, which carries no person to connect AI apps to.
   */
  async list(): Promise<ConnectionsV1> {
    return this.client.request<ConnectionsV1>({
      method: "GET",
      path: "/api/v1/connections",
    });
  }

  /**
   * Get one-time links that start a connection (`links` is an array). `slack` (the default) opens
   * Slack's consent screen bound to this project, and opening it needs a project
   * admin. `dodomain` starts guided DNS setup for `domainId` and mints a metered
   * session, so a second call for the same domain inside 60 seconds answers
   * `429 DODOMAIN_SESSION_COOLDOWN`. Each link works once, for 15 minutes, for
   * the account it was made for.
   */
  async createLinks(body?: CreateConnectLinksV1Request): Promise<ConnectLinksV1> {
    return this.client.request<ConnectLinksV1>({
      method: "POST",
      path: "/api/v1/connections/links",
      // The route validates a body even when every field is optional, so an empty call sends `{}`.
      body: body ?? {},
    });
  }
}
