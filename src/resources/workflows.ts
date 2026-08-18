import type { Sendly } from "../client";
import { paginateCursor } from "../pagination";
import type {
  CreateWorkflowV1Request,
  ListWorkflowExecutionsV1Query,
  ListWorkflowsV1Query,
  StartWorkflowExecutionV1Request,
  UpdateWorkflowV1Request,
  WorkflowDeletedV1,
  WorkflowExecutionListV1,
  WorkflowExecutionV1,
  WorkflowListV1,
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
}
