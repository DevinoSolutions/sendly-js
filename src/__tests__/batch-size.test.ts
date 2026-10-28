import { describe, expect, test } from "vitest";
import { MAX_BATCH_REQUEST_BYTES, SendlyError, SendlyValidationError } from "../index";
import { jsonResponse, makeClient } from "./helpers";

/** One batch whose JSON body is exactly `bytes` long. */
function batchOfBytes(bytes: number) {
  const entry = (body: string) => ({ from: "a@b.com", to: "c@d.com", subject: "s", body });
  const overhead = JSON.stringify({ emails: [entry("")] }).length;
  const batch = { emails: [entry("x".repeat(bytes - overhead))] };
  expect(JSON.stringify(batch).length).toBe(bytes);
  return batch;
}

describe("emails.batch — the 32 MiB body cap", () => {
  test("is the server's number", () => {
    expect(MAX_BATCH_REQUEST_BYTES).toBe(32 * 1024 * 1024);
  });

  test("a batch one byte over the cap rejects before any request is made", async () => {
    const { client, fetchMock } = makeClient();

    const call = client.emails.batch(batchOfBytes(MAX_BATCH_REQUEST_BYTES + 1));

    await expect(call).rejects.toBeInstanceOf(SendlyValidationError);
    await expect(call).rejects.toMatchObject({
      statusCode: 0,
      errorCode: "PAYLOAD_TOO_LARGE",
      message: expect.stringContaining(String(MAX_BATCH_REQUEST_BYTES + 1)),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("counts bytes, not characters: multi-byte content crosses the cap sooner", async () => {
    const { client, fetchMock } = makeClient();
    // 17 Mi characters of "é" are 34 MiB of UTF-8: under the cap counted in characters, over it in bytes.
    const batch = { emails: [{ from: "a@b.com", to: "c@d.com", subject: "s", body: "é".repeat(17 * 1024 * 1024) }] };
    expect(JSON.stringify(batch).length).toBeLessThan(MAX_BATCH_REQUEST_BYTES);

    await expect(client.emails.batch(batch)).rejects.toMatchObject({ errorCode: "PAYLOAD_TOO_LARGE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a batch of exactly the cap is sent", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));

    await client.emails.batch(batchOfBytes(MAX_BATCH_REQUEST_BYTES));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("the server's own 413 is the same SendlyValidationError, with its status", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(413, {
        success: false,
        error: { message: "The request body may be at most 32 MiB (33554432 bytes).", code: "PAYLOAD_TOO_LARGE" },
      }),
    );

    const call = client.emails.batch({ emails: [{ from: "a@b.com", to: "c@d.com", subject: "s", body: "h" }] });

    await expect(call).rejects.toBeInstanceOf(SendlyValidationError);
    await expect(call).rejects.toBeInstanceOf(SendlyError);
    await expect(call).rejects.toMatchObject({ statusCode: 413, errorCode: "PAYLOAD_TOO_LARGE" });
  });
});
