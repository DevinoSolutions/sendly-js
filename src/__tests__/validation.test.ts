import { describe, expect, test } from "vitest";
import { SendlyValidationError } from "../index";
import type { EmailValidationResultListV1 } from "../types";
import { getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

type ValidationResult = EmailValidationResultListV1["data"][number];

function validation(email: string, verdict: ValidationResult["verdict"]): ValidationResult {
  return {
    email,
    verdict,
    is_disposable: false,
    is_role_address: false,
    is_personal: true,
    has_mx_records: verdict !== "undeliverable",
    reasons: [],
    contact_id: null,
  };
}

/**
 * One page of a run's results.
 *
 * Deliberately not `helpers.cursorPage`: this endpoint's envelope names the
 * next page `cursor`, not `next_cursor`, so the shared builder would describe a
 * shape the API never sends.
 */
function resultsPage(data: ValidationResult[], cursor: string | null): Response {
  return jsonResponse(200, { data, cursor, has_more: cursor !== null });
}

describe("validation resource (/api/v1)", () => {
  test("validateEmails POSTs the batch to /api/v1/email-validations", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { results: [validation("a@example.com", "deliverable")] }));

    const batch = await client.validation.validateEmails({ emails: ["a@example.com"] });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/email-validations");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ emails: ["a@example.com"] });
    expect(batch.results[0]?.verdict).toBe("deliverable");
  });

  test("`unknown` is carried through as its own verdict, distinct from `undeliverable`", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        results: [validation("dns-timeout@example.com", "unknown"), validation("nope@example.com", "undeliverable")],
      }),
    );

    const batch = await client.validation.validateEmails({ emails: ["dns-timeout@example.com", "nope@example.com"] });

    expect(batch.results.map((r) => r.verdict)).toEqual(["unknown", "undeliverable"]);
  });

  test("a batch over the 50-address ceiling surfaces the 422 problem", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(422, {
        type: "https://docs.sendly.now/errors/validation_error",
        title: "Validation Error",
        detail: "`emails` must contain at most 50 items.",
        code: "validation_error",
        request_id: "req_val_422",
      }),
    );

    const error = await rejection<SendlyValidationError>(
      client.validation.validateEmails({ emails: Array.from({ length: 51 }, (_, i) => `u${i}@example.com`) }),
    );
    expect(error).toBeInstanceOf(SendlyValidationError);
    expect(error.errorCode).toBe("validation_error");
  });

  test("getRun GETs the run by id", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "vrun_1", status: "running", processed_count: 12 }));

    const run = await client.validation.getRun("vrun_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/validation-runs/vrun_1");
    expect(init.method).toBe("GET");
    expect(run.status).toBe("running");
  });

  test("listResults serializes limit, verdict and the `cursor` page parameter", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(resultsPage([], null));

    await client.validation.listResults("vrun_1", { limit: 50, verdict: "undeliverable", cursor: "cur_1" });

    const { url } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/v1/validation-runs/vrun_1/results?");
    expect(url).toContain("limit=50");
    expect(url).toContain("verdict=undeliverable");
    expect(url).toContain("cursor=cur_1");
    expect(url).not.toContain("after=");
  });

  test("listResults resolves the envelope itself — the page is not unwrapped to its data array", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(resultsPage([validation("a@example.com", "risky")], "cur_2"));

    const page = await client.validation.listResults("vrun_1");

    expect(page.has_more).toBe(true);
    expect(page.cursor).toBe("cur_2");
    expect(page.data).toHaveLength(1);
  });

  test("listResultsAll pages on `cursor`, not the `after` the other v1 lists take", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(resultsPage([validation("a@example.com", "undeliverable")], "cur_2"))
      .mockResolvedValueOnce(resultsPage([validation("b@example.com", "undeliverable")], null));

    const seen: string[] = [];
    for await (const result of client.validation.listResultsAll("vrun_1", { verdict: "undeliverable" })) {
      seen.push(result.email);
    }

    expect(seen).toEqual(["a@example.com", "b@example.com"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
    const second = getCall(fetchMock, 1).url;
    expect(second).toContain("cursor=cur_2");
    expect(second).not.toContain("after=");
    expect(second).toContain("verdict=undeliverable");
  });

  test("listResultsAll stops on the last page instead of re-fetching it", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(resultsPage([validation("a@example.com", "deliverable")], null));

    const seen: string[] = [];
    for await (const result of client.validation.listResultsAll("vrun_1")) seen.push(result.email);

    expect(seen).toEqual(["a@example.com"]);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});
