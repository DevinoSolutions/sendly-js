import { SendlyValidationError } from "../errors";

/**
 * The most bytes `POST /api/emails/batch` accepts as its JSON body: 32 MiB (33,554,432 bytes).
 *
 * Mirrors the server's own cap. A larger batch is answered `413` with `error.code`
 * `PAYLOAD_TOO_LARGE`; checking here first saves uploading up to 100 MB only to be refused.
 * Attachments are what make a batch this large: each entry may carry 10 MB of them, base64-encoded.
 */
export const MAX_BATCH_REQUEST_BYTES = 32 * 1024 * 1024;

/**
 * Refuse a batch whose serialized body is over {@link MAX_BATCH_REQUEST_BYTES}, before any request
 * is made, with the same `SendlyValidationError` and `errorCode` the server's `413` maps to.
 * `statusCode` is `0`, as for every check the SDK makes itself.
 */
export function assertBatchWithinByteCap(body: unknown): void {
  const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  if (bytes > MAX_BATCH_REQUEST_BYTES) {
    throw new SendlyValidationError(
      0,
      "PAYLOAD_TOO_LARGE",
      `This batch serializes to ${bytes} bytes; POST /api/emails/batch accepts at most ${MAX_BATCH_REQUEST_BYTES} (32 MiB). ` +
        "Split it across several emails.batch calls.",
    );
  }
}
