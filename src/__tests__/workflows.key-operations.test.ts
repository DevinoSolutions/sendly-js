import { describe, expect, test } from "vitest";
import { getCall, getCallBody, jsonResponse, makeClient } from "./helpers";

const envelope = (data: unknown, status = 200) => jsonResponse(status, { success: true, data });

describe("workflows: steps and transitions (legacy /api/workflows)", () => {
  test("listFields maps eventName onto the query", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ contact: [], event: [{ name: "plan" }] }));

    const fields = await client.workflows.listFields({ eventName: "purchase" });

    expect(getCall(fetchMock).url).toBe("http://localhost/api/workflows/fields?eventName=purchase");
    expect(fields.event).toEqual([{ name: "plan" }]);
  });

  test("addStep POSTs the step with autoConnect", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "st1" }, 201));
    const body = {
      type: "SEND_EMAIL",
      name: "Welcome",
      position: { x: 1, y: 2 },
      config: {},
      templateId: "t1",
      autoConnect: true,
    };

    const step = await client.workflows.addStep("w1", body);

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/workflows/w1/steps");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual(body);
    expect(step.id).toBe("st1");
  });

  test("updateStep PATCHes only what it is given, and null detaches the template", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "st1" }));

    await client.workflows.updateStep("w1", "st1", { name: "Renamed", templateId: null });

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/workflows/w1/steps/st1");
    expect(init.method).toBe("PATCH");
    expect(getCallBody(fetchMock)).toEqual({ name: "Renamed", templateId: null });
  });

  test("deleteStep adds ?splice=true only when asked to splice", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "st1" }));

    await client.workflows.deleteStep("w1", "st1");
    expect(getCall(fetchMock, 0).url).toBe("http://localhost/api/workflows/w1/steps/st1");
    expect(getCall(fetchMock, 0).init.method).toBe("DELETE");

    const result = await client.workflows.deleteStep("w1", "st1", { splice: true });
    expect(getCall(fetchMock, 1).url).toBe("http://localhost/api/workflows/w1/steps/st1?splice=true");
    expect(result.id).toBe("st1");
  });

  test("createTransition POSTs the condition branch and priority", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "tr1" }, 201));
    const body = { fromStepId: "st1", toStepId: "st2", condition: { branch: "yes" }, priority: 1 };

    await client.workflows.createTransition("w1", body);

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/workflows/w1/transitions");
    expect(init.method).toBe("POST");
    expect(getCallBody(fetchMock)).toEqual(body);
  });

  test("deleteTransition DELETEs by transition id and resolves it", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "tr1" }));

    const result = await client.workflows.deleteTransition("w1", "tr1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/workflows/w1/transitions/tr1");
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({ id: "tr1" });
  });
});

describe("workflows: conversion goals, executions and versions (legacy /api/workflows)", () => {
  test("conversion goals: list, create and delete", async () => {
    const { client, fetchMock } = makeClient();

    fetchMock.mockResolvedValueOnce(envelope([{ id: "g1" }]));
    expect(await client.workflows.listConversionGoals("w1")).toEqual([{ id: "g1" }]);
    expect(getCall(fetchMock, 0).url).toBe("http://localhost/api/workflows/w1/conversion-goals");
    expect(getCall(fetchMock, 0).init.method).toBe("GET");

    fetchMock.mockResolvedValueOnce(envelope({ id: "g2" }, 201));
    await client.workflows.createConversionGoal("w1", { name: "Bought", eventType: "purchase", windowDays: 30 });
    expect(getCall(fetchMock, 1).init.method).toBe("POST");
    expect(getCallBody(fetchMock, 1)).toEqual({ name: "Bought", eventType: "purchase", windowDays: 30 });

    fetchMock.mockResolvedValueOnce(envelope({ id: "g2" }));
    const removed = await client.workflows.deleteConversionGoal("w1", "g2");
    expect(getCall(fetchMock, 2).url).toBe("http://localhost/api/workflows/w1/conversion-goals/g2");
    expect(getCall(fetchMock, 2).init.method).toBe("DELETE");
    expect(removed.id).toBe("g2");
  });

  test("getExecution addresses the run under its workflow", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ id: "ex1", status: "COMPLETED", steps: [] }));

    const run = await client.workflows.getExecution("w1", "ex1");

    expect(getCall(fetchMock).url).toBe("http://localhost/api/workflows/w1/executions/ex1");
    expect(run.status).toBe("COMPLETED");
  });

  test("cancelAllExecutions POSTs cancel-all with no body", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValue(envelope({ cancelled: 5 }));

    const result = await client.workflows.cancelAllExecutions("w1");

    const { url, init } = getCall(fetchMock);
    expect(url).toBe("http://localhost/api/workflows/w1/executions/cancel-all");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(result.cancelled).toBe(5);
  });

  test("listVersions and revertVersion", async () => {
    const { client, fetchMock } = makeClient();
    fetchMock.mockResolvedValueOnce(envelope([{ version: 2 }, { version: 1 }]));
    expect(await client.workflows.listVersions("w1")).toEqual([{ version: 2 }, { version: 1 }]);
    expect(getCall(fetchMock, 0).url).toBe("http://localhost/api/workflows/w1/versions");

    fetchMock.mockResolvedValueOnce(envelope({ version: 1 }));
    const reverted = await client.workflows.revertVersion("w1", 1);
    expect(getCall(fetchMock, 1).url).toBe("http://localhost/api/workflows/w1/versions/1/revert");
    expect(getCall(fetchMock, 1).init.method).toBe("POST");
    expect(reverted.version).toBe(1);
  });
});
