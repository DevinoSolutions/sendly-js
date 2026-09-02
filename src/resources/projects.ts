import type { Sendly } from "../client";
import type { ProjectV1 } from "../types";

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
}
