import { describe, expect, test } from "vitest";
import { SendlyError } from "../index";
import { getCall, jsonResponse, makeClient, rejection } from "./helpers";

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

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  test("uploads.image keeps the type of a File and takes its name", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { url: "u" }));
    await client.uploads.image(new File([png], "photo.webp", { type: "image/webp" }));
    const sent = (getCall(fetchMock).init.body as FormData).get("image") as File;
    expect(sent.type).toBe("image/webp");
    expect(sent.name).toBe("photo.webp");
  });

  test("uploads.image infers the type of raw bytes from the filename extension", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { url: "u" }));
    await client.uploads.image(png, "Logo.PNG");
    expect(((getCall(fetchMock).init.body as FormData).get("image") as File).type).toBe("image/png");

    await client.uploads.image(png.buffer as ArrayBuffer, "a.jpeg");
    expect(((getCall(fetchMock, 1).init.body as FormData).get("image") as File).type).toBe("image/jpeg");
  });

  test("uploads.image infers the type of an untyped Blob from the filename", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { url: "u" }));
    await client.uploads.image(new Blob([png]), "a.gif");
    expect(((getCall(fetchMock).init.body as FormData).get("image") as File).type).toBe("image/gif");
  });

  test("uploads.image: an explicit contentType wins", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { url: "u" }));
    await client.uploads.image(png, "noext", "image/png");
    expect(((getCall(fetchMock).init.body as FormData).get("image") as File).type).toBe("image/png");
  });

  test("uploads.image refuses, before any request, when no image type can be found", async () => {
    const { client, fetchMock } = makeClient();
    const error = await rejection(client.uploads.image(png, "photo.tiff"));
    expect(error.errorCode).toBe("invalid_options");
    await expect(client.uploads.image(new Blob([png], { type: "text/plain" }), "x")).rejects.toThrow(/image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("uploads.image: a 413 keeps its status and code on the thrown error", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(413, { success: false, error: { message: "Image too large", code: "PAYLOAD_TOO_LARGE" } }),
    );
    const error = await rejection(client.uploads.image(png, "big.png"));
    expect(error).toBeInstanceOf(SendlyError);
    expect(error.statusCode).toBe(413);
    expect(error.errorCode).toBe("PAYLOAD_TOO_LARGE");
  });

  test.each([
    ["LOGO.PNG", "image/png"],
    ["a.webp", "image/webp"],
    ["b.JPG", "image/jpeg"],
    ["c.jpeg", "image/jpeg"],
    ["d.Gif", "image/gif"],
  ])("uploads.image maps the extension of %s to %s from an explicit table", async (name, type) => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { url: "u" }));
    await client.uploads.image(png, name);
    const sent = (getCall(fetchMock).init.body as FormData).get("image") as File;
    expect(sent.type).toBe(type);
    expect(sent.name).toBe(name);
  });
});
