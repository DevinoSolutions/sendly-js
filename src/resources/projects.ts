import type { Sendly } from "../client";
import { paginateLegacyCursor } from "../pagination";
import type { ApiObject, LegacyCursorPage, ListAuditLogQuery, ProjectV1 } from "../types";

/**
 * The project the credential resolves to, on the versioned `/api/v1` surface.
 *
 * There is no `create` here. Creating a project resolves the owner from the
 * session user and refuses an API key with `401`, so it is recorded in the
 * contract suite's `NOT_SDK_CALLABLE` rather than shipped as a method that
 * cannot work.
 */
export class ProjectsResource {
  constructor(private readonly client: Sendly) {}

  /**
   * Read the current project.
   *
   * Takes no id: the project is whichever one the API key belongs to. Carries
   * `sandbox_address`, which is the address a test send arrives at — without it
   * a test send is undiscoverable, since the caller cannot say where to look.
   */
  async get(): Promise<ProjectV1> {
    return this.client.request<ProjectV1>({
      method: "GET",
      path: "/api/v1/projects",
    });
  }

  /*
   * The legacy `/api/projects` routes below take the project id explicitly and
   * check the caller's access to it, which an API key is only sometimes able to
   * pass: read the error before assuming it is a bug in the call.
   */

  /** Who changed what in this project, newest first. `action` is a prefix such as `contact.`. */
  async getAuditLog(query?: ListAuditLogQuery): Promise<LegacyCursorPage<ApiObject>> {
    const envelope = await this.client.request<{ success: true; data: LegacyCursorPage<ApiObject> }>({
      method: "GET",
      path: "/api/audit-log",
      query,
    });
    return this.client.unwrap(envelope);
  }

  /** Iterate the whole audit log across pages, one entry at a time. */
  async *listAllAuditLog(query?: ListAuditLogQuery): AsyncGenerator<ApiObject, void, undefined> {
    yield* paginateLegacyCursor<ApiObject>((cursor) => this.getAuditLog({ ...query, cursor }), query?.cursor);
  }

  /** A project's sending health and security status, including any suspension. */
  async getSecurity(id: string): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: `/api/projects/${encodeURIComponent(id)}/security`,
    });
    return this.client.unwrap(envelope);
  }

  /** Which onboarding steps a project has finished: a verified domain, a first email, contacts. */
  async getSetupState(id: string): Promise<ApiObject> {
    const envelope = await this.client.request<{ success: true; data: ApiObject }>({
      method: "GET",
      path: `/api/projects/${encodeURIComponent(id)}/setup-state`,
    });
    return this.client.unwrap(envelope);
  }
}
