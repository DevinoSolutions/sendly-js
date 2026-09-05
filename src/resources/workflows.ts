import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  CloneWorkflowV1Request,
  CreateWorkflowV1Request,
  ListWorkflowExecutionsV1Query,
  ListWorkflowsV1Query,
  ReplaceWorkflowGraphV1Request,
  StartWorkflowExecutionV1Request,
  UpdateWorkflowV1Request,
  WorkflowDeletedV1,
  WorkflowExecutionListV1,
  WorkflowExecutionV1,
  WorkflowGraphV1,
  WorkflowListV1,
  WorkflowStateChangeV1,
  WorkflowStatsV1,
  WorkflowStatsV1Query,
  WorkflowV1,
} from "../types";

/**
 * Automation workflows on the `/api/v1` surface, plus the per-contact
 * executions they produce.
 *
 * Responses are bare v1 bodies (no `{ success, data }` envelope) and errors are
 * RFC 9457 problem documents.
 */
export class WorkflowsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * List workflows.
   *
   * Cursor-paginated on `limit` + `after`, with no total count. Keep the filter
   * and sort arguments identical for the whole walk — changing them
   * mid-pagination returns `422 validation_error` asking you to restart.
   */
  async list(query?: ListWorkflowsV1Query): Promise<WorkflowListV1> {
    return this.client.request<WorkflowListV1>({
      method: "GET",
      path: "/api/v1/workflows",
      query,
    });
  }

  /** Iterate every workflow across pages, yielding one workflow at a time. */
  async *listAll(query?: ListWorkflowsV1Query): AsyncGenerator<WorkflowV1, void, undefined> {
    yield* paginateCursor<WorkflowV1>((after) => this.list({ ...query, after }), query?.after);
  }

  /** Create a workflow. */
  async create(body: CreateWorkflowV1Request): Promise<WorkflowV1> {
    return this.client.request<WorkflowV1>({
      method: "POST",
      path: "/api/v1/workflows",
      body,
    });
  }

  /** Retrieve a single workflow. */
  async get(id: string): Promise<WorkflowV1> {
    return this.client.request<WorkflowV1>({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}`,
    });
  }

  /** Patch a workflow. Only the fields you send are changed. */
  async update(id: string, body: UpdateWorkflowV1Request): Promise<WorkflowV1> {
    return this.client.request<WorkflowV1>({
      method: "PATCH",
      path: `/api/v1/workflows/${encodeURIComponent(id)}`,
      body,
    });
  }

  /** Delete a workflow. Resolves `{ id, deleted }`. */
  async delete(id: string): Promise<WorkflowDeletedV1> {
    return this.client.request<WorkflowDeletedV1>({
      method: "DELETE",
      path: `/api/v1/workflows/${encodeURIComponent(id)}`,
    });
  }

  /**
   * List a workflow's executions — one row per contact-run, newest first.
   * Cursor-paginated; filter by `status` to find stuck (`WAITING`) or failed
   * runs. Hold `status` fixed across the walk, as with every v1 cursor list.
   */
  async listExecutions(id: string, query?: ListWorkflowExecutionsV1Query): Promise<WorkflowExecutionListV1> {
    return this.client.request<WorkflowExecutionListV1>({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/executions`,
      query,
    });
  }

  /** Iterate every execution of a workflow across pages, one run at a time. */
  async *listExecutionsAll(
    id: string,
    query?: ListWorkflowExecutionsV1Query,
  ): AsyncGenerator<WorkflowExecutionV1, void, undefined> {
    yield* paginateCursor<WorkflowExecutionV1>((after) => this.listExecutions(id, { ...query, after }), query?.after);
  }

  /**
   * Enter one contact into an enabled workflow. Step processing is
   * asynchronous, so a successful call means the run was claimed — not that it
   * finished. A workflow whose re-entry policy already covers this contact
   * answers `409 conflict`.
   */
  async startExecution(id: string, body: StartWorkflowExecutionV1Request): Promise<WorkflowExecutionV1> {
    return this.client.request<WorkflowExecutionV1>({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/executions`,
      body,
    });
  }

  /**
   * Cancel a single in-flight execution.
   *
   * Addressed by execution id alone — this route is *not* nested under the
   * workflow, so no workflow id is needed.
   */
  async cancelExecution(executionId: string): Promise<WorkflowExecutionV1> {
    return this.client.request<WorkflowExecutionV1>({
      method: "POST",
      path: `/api/v1/workflows/executions/${encodeURIComponent(executionId)}/cancel`,
    });
  }

  /**
   * Execution counts by status, completion rate, average duration, emails sent
   * and per-goal conversions for one workflow. All-time unless you pass
   * `{ from }`; there is no 90-day ceiling here, unlike `analytics.*`.
   */
  async stats(id: string, query?: WorkflowStatsV1Query): Promise<WorkflowStatsV1> {
    return this.client.request<WorkflowStatsV1>({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/stats`,
      query,
    });
  }

  /**
   * Every step in the workflow — including its `TRIGGER` entry node — plus the
   * directed transitions between them.
   *
   * A step's `config` comes back exactly as stored, camelCase keys and all,
   * rather than projected into the snake_case used elsewhere on v1: the same
   * document is authored by the visual editor, and renaming its keys on the way
   * out would silently drop any key this API does not know on the way back in.
   *
   * `version` is the workflow's version at the time of the read, so a different
   * number on a later read means somebody edited the graph in between. This
   * body is accepted verbatim by {@link replaceGraph} — read, edit one step,
   * send it back.
   */
  async getGraph(id: string): Promise<WorkflowGraphV1> {
    return this.client.request<WorkflowGraphV1>({
      method: "GET",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/graph`,
    });
  }

  /**
   * Replace the whole graph in one transaction.
   *
   * A `PUT` and not a `PATCH`, and that is the point: a graph is nodes *plus*
   * the edges between them, so a partial edit to a step list has no meaning
   * without the transitions that reference it — half-applied, it would leave
   * steps pointing at steps that no longer exist.
   *
   * Ids decide the outcome per step: one you send is kept and updated in place,
   * a fresh uuid creates a step, and an id you omit deletes that step *and its
   * run history*. Exactly one step must be a `TRIGGER`, every transition must
   * name steps in the same document, and no step may point at itself.
   *
   * Refused with `409 conflict` while the workflow has running executions —
   * those runs are standing on the steps being replaced. {@link pause} first.
   */
  async replaceGraph(id: string, body: ReplaceWorkflowGraphV1Request): Promise<WorkflowGraphV1> {
    return this.client.request<WorkflowGraphV1>({
      method: "PUT",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/graph`,
      body,
    });
  }

  /**
   * Copy a workflow and its whole graph as a new workflow.
   *
   * The copy is always created disabled, whatever the original was: a clone
   * exists to be reviewed, and one that started live would match the same
   * trigger events as its original from the moment it appeared. Pass `{ name }`
   * to name it; it otherwise becomes `Copy of <original name>`.
   */
  async clone(id: string, body: CloneWorkflowV1Request): Promise<WorkflowV1> {
    return this.client.request<WorkflowV1>({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/clone`,
      body,
    });
  }

  /**
   * Disable the workflow *and cancel every `RUNNING`/`WAITING` execution in it*,
   * resolving `{ workflow, cancelled_executions }`.
   *
   * That is what separates this from `update(id, { enabled: false })`, which
   * only stops new runs starting and leaves every in-flight contact walking the
   * graph — the next delay still expires, the next email still sends.
   *
   * The cancellation is terminal: {@link resume} re-opens the workflow to new
   * runs, it does not put the cancelled contacts back where they were.
   */
  async pause(id: string): Promise<WorkflowStateChangeV1> {
    return this.client.request<WorkflowStateChangeV1>({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/pause`,
    });
  }

  /**
   * Re-enable the workflow so its trigger matches again. `cancelled_executions`
   * is always 0 here — resuming starts nothing and stops nothing.
   *
   * Refused with `422 validation_error` while any step is still unconfigured,
   * the same rule `update(id, { enabled: true })` enforces: an enabled workflow
   * accepts contacts immediately and would otherwise fail only once one reached
   * the broken step.
   */
  async resume(id: string): Promise<WorkflowStateChangeV1> {
    return this.client.request<WorkflowStateChangeV1>({
      method: "POST",
      path: `/api/v1/workflows/${encodeURIComponent(id)}/resume`,
    });
  }
}
