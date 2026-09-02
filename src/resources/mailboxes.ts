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
   * Not paginated — a project may hold at most 10 mailboxes. This lists the
   * mailboxes themselves, never their contents: received messages are not part
   * of the public API.
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
   * The app passwords issued for a mailbox — metadata only.
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
