import { describe, expect, test } from "vitest";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

const envelope = (data: unknown, status = 200) => jsonResponse(status, { success: true, data });

describe("segments: static membership and recomputation (legacy /api/segments)", () => {
  test("addMembers POSTs the addresses and the createMissing flags", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ added: 2 }));

    const result = await client.segments.addMembers("s1", {
      emails: ["a@example.com", "b@example.com"],
      createMissing: true,
      subscribed: false,
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/segments/s1/members");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({
      emails: ["a@example.com", "b@example.com"],
      createMissing: true,
      subscribed: false,
    });
    expect(result).toEqual({ added: 2 });
  });

  test("removeMembers sends its body on a DELETE", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ removed: 1 }));

    await client.segments.removeMembers("s1", { emails: ["a@example.com"] });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/segments/s1/members");
    expect(init.method).toBe("DELETE");
    expect(getCallBody(fetchMock)).toEqual({ emails: ["a@example.com"] });
  });

  test("compute POSTs with no body and resolves the queued acknowledgement", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ status: "queued" }, 202));

    const result = await client.segments.compute("s1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/segments/s1/compute");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(result.status).toBe("queued");
  });

  test("refresh resolves the new member count", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ memberCount: 321 }));

    const result = await client.segments.refresh("s1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/segments/s1/refresh");
    expect(result.memberCount).toBe(321);
  });
});
