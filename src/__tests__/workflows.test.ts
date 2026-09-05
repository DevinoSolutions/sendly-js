import { describe, expect, test } from "vitest";
import { SendlyConflictError } from "../index";
import type { ReplaceWorkflowGraphV1Request, WorkflowExecutionV1, WorkflowGraphV1, WorkflowV1 } from "../types";
import { cursorPage, getCall, getCallBody, jsonResponse, makeClient, problemResponse, rejection } from "./helpers";

function workflow(id: string): WorkflowV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, name: `Workflow ${id}`, enabled: false } as unknown as WorkflowV1;
}

function execution(id: string): WorkflowExecutionV1 {
  // eslint-disable-next-line sendly/no-unknown-cast-laundering -- minimal fixture; only the fields under assertion matter
  return { id, workflow_id: "wf_1", status: "RUNNING" } as unknown as WorkflowExecutionV1;
}

/** The graph's single entry node, in the shape a graph WRITE accepts. */
const TRIGGER_STEP: ReplaceWorkflowGraphV1Request["steps"][number] = {
  id: "st_1",
  name: "Signed up",
  position: { x: 0, y: 0 },
  type: "TRIGGER",
  config: { eventName: "signup" },
};

const GRAPH: WorkflowGraphV1 = {
  workflow_id: "wf_1",
  version: 7,
  steps: [{ ...TRIGGER_STEP, template_id: null }],
  transitions: [],
};

describe("workflows resource (/api/v1)", () => {
  test("create POSTs /api/v1/workflows and resolves the bare workflow", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "wf_1", name: "Welcome", enabled: false }));

    const created = await client.workflows.create({ name: "Welcome", event_name: "user.signup" });

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/workflows");
    expect(getCallBody(fetchMock)).toEqual({ name: "Welcome", event_name: "user.signup" });
    expect(created.id).toBe("wf_1");
  });

  test("get, update and delete build the right verb and path", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "wf_1", deleted: true }));

    await client.workflows.get("wf_1");
    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/workflows/wf_1");

    fetchMock.mockClear();
    await client.workflows.update("wf_1", { enabled: true });
    expect(getCall(fetchMock).init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ enabled: true });

    fetchMock.mockClear();
    const deleted = await client.workflows.delete("wf_1");
    expect(getCall(fetchMock).init.method).toBe("DELETE");
    expect(deleted).toEqual({ id: "wf_1", deleted: true });
  });

  test("listAll walks every page and yields individual workflows", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([workflow("wf_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([workflow("wf_2")], null));

    const seen: string[] = [];
    for await (const item of client.workflows.listAll()) seen.push(item.id);

    expect(seen).toEqual(["wf_1", "wf_2"]);
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
  });

  test("listExecutions passes the status filter through", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(cursorPage([execution("ex_1")], null));

    await client.workflows.listExecutions("wf_1", { status: "WAITING", limit: 25 });

    const { url, init } = getCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(url).toContain("http://localhost/api/v1/workflows/wf_1/executions");
    expect(url).toContain("status=WAITING");
    expect(url).toContain("limit=25");
  });

  test("listExecutionsAll keeps the status filter fixed across every page", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock
      .mockResolvedValueOnce(cursorPage([execution("ex_1")], "cur_2"))
      .mockResolvedValueOnce(cursorPage([execution("ex_2")], null));

    const seen: string[] = [];
    for await (const run of client.workflows.listExecutionsAll("wf_1", { status: "FAILED" })) seen.push(run.id);

    expect(seen).toEqual(["ex_1", "ex_2"]);
    expect(getCall(fetchMock, 0).url).toContain("status=FAILED");
    expect(getCall(fetchMock, 1).url).toContain("status=FAILED");
    expect(getCall(fetchMock, 1).url).toContain("after=cur_2");
  });

  test("startExecution POSTs to the workflow's executions collection", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "ex_1", workflow_id: "wf_1", status: "RUNNING" }));

    // `context` takes arbitrary JSON — scalars included, not only nested objects.
    const run = await client.workflows.startExecution("wf_1", {
      contact_id: "ct_1",
      context: { plan: "pro", seats: 3 },
    });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/workflows/wf_1/executions");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ contact_id: "ct_1", context: { plan: "pro", seats: 3 } });
    expect(run.id).toBe("ex_1");
  });

  test("cancelExecution addresses the run by id alone, not nested under the workflow", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "ex_1", status: "CANCELLED" }));

    await client.workflows.cancelExecution("ex_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/workflows/executions/ex_1/cancel");
    expect(init.method).toBe("POST");
  });

  test("stats forwards the optional from window", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { workflow_id: "wf_1", total: 0 }));

    await client.workflows.stats("wf_1", { from: "2026-08-01T00:00:00.000Z" });

    const { url } = getCall(fetchMock);
    expect(url).toContain("http://localhost/api/v1/workflows/wf_1/stats");
    expect(url).toContain("from=2026-08-01");
  });

  test("re-entering a contact the policy already covers surfaces the conflict code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(409, {
        type: "https://docs.sendly.now/errors/conflict",
        title: "Conflict",
        detail: "Contact already has an active execution and re-entry is disabled.",
        code: "conflict",
      }),
    );

    const error = await rejection<SendlyConflictError>(client.workflows.startExecution("wf_1", { contact_id: "ct_1" }));
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("conflict");
  });

  test("getGraph GETs the graph sub-path and resolves the bare graph, not an envelope", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, GRAPH));

    const graph = await client.workflows.getGraph("wf_1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/workflows/wf_1/graph");
    expect(init.method).toBe("GET");
    // A v1 body arrives bare: `version` sits at the top level, not under `data`.
    expect(graph.version).toBe(7);
    expect(graph.steps[0]?.type).toBe("TRIGGER");
  });

  test("replaceGraph issues a PUT — not a PATCH — to the same path, sending the whole document", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { ...GRAPH, version: 8 }));

    const graph = await client.workflows.replaceGraph("wf_1", { steps: [TRIGGER_STEP], transitions: [] });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/workflows/wf_1/graph");
    expect(init.method).toBe("PUT");
    expect(init.method).not.toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ steps: [TRIGGER_STEP], transitions: [] });
    expect(graph.version).toBe(8);
  });

  test("replaceGraph against a workflow with running executions surfaces the conflict code", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(
      problemResponse(409, {
        type: "https://docs.sendly.now/errors/conflict",
        title: "Conflict",
        detail: "Workflow has running executions.",
        code: "conflict",
      }),
    );

    const error = await rejection<SendlyConflictError>(
      client.workflows.replaceGraph("wf_1", { steps: [TRIGGER_STEP], transitions: [] }),
    );
    expect(error).toBeInstanceOf(SendlyConflictError);
    expect(error.errorCode).toBe("conflict");
  });

  test("clone POSTs the name to the clone sub-path and resolves the copy", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "wf_2", name: "Onboarding v2", enabled: false }));

    const copy = await client.workflows.clone("wf_1", { name: "Onboarding v2" });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/v1/workflows/wf_1/clone");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual({ name: "Onboarding v2" });
    expect(copy.id).toBe("wf_2");
    // A clone is always born disabled, however the original stood.
    expect(copy.enabled).toBe(false);
  });

  test("pause reports the runs it cancelled; resume reports zero", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { workflow: workflow("wf_1"), cancelled_executions: 23 }));

    const paused = await client.workflows.pause("wf_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/workflows/wf_1/pause");
    expect(getCall(fetchMock).init.method).toBe("POST");
    // This is what makes pause different from update({ enabled: false }).
    expect(paused.cancelled_executions).toBe(23);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(200, { workflow: workflow("wf_1"), cancelled_executions: 0 }));

    const resumed = await client.workflows.resume("wf_1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/workflows/wf_1/resume");
    expect(getCall(fetchMock).init.method).toBe("POST");
    expect(resumed.cancelled_executions).toBe(0);
  });

  test("the graph and lifecycle routes percent-encode the workflow id", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(jsonResponse(200, GRAPH));

    await client.workflows.getGraph("wf/../evil");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/v1/workflows/wf%2F..%2Fevil/graph");
  });
});
