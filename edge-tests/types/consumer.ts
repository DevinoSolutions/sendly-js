// A consumer file compiled against the PACKED package's shipped .d.ts, by edge-tests/types.test.ts.
// It only has to type-check; it is never executed.
import { Sendly, SendlyError, SendlyRateLimitError, paginateCursor } from "sendly-sdk";
import type { EmailV1, SendEmailV1Request } from "sendly-sdk";

const sendly = new Sendly({ apiKey: "sk_test_types", timeout: 5_000, fetch: globalThis.fetch });

export async function send(request: SendEmailV1Request): Promise<EmailV1["status"]> {
  const receipt: EmailV1 = await sendly.emails.send(request, { idempotencyKey: "types-1" });
  return receipt.status;
}

export async function handle(): Promise<number | undefined> {
  try {
    await sendly.emails.send({ to: "test+types@example.com", subject: "s", body: "b" });
  } catch (error) {
    if (error instanceof SendlyRateLimitError) return error.statusCode;
    if (error instanceof SendlyError) return error.statusCode;
  }
  return undefined;
}

export function typedMisuseIsRejected(): void {
  // @ts-expect-error apiKey is required
  new Sendly({});
  // @ts-expect-error timeout is a number
  new Sendly({ apiKey: "sk_test_types", timeout: "5s" });
  // @ts-expect-error idempotencyKey is a string
  void sendly.emails.send({ to: "test+types@example.com" }, { idempotencyKey: 1 });
}

export const pager = paginateCursor;
