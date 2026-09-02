import { describe, expect, test } from "vitest";
import { SendlyAuthenticationError } from "../index";
import { getCall, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

describe("projects resource (/api/v1)", () => {
  test("get GETs /api/v1/projects and resolves the bare project body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: "proj_1",
        name: "Acme",
        disabled: false,
        sandbox_address: "sandbox.proj_1@sendly.now",
        ses_region: "eu-west-1",
        tracking: "ENABLED",
        language: "en",
        created_at: "2026-09-01T00:00:00.000Z",
      }),
    );

    const project = await client.projects.get();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/projects");
    expect(init.method).toBe("GET");
    // No id argument: the project is whichever one the key belongs to.
    expect(init.body).toBeUndefined();
    expect(project.name).toBe("Acme");
    // Without this a test send is undiscoverable — it says where the mail lands.
    expect(project.sandbox_address).toBe("sandbox.proj_1@sendly.now");
  });

  test("an invalid key maps to SendlyAuthenticationError", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(401, {
        type: "https://docs.sendly.now/errors/invalid_api_key",
        title: "Invalid API key",
        code: "invalid_api_key",
        request_id: "req_proj",
      }),
    );

    const error = await rejection<SendlyAuthenticationError>(client.projects.get());
    expect(error).toBeInstanceOf(SendlyAuthenticationError);
    expect(error.requestId).toBe("req_proj");
  });
});
