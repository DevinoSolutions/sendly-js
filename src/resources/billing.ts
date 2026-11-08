import type { Sendly } from "../client";
import type { BillingStatusV1, PlanListV1 } from "../types";

/**
 * The project's plan and what it has used, on the versioned `/api/v1` surface.
 *
 * Read-only: changing a plan or opening a billing portal needs a person, not an
 * API key. Responses are bare v1 bodies and errors are RFC 9457 problem
 * documents. Needs the `billing:read` scope.
 */
export class BillingResource {
  constructor(private readonly client: Sendly) {}

  /**
   * The project's plan (`free` or `payg`), its Stripe subscription state and
   * renewal date, its spending limits and this month's usage. `pro` is always
   * null for an API key, which carries no person to hold a mobile entitlement.
   */
  async get(): Promise<BillingStatusV1> {
    return this.client.request<BillingStatusV1>({
      method: "GET",
      path: "/api/v1/billing",
    });
  }

  /** The plans on offer and their prices. */
  async listPlans(): Promise<PlanListV1> {
    return this.client.request<PlanListV1>({
      method: "GET",
      path: "/api/v1/billing/plans",
    });
  }
}
