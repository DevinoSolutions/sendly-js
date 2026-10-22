import type { Sendly, SendlyFile } from "../client";
import type {
  AppPasswordRecord,
  ComposeMailboxMessageRequest,
  DraftMailboxMessageRequest,
  ListMailboxConversationsQuery,
  MailboxConversation,
  MailboxConversationPage,
  MailboxConversationReplyRequest,
  MailboxDetail,
  MailboxMessage,
  MailboxRecord,
  paths,
} from "../types";

/** What {@link MailboxesResource.replyToConversation} resolves: the reply was handed to the mail server. */
export type MailboxConversationReply =
  paths["/api/mailboxes/{id}/conversations/{conversationId}/reply"]["post"]["responses"][200]["content"]["application/json"]["data"];

/** What {@link MailboxesResource.sendMessage} resolves once the message is submitted. */
export type MailboxMessageSubmitted =
  paths["/api/mailboxes/{id}/messages"]["post"]["responses"][201]["content"]["application/json"]["data"];

/** What {@link MailboxesResource.draftMessage} resolves — suggested text, and `sent: false`. */
export type MailboxMessageDraft =
  paths["/api/mailboxes/{id}/drafts"]["post"]["responses"][200]["content"]["application/json"]["data"];

/**
 * Receiving mailboxes on the project's verified domains, plus the two
 * composition operations an API key may drive.
 *
 * MAILBOX LIFECYCLE is what stays out of reach: creating and deleting a
 * mailbox, and minting or revoking an app password, all resolve the acting
 * project admin from the session user; an API key carries no user, so those
 * routes answer `401` to any `sk_` key however broad its scopes. The contract
 * records that — they publish `SessionAuth` without `ApiKeyAuth` — and this SDK
 * authenticates only with API keys, so a `create`/`delete` here could never
 * succeed. They are listed in the contract suite's `NOT_SDK_CALLABLE` rather
 * than shipped as methods that always throw.
 *
 * Everything below is a different case — the reads' membership check is
 * conditional, and {@link sendMessage} / {@link draftMessage} publish
 * `ApiKeyAuth` outright — so a key really can call them.
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
   * This lists the mailboxes themselves, never their contents: the mail is
   * {@link listConversations}, under a scope of its own.
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

  /**
   * SENDS a new message — real mail leaves the account, from the mailbox in the
   * path, over its own domain, and the recipient can reply to it.
   *
   * There is no `from` field, on purpose: a route that sends under a customer's
   * own identity must not take that identity as an argument. `body` is plain
   * text and HTML is refused — Sendly renders the HTML part itself, escaping as
   * it goes, so text becomes markup in exactly one place.
   *
   * Bcc recipients are delivered to but appear in no header, so the copy filed
   * in the mailbox's Sent folder does not record them. The message is stored as
   * a new conversation, and the reply threads onto it.
   *
   * Refusals worth handling by name: `422 RECIPIENT_SUPPRESSED` (a recipient is
   * on the project's suppression list), `422 CONTENT_REFUSED` (the outbound
   * scanner declined it), `503 CONTENT_SCAN_UNAVAILABLE` (no verdict yet for a
   * young project — nothing was sent, retry shortly). A mailbox may send 60
   * messages an hour here.
   */
  async sendMessage(id: string, body: ComposeMailboxMessageRequest): Promise<MailboxMessageSubmitted> {
    const envelope = await this.client.request<{ success: true; data: MailboxMessageSubmitted }>({
      method: "POST",
      path: `/api/mailboxes/${encodeURIComponent(id)}/messages`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * SENDS NOTHING — asks Sendly's assistant to write text for this mailbox and
   * hands it back for you to review. The response always reports `sent: false`,
   * and no argument changes that.
   *
   * `mode` picks the job: `draft` writes a new email from a brief, `rewrite`
   * reworks text you already have, `subject` returns alternative subject lines
   * in `subjects`. The mailbox is named only so the text can be written in that
   * address's voice; no correspondence is read and nothing is stored.
   *
   * That is why this asks only for `mailboxes:read` while {@link sendMessage}
   * needs `mailboxes:send` — a client that may draft is not thereby a client
   * that may mail your customers. Everything you pass is treated strictly as
   * data describing what to write, never as instructions to the model. Capped
   * at 120 requests an hour per project; `502` means the model was unreachable.
   */
  async draftMessage(id: string, body: DraftMailboxMessageRequest): Promise<MailboxMessageDraft> {
    const envelope = await this.client.request<{ success: true; data: MailboxMessageDraft }>({
      method: "POST",
      path: `/api/mailboxes/${encodeURIComponent(id)}/drafts`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /*
   * THE MAIL ITSELF. The four methods below read and answer correspondence from
   * people outside your project, so they need `mailbox-conversations:read` (and
   * `mailbox-conversations:reply` to answer). Those scopes are opt-in only: a key
   * carries one only if it was ticked by name when the key was created, and
   * neither the legacy full-access key nor the "Full access" preset has it. An
   * existing key answers `403` here until you mint one that does.
   */

  /**
   * One page of a mailbox's threads, newest activity first, from the Inbox
   * view (default) or the Spam view. Page by passing `nextCursor` back as
   * `cursor` until it is null; {@link listAllConversations} does that for you.
   * A mailbox in another project answers `404`.
   */
  async listConversations(id: string, query?: ListMailboxConversationsQuery): Promise<MailboxConversationPage> {
    const envelope = await this.client.request<{ success: true; data: MailboxConversationPage }>({
      method: "GET",
      path: `/api/mailboxes/${encodeURIComponent(id)}/conversations`,
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Iterate every thread in a mailbox across pages, one conversation at a time. */
  async *listAllConversations(
    id: string,
    query?: ListMailboxConversationsQuery,
  ): AsyncGenerator<MailboxConversation, void, undefined> {
    let cursor = query?.cursor;
    do {
      const page = await this.listConversations(id, { ...query, cursor });
      yield* page.items;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  /**
   * Every message in one thread, oldest first, inbound and outbound together.
   * Not paginated, and reading marks nothing as read.
   *
   * Bodies are written by whoever sent them: treat `htmlBody` as hostile HTML.
   * A conversation that is not in this mailbox resolves an empty list rather
   * than throwing; a mailbox outside the key's project answers `404`.
   */
  async getConversation(id: string, conversationId: string): Promise<MailboxMessage[]> {
    const envelope = await this.client.request<{ success: true; data: MailboxMessage[] }>({
      method: "GET",
      path: `/api/mailboxes/${encodeURIComponent(id)}/conversations/${encodeURIComponent(conversationId)}`,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * SENDS a reply, from the mailbox's own address, inside the same thread, to
   * the person who last wrote in. You name neither the recipient nor the
   * sender: this only ever answers someone who wrote first, which is why it has
   * its own scope (`mailbox-conversations:reply`) and is not {@link sendMessage}.
   *
   * Pass plain text in `body` or a structured `document`; Sendly renders the
   * HTML and a matching text part. Refusals worth handling by name:
   * `422 UNPROCESSABLE` (no inbound message to answer, or the mailbox is not
   * provisioned), `422 SEND_REFUSED` (the recipient is suppressed or the project
   * may not send), `429 SENDING_LIMIT_REACHED`.
   */
  async replyToConversation(
    id: string,
    conversationId: string,
    body: MailboxConversationReplyRequest,
  ): Promise<MailboxConversationReply> {
    const envelope = await this.client.request<{ success: true; data: MailboxConversationReply }>({
      method: "POST",
      path: `/api/mailboxes/${encodeURIComponent(id)}/conversations/${encodeURIComponent(conversationId)}/reply`,
      body,
    });
    return this.client.unwrap(envelope);
  }

  /**
   * The bytes of one attachment, the `url` a message lists, fetched from the
   * mail server on demand. The file and its `contentType` were chosen by the
   * sender: treat both as untrusted, and never serve the bytes back to a
   * browser under your own origin without a fixed type.
   */
  async downloadAttachment(id: string, attachmentId: string): Promise<SendlyFile> {
    return this.client.requestBytes({
      method: "GET",
      path: `/api/mailboxes/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    });
  }
}
