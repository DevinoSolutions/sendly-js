import { describe, expect, test } from "vitest";
import type { TopicV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

function topic(id: string): TopicV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, key: id, name: `Topic ${id}`, archived: false } as unknown as TopicV1;
}

/**
 * One page of the topics list envelope.
 *
 * `helpers.cursorPage`, the same builder every other v1 list test uses. Through
 * 1.0 this file had its own, because topics answered the next page under
 * `cursor` where the rest of v1 answers `next_cursor`. A local fixture is how a
 * second dialect stays invisible, so this one is gone rather than updated.
 */
const topicPage = cursorPage<TopicV1>;

describe("topics resource (/api/v1)", () => {
  test("list GETs /api/v1/topics and resolves the bare page, envelope and all", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(topicPage([topic("top_1")], null));

    const page = await client.topics.list();

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/topics");
    expect(init.method).toBe("GET");
    // v1 does not wrap, so the page itself is returned — not its `data` array.
    expect(page.has_more).toBe(false);
    expect(page.data[0]?.id).toBe("top_1");
  });

  test("list serializes limit, after and include_archived", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(topicPage([], null));

    await client.topics.list({ limit: 10, after: "cur_top", include_archived: true });

    const { url } = getCall(fetchMock);
    expect(url).toContain("limit=10");
    expect(url).toContain("after=cur_top");
    expect(url).toContain("include_archived=true");
    // `cursor` was this endpoint's own parameter through 1.0 and is not one now.
    expect(url).not.toContain("cursor=");
  });

  test("create POSTs /api/v1/topics with the key and opt-in default", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "top_1", key: "product_news", default_opt_in: false }));

    const created = await client.topics.create({ key: "product_news", name: "Product news", default_opt_in: false });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/topics");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ key: "product_news", name: "Product news", default_opt_in: false });
    expect(created.id).toBe("top_1");
  });

  test("get and update build the right verb and path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "top_1", key: "product_news" }));

    await client.topics.get("top_1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/topics/top_1");
    expect(getCall(fetchMock).init.method).toBe("GET");

    fetchMock.mockClear();
    // Archiving is the retire path — there is no DELETE to test.
    await client.topics.update("top_1", { archived: true });
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/topics/top_1");
    expect(getCall(fetchMock).init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ archived: true });
  });

  test("setSubscription POSTs the contact to the topic's subscriptions sub-path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        topic_id: "top_1",
        contact_id: "con_1",
        status: "pending",
        confirmed_at: null,
        confirmation_url: "https://sendly.now/c/tok_1",
      }),
    );

    const subscription = await client.topics.setSubscription("top_1", { contact_id: "con_1", subscribed: true });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/topics/top_1/subscriptions");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ contact_id: "con_1", subscribed: true });
    // Asking to subscribe starts a double opt-in; it does not subscribe anyone.
    expect(subscription.status).toBe("pending");
    expect(subscription.confirmation_url).toBe("https://sendly.now/c/tok_1");
  });

  test("listAll walks every page and yields individual topics", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(topicPage([topic("top_1")], "cur_2"))
      .mockResolvedValueOnce(topicPage([topic("top_2"), topic("top_3")], null));

    const seen: string[] = [];
    for await (const item of client.topics.listAll()) seen.push(item.id);

    expect(seen).toEqual(["top_1", "top_2", "top_3"]);
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  test("listAll follows `after`, the one v1 pagination parameter", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(topicPage([topic("top_1")], "cur_2"))
      .mockResolvedValueOnce(topicPage([topic("top_2")], null));

    // Draining the generator is the point; the assertions are on the requests it made.
    const seen: string[] = [];
    for await (const item of client.topics.listAll({ limit: 1 })) seen.push(item.id);
    expect(seen).toEqual(["top_1", "top_2"]);

    const second = getCall(fetchMock, 1).url;
    expect(second).toContain("after=cur_2");
    expect(second).not.toContain("cursor=");
    expect(second).toContain("limit=1");
  });

  test("listAll stops when a page repeats the cursor it was handed", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(topicPage([topic("top_1")], "cur_stuck"));

    const seen: string[] = [];
    for await (const item of client.topics.listAll({ after: "cur_stuck" })) seen.push(item.id);

    expect(seen).toEqual(["top_1"]);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});
