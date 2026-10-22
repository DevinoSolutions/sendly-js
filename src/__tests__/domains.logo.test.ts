import { describe, expect, test } from "vitest";
import { SendlyValidationError } from "../index";
import { getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

/** Only the fields these tests read. On /api/v1 the body is the bare document, no envelope. */
const LOGO = {
  domain_id: "dom_1",
  source: "uploaded",
  url: "https://api.sendly.now/bimi/dom_1.svg",
  serving: true,
  bimi_record: { host: "default._bimi.mail.example.com", value: "v=BIMI1; l=https://api.sendly.now/bimi/dom_1.svg" },
};

describe("domains: the sender logo (BIMI)", () => {
  test("getLogoV1 GETs the logo document and resolves it as is", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, LOGO));

    const logo = await client.domains.getLogoV1("dom_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/domains/dom_1/logo");
    expect(logo).toEqual(LOGO);
  });

  test("uploadLogoV1 PUTs the SVG source as JSON", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, LOGO));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

    await client.domains.uploadLogoV1("dom_1", { svg });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/domains/dom_1/logo");
    expect(init.method).toBe("PUT");
    expect(getCallBody(fetchMock)).toEqual({ svg });
  });

  test("a logo that cannot be rebuilt into SVG Tiny PS is a validation error naming what to change", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(422, {
        type: "https://docs.sendly.now/errors/validation_error",
        title: "Validation error",
        code: "validation_error",
        detail: "Convert the text to outlines: <text> is not allowed in SVG Tiny PS.",
      }),
    );

    const error = await rejection(client.domains.uploadLogoV1("dom_1", { svg: "<svg><text>Acme</text></svg>" }));

    expect(error).toBeInstanceOf(SendlyValidationError);
    expect(error.message).toContain("outlines");
  });

  test("deleteLogoV1 DELETEs the upload and resolves the logo now served", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { ...LOGO, source: "default" }));

    const logo = await client.domains.deleteLogoV1("dom_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/domains/dom_1/logo");
    expect(init.method).toBe("DELETE");
    expect(logo.source).toBe("default");
  });

  test("getLogoReadinessV1 GETs the per-inbox checklist", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { domain_id: "dom_1", items: [], providers: [] }));

    const readiness = await client.domains.getLogoReadinessV1("dom_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/domains/dom_1/logo/readiness");
    expect(readiness.domain_id).toBe("dom_1");
  });
});
