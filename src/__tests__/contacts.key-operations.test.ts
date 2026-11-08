import { describe, expect, test } from "vitest";
import { getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";
import { SendlyValidationError } from "../index";

const envelope = (data: unknown) => jsonResponse(200, { success: true, data });

describe("contacts: custom fields", () => {
  test("listFields GETs /api/contacts/fields and unwraps the envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      envelope({ fields: [{ field: "customFields.plan", type: "string", coverage: 0.5 }], count: 1 }),
    );

    const result = await client.contacts.listFields();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/fields");
    expect(init.method).toBe("GET");
    expect(result.count).toBe(1);
    expect(result.fields[0]?.type).toBe("string");
  });

  test("deleteField DELETEs the encoded dotted path and resolves the queued acknowledgement", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, { success: true, data: { status: "queued" } }));

    const result = await client.contacts.deleteField("customFields.plan");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/fields/customFields.plan");
    expect(init.method).toBe("DELETE");
    expect(result.status).toBe("queued");
  });

  test("a field name is path-encoded, so a slash cannot reach another route", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({}));
    await client.contacts.getFieldUsage("customFields.a/b");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/contacts/fields/customFields.a%2Fb/usage");
  });

  test("getFieldUsage GETs /usage and resolves the usage report", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      envelope({
        usedInSegments: [],
        usedInCampaigns: [{ id: "c1", name: "Spring" }],
        contactCount: 9,
        canDelete: false,
      }),
    );

    const usage = await client.contacts.getFieldUsage("customFields.plan");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/contacts/fields/customFields.plan/usage");
    expect(usage.canDelete).toBe(false);
    expect(usage.usedInCampaigns[0]?.name).toBe("Spring");
  });

  test("listFieldValues maps limit onto the query string", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ field: "customFields.plan", values: ["pro"], count: 1, limit: 5 }));

    const values = await client.contacts.listFieldValues("customFields.plan", { limit: 5 });

    expect(getCall(fetchMock).url).toBe("http://localhost/api/contacts/fields/customFields.plan/values?limit=5");
    expect(values.values).toEqual(["pro"]);
  });
});

describe("contacts: export, import and lookup", () => {
  test("exportLink GETs the export route and resolves the one-time handoff link", async () => {
    const { client, fetchMock } = makeClient();
    const link = {
      status: "action_required",
      url: "https://app.sendly.now/go/abc",
      expires_in: 900,
      what: "Open this to download this project's contacts as CSV.",
      instruction: "Open the link.",
    };
    fetchMock.mockResolvedValue(jsonResponse(200, link));

    const result = await client.contacts.exportLink({ search: "example", subscribed: false });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/export?search=example&subscribed=false");
    expect(init.method).toBe("GET");
    expect(result).toEqual(link);
  });

  test("importCsv sends the CSV as multipart form data under `file`, with no JSON content type", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, { success: true, data: { message: "Import queued successfully" } }));

    const result = await client.contacts.importCsv("email,plan\nuser@example.com,pro\n", "people.csv");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/import");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const sent = (init.body as FormData).get("file");
    expect(sent).toBeInstanceOf(Blob);
    expect((sent as File).name).toBe("people.csv");
    expect(await (sent as File).text()).toBe("email,plan\nuser@example.com,pro\n");
    // fetch has to add the multipart boundary itself, so the SDK must not have set a type.
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(result.message).toBe("Import queued successfully");
  });

  test("importCsv always sends the part typed text/csv, whatever the Blob said", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ message: "ok" }));
    await client.contacts.importCsv(
      new Blob(["email\na@example.com\n"], { type: "application/octet-stream" }),
      "x.txt",
    );
    const sent = (getCall(fetchMock).init.body as FormData).get("file") as File;
    expect(sent.type).toBe("text/csv");
  });

  test("importCsv accepts a Blob and keeps the default filename", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ message: "ok" }));
    await client.contacts.importCsv(new Blob(["email\na@example.com\n"], { type: "text/csv" }));
    const sent = ((getCall(fetchMock).init.body as FormData).get("file") ?? null) as File | null;
    expect(sent?.name).toBe("contacts.csv");
  });

  test("lookup POSTs the addresses and resolves found / notFound", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ found: ["a@example.com"], notFound: ["b@example.com"] }));

    const result = await client.contacts.lookup({ emails: ["a@example.com", "b@example.com"] });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/lookup");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ emails: ["a@example.com", "b@example.com"] });
    expect(result.found).toEqual(["a@example.com"]);
    expect(result.notFound).toEqual(["b@example.com"]);
  });

  test("a refusal arrives as a typed error", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(422, { type: "about:blank", title: "Unprocessable", code: "validation_error", detail: "bad" }),
    );
    const error = await rejection(client.contacts.lookup({ emails: [] }));
    expect(error).toBeInstanceOf(SendlyValidationError);
  });
});

describe("contacts: bulk actions and erasure", () => {
  test.each([
    ["queueBulkDelete", "/api/contacts/bulk-delete"],
    ["queueBulkPurge", "/api/contacts/bulk-purge"],
    ["queueBulkSubscribe", "/api/contacts/bulk-subscribe"],
    ["queueBulkUnsubscribe", "/api/contacts/bulk-unsubscribe"],
  ] as const)("%s POSTs contactIds to %s and resolves the 202 acknowledgement", async (method, path) => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(202, { success: true, data: { message: "queued" } }));

    const result = await client.contacts[method]({ contactIds: ["c1", "c2"] });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe(`http://localhost${path}`);
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ contactIds: ["c1", "c2"] });
    expect(result.message).toBe("queued");
  });

  test("purge POSTs /purge with no body and resolves the id", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "c1" }));

    const result = await client.contacts.purge("c1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/contacts/c1/purge");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(result.id).toBe("c1");
  });

  describe("request options", () => {
    test("passing both body and form is refused before any request", async () => {
      const { client, fetchMock } = makeClient();
      const error = await rejection(
        client.request({ method: "POST", path: "/api/x", body: { a: 1 }, form: new FormData() }),
      );
      expect(error.errorCode).toBe("invalid_options");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
