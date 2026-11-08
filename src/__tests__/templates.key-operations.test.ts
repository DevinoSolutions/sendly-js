import { describe, expect, test } from "vitest";
import { getCall, jsonResponse, makeClient } from "./helpers";

const envelope = (data: unknown) => jsonResponse(200, { success: true, data });

describe("templates and uploads (legacy dialect)", () => {
  test("duplicate POSTs /duplicate and resolves the copy", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { success: true, data: { id: "t2", name: "Welcome (copy)" } }));

    const copy = await client.templates.duplicate("t1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/templates/t1/duplicate");
    expect(init.method).toBe("POST");
    expect(copy.id).toBe("t2");
  });

  test("getUsage and listVersions are GETs that unwrap the envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValueOnce(envelope({ campaigns: [], workflows: [{ id: "w1" }] }));
    const usage = await client.templates.getUsage("t1");
    expect(getCall(fetchMock, 0).url).toBe("http://localhost/api/templates/t1/usage");
    expect(usage.workflows).toEqual([{ id: "w1" }]);

    fetchMock.mockResolvedValueOnce(envelope([{ version: 2 }, { version: 1 }]));
    const versions = await client.templates.listVersions("t1");
    expect(getCall(fetchMock, 1).url).toBe("http://localhost/api/templates/t1/versions");
    expect(versions).toEqual([{ version: 2 }, { version: 1 }]);
  });

  test("revertVersion POSTs the version number in the path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "t1", name: "Welcome" }));

    await client.templates.revertVersion("t1", 3);

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/templates/t1/versions/3/revert");
    expect(init.method).toBe("POST");
  });

  test("uploads.image sends multipart form data under `image` and resolves the bare upload", async () => {
    const { client, fetchMock } = makeClient();
    const uploaded = {
      url: "https://cdn.example/x.png",
      key: "k",
      filename: "logo.png",
      contentType: "image/png",
      size: 4,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, uploaded));

    const result = await client.uploads.image(new Blob(["abcd"], { type: "image/png" }), "logo.png");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/uploads/image");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const sent = (init.body as FormData).get("image") as File;
    expect(sent.name).toBe("logo.png");
    expect(sent.type).toBe("image/png");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(result).toEqual(uploaded);
  });
});
