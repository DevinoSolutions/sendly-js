import type { Sendly } from "../client";
import type { AppPasswordRecord, MailboxDetail, MailboxRecord } from "../types";

/**
 * Receiving mailboxes on the project's verified domains.
 *
 * READ ONLY, and deliberately so. Creating and deleting a mailbox, and minting
 * or revoking an app password, all resolve the acting project admin from the
 * session user; an API key carries no user, so those routes answer `401` to any
 * `sk_` key however broad its scopes. The contract records that — they publish
 * `SessionAuth` without `ApiKeyAuth` — and this SDK authenticates only with API
 * keys, so a `create`/`delete` here could never succeed. They are listed in the
 * contract suite's `NOT_SDK_CALLABLE` rather than shipped as methods that
 * always throw.
 *
 * The three reads below are a different case: their membership check is
 * conditional, so a key really can call them.
 */
export class MailboxesResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Every mailbox on the project's domains, newest first.
   *
   * Not paginated. A project is capped at 10 mailboxes, but the cap counts only
   * those holding (or mid-way to holding) a real account — `PROVISIONING`,
   * `ACTIVE` and `SUSPENDED`. `FAILED` rows are excluded from it deliberately,
   * so that a Stalwart outage cannot spend a project's whole allowance, and
   * they are still returned here: a project with a run of failed provisions can
   * therefore list more than 10.
   *
   * This lists the mailboxes themselves, never their contents: received
   * messages are not part of the public API.
   */
  async list(): Promise<MailboxRecord[]> {
    const envelope = await this.client.request<{ success: true; data: MailboxRecord[] }>({
      method: "GET",
      path: "/api/mailboxes",
    });
    return this.client.unwrap(envelope);
  }

  /**
   * One mailbox, with the IMAP and SMTP host/port/username a mail client needs.
   *
   * The password is not included and is never returned here — mailbox
   * credentials are app passwords, created from the dashboard and shown once.
   */
  async get(id: string): Promise<MailboxDetail> {
    const envelope = await this.client.request<{ success: true; data: MailboxDetail }>({
      method: "GET",
      path: `/api/mailboxes/${encodeURIComponent(id)}`,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * The app passwords still active on a mailbox — metadata only.
   *
   * Revoked ones are not returned: the route filters on `revokedAt: null`, so
   * this is the set that can currently authenticate, not an audit history.
   *
   * `lastFour` is the only fragment of the secret that survives creation, so
   * this can identify a credential without being able to reconstruct it.
   */
  async listAppPasswords(id: string): Promise<AppPasswordRecord[]> {
    const envelope = await this.client.request<{ success: true; data: AppPasswordRecord[] }>({
      method: "GET",
      path: `/api/mailboxes/${encodeURIComponent(id)}/app-passwords`,
    });
    return this.client.unwrap(envelope);
  }
}
