import { describe, expect, test } from "vitest";
import {
  asProblemDocument,
  SendlyAuthenticationError,
  SendlyError,
  SendlyPermissionError,
  SendlyRateLimitError,
  SendlyValidationError,
} from "../index";
import { errorFromResponse } from "../errors";
import { jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

describe("RFC 9457 problem document detection", () => {
  test("recognizes a problem document by its type + title + code triple", () => {
    const problem = asProblemDocument({
      type: "https://docs.sendly.now/errors/scope_missing",
      title: "Scope missing",
      status: 403,
      code: "scope_missing",
    });
    expect(problem?.code).toBe("scope_missing");
  });

  test("recognizes a problem document declared only by content type", () => {
    const problem = asProblemDocument({ status: 500, code: "internal_error" }, "application/problem+json");
    expect(problem?.code).toBe("internal_error");
    // Absent required members are filled with inert defaults rather than dropped.
    expect(problem?.type).toBe("about:blank");
  });

  test("does not mistake a legacy error envelope for a problem document", () => {
    expect(asProblemDocument({ success: false, error: { message: "bad", code: "VALIDATION_ERROR" } })).toBeUndefined();
  });

  test("does not treat an arbitrary object carrying `code` as a problem document", () => {
    expect(asProblemDocument({ code: "some_field" })).toBeUndefined();
  });

  test("drops malformed entries from the field-error array", () => {
    const problem = asProblemDocument({
      type: "https://docs.sendly.now/errors/validation_error",
      title: "Validation error",
      status: 422,
      code: "validation_error",
      errors: [{ pointer: "/name", code: "too_short", message: "min 1" }, { pointer: "/name" }, "nonsense"],
    });
    expect(problem?.errors).toEqual([{ pointer: "/name", code: "too_short", message: "min 1" }]);
  });
});

describe("errorFromResponse across both dialects", () => {
  test("a problem document overrides the error code and message", () => {
    const error = errorFromResponse(
      403,
      "http_403",
      "Sendly request failed with status 403",
      {
        type: "https://docs.sendly.now/errors/scope_missing",
        title: "Scope missing",
        status: 403,
        detail: "This key is missing the campaigns:write scope.",
        code: "scope_missing",
        request_id: "req_abc123",
      },
      "application/problem+json",
    );
    expect(error).toBeInstanceOf(SendlyPermissionError);
    expect(error.errorCode).toBe("scope_missing");
    expect(error.message).toBe("This key is missing the campaigns:write scope.");
    expect(error.requestId).toBe("req_abc123");
  });

  test("falls back to the problem title when it carries no detail", () => {
    const error = errorFromResponse(404, "http_404", "fallback", {
      type: "https://docs.sendly.now/errors/resource_not_found",
      title: "Resource not found",
      status: 404,
      code: "resource_not_found",
    });
    expect(error.message).toBe("Resource not found");
  });

  test("legacy envelope handling is unchanged — code and message pass through", () => {
    const error = errorFromResponse(400, "VALIDATION_ERROR", "bad email", {
      success: false,
      error: { message: "bad email", code: "VALIDATION_ERROR" },
    });
    expect(error).toBeInstanceOf(SendlyValidationError);
    expect(error.errorCode).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("bad email");
    expect(error.requestId).toBeUndefined();
    expect(error.fieldErrors).toBeUndefined();
  });

  test("a directly constructed error still picks problem fields off its body", () => {
    const error = new SendlyError(429, "quota_exhausted", "over quota", {
      type: "https://docs.sendly.now/errors/quota_exhausted",
      title: "Quota exhausted",
      status: 429,
      code: "quota_exhausted",
      request_id: "req_direct",
    });
    expect(error.requestId).toBe("req_direct");
  });
});

describe("v1 errors surfaced through a request", () => {
  test("422 validation_error exposes the field errors by JSON Pointer", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(422, {
        type: "https://docs.sendly.now/errors/validation_error",
        title: "Validation error",
        detail: "The request body failed validation.",
        instance: "/api/v1/campaigns",
        code: "validation_error",
        request_id: "req_v1",
        errors: [
          { pointer: "/subject", code: "too_short", message: "String must contain at least 1 character(s)" },
          { pointer: "/from", code: "invalid_email", message: "Invalid email" },
        ],
      }),
    );

    await expect(
      client.campaigns.create({ name: "n", subject: "", body: "b", from: "nope", audience_type: "ALL" }),
    ).rejects.toBeInstanceOf(SendlyValidationError);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      problemResponse(422, {
        type: "https://docs.sendly.now/errors/validation_error",
        title: "Validation error",
        detail: "The request body failed validation.",
        code: "validation_error",
        request_id: "req_v1",
        errors: [{ pointer: "/subject", code: "too_short", message: "String must contain at least 1 character(s)" }],
      }),
    );
    const error = await rejection<SendlyValidationError>(
      client.campaigns.create({ name: "n", subject: "", body: "b", from: "a@b.com", audience_type: "ALL" }),
    );

    expect(error.errorCode).toBe("validation_error");
    expect(error.message).toBe("The request body failed validation.");
    expect(error.requestId).toBe("req_v1");
    expect(error.fieldErrors).toEqual([
      { pointer: "/subject", code: "too_short", message: "String must contain at least 1 character(s)" },
    ]);
  });

  test("401 invalid_api_key maps to SendlyAuthenticationError with the registry code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(401, {
        type: "https://docs.sendly.now/errors/invalid_api_key",
        title: "Invalid API key",
        detail: "The supplied API key is not valid.",
        code: "invalid_api_key",
      }),
    );
    const error = await rejection<SendlyAuthenticationError>(client.usage.get());
    expect(error).toBeInstanceOf(SendlyAuthenticationError);
    expect(error.errorCode).toBe("invalid_api_key");
    expect(error.statusCode).toBe(401);
  });

  test("429 distinguishes a burst limit from an exhausted billing quota", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(429, {
        type: "https://docs.sendly.now/errors/rate_limited",
        title: "Rate limited",
        code: "rate_limited",
      }),
    );
    const burst = await rejection<SendlyRateLimitError>(client.usage.get());
    expect(burst).toBeInstanceOf(SendlyRateLimitError);
    expect(burst.errorCode).toBe("rate_limited");

    fetchMock.mockResolvedValue(
      problemResponse(429, {
        type: "https://docs.sendly.now/errors/quota_exhausted",
        title: "Quota exhausted",
        code: "quota_exhausted",
      }),
    );
    const quota = await rejection<SendlyRateLimitError>(client.usage.get());
    expect(quota).toBeInstanceOf(SendlyRateLimitError);
    expect(quota.errorCode).toBe("quota_exhausted");
  });

  test("a legacy endpoint's envelope error still resolves the legacy code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(422, { success: false, error: { message: "invalid body", code: "VALIDATION_ERROR" } }),
    );
    const error = await rejection<SendlyValidationError>(client.emails.sendLegacy({ to: "user@example.com" }));
    expect(error.errorCode).toBe("VALIDATION_ERROR");
    expect(error.requestId).toBeUndefined();
  });
});
