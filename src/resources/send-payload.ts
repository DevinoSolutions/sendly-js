import type { components } from "../types.generated";
import { SendlyValidationError } from "../errors";
import type { ProblemFieldError } from "../errors";

/** The generated body of `POST /api/v1/emails` — the single source of the key set below. */
type SendEmailV1Schema = components["schemas"]["SendEmailV1"];

/** A key `emails.send` accepts: exactly the generated body's own keys. */
export type SendEmailV1Key = keyof SendEmailV1Schema;

/**
 * Every key the send body accepts.
 *
 * `satisfies` rejects an entry the generated body does not have, and
 * {@link AllSendKeysListed} below rejects a body key missing from this list, so
 * a `pnpm build:types` that adds, renames or drops a property fails the type
 * check here instead of silently refusing (or forwarding) it. A contract test
 * additionally compares the list with the committed OpenAPI file.
 */
export const SEND_EMAIL_V1_KEYS = [
  "attachments",
  "bcc",
  "body",
  "cc",
  "data",
  "from",
  "headers",
  "name",
  "reply",
  "subject",
  "subscribed",
  "tags",
  "template",
  "to",
] as const satisfies readonly SendEmailV1Key[];

type MissingSendKeys = Exclude<SendEmailV1Key, (typeof SEND_EMAIL_V1_KEYS)[number]>;
// A non-empty `MissingSendKeys` makes this `never`, which `true` is not assignable to.
export type AllSendKeysListed = [MissingSendKeys] extends [never] ? true : never;
export const ALL_SEND_KEYS_LISTED: AllSendKeysListed = true;

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>(SEND_EMAIL_V1_KEYS);

/**
 * What a caller coming from another provider's payload shape most likely meant.
 * Every target is typed as a real send key, so a hint can never point at a
 * field Sendly does not have. Keys are matched exactly, after the
 * case-insensitive match against the real keys has failed (`Subject`, `CC`).
 */
const SEND_KEY_HINTS = {
  html: { use: "body", reason: "Sendly's HTML content field" },
  htmlBody: { use: "body", reason: "Sendly's HTML content field" },
  html_body: { use: "body", reason: "Sendly's HTML content field" },
  replyTo: { use: "reply", reason: "Sendly's reply-to field" },
  reply_to: { use: "reply", reason: "Sendly's reply-to field" },
  templateId: { use: "template", reason: "Sendly's template field" },
  template_id: { use: "template", reason: "Sendly's template field" },
} as const satisfies Record<string, { use: SendEmailV1Key; reason: string }>;

/**
 * Provider fields that have no counterpart in the send body. Plain-text
 * alternatives are the common one: the body is a single content field, with no
 * separate text part to fill.
 */
const NO_COUNTERPART: Readonly<Record<string, string>> = {
  text: 'Sendly has no separate plain-text field; the message content goes in "body"',
  textBody: 'Sendly has no separate plain-text field; the message content goes in "body"',
  text_body: 'Sendly has no separate plain-text field; the message content goes in "body"',
};

function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function describeUnknownKey(key: string): string {
  const folded = key.toLowerCase();
  const sameKeyOtherCase = SEND_EMAIL_V1_KEYS.find((known) => known.toLowerCase() === folded);
  if (sameKeyOtherCase)
    return `unknown field "${key}"; did you mean "${sameKeyOtherCase}"? Field names are case-sensitive`;

  if (hasOwn(SEND_KEY_HINTS, key)) {
    const hint = SEND_KEY_HINTS[key as keyof typeof SEND_KEY_HINTS];
    return `unknown field "${key}"; ${hint.reason} is "${hint.use}"`;
  }
  if (hasOwn(NO_COUNTERPART, key)) return `unknown field "${key}"; ${NO_COUNTERPART[key]}`;
  return `unknown field "${key}"; accepted fields are ${SEND_EMAIL_V1_KEYS.map((known) => `"${known}"`).join(", ")}`;
}

/**
 * Refuse a send body that carries a key the endpoint does not define.
 *
 * The endpoint's schema is open (`additionalProperties` unset), so a payload
 * shaped for another provider — `html`, `replyTo` — is not rejected by the
 * server: it is answered `202` and delivered with no content. TypeScript does
 * not catch it either, because excess-property checks do not run on a payload
 * built elsewhere and passed as a variable. Refusing it here turns that silent
 * empty email into an error that names the field to use. Nothing is sent.
 *
 * A body that is not a plain object is left to the server to refuse.
 */
export function assertKnownSendKeys(body: unknown): void {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return;
  const unknown = Object.keys(body).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length === 0) return;

  const errors: ProblemFieldError[] = unknown.map((key) => ({
    pointer: `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
    code: "unknown_field",
    message: describeUnknownKey(key),
  }));
  throw new SendlyValidationError(0, "unknown_field", errors.map((error) => error.message).join("; "), undefined, {
    type: "about:blank",
    title: "Unknown field",
    status: 0,
    code: "unknown_field",
    errors,
  });
}
