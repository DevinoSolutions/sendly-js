import { AnalyticsResource } from "./resources/analytics";
import { CampaignsResource } from "./resources/campaigns";
import { ContactsResource } from "./resources/contacts";
import { DomainsResource } from "./resources/domains";
import { EmailsResource } from "./resources/emails";
import { EventsResource } from "./resources/events";
import { ListsResource } from "./resources/lists";
import { SegmentsResource } from "./resources/segments";
import { SuppressionResource } from "./resources/suppression";
import { TemplatesResource } from "./resources/templates";
import { UsageResource } from "./resources/usage";
import { VerifyResource } from "./resources/verify";
import { WebhooksResource } from "./resources/webhooks";
import { WorkflowsResource } from "./resources/workflows";
import { errorFromResponse, SendlyConnectionError, SendlyError } from "./errors";
import type { ErrorEnvelope } from "./types";

/** Build-time package version (kept in sync with package.json). */
export const SDK_VERSION = "0.3.0";

/** Default production API base. Override via `baseUrl` for staging or self-hosted deployments. */
export const DEFAULT_BASE_URL = "https://api.sendly.now";

export interface SendlyClientOptions {
  /** Project API key — `sk_*` for full access, `pk_*` for sending-only. */
  apiKey: string;
  /** Override API base URL (no trailing slash). Defaults to {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /** Inject a custom fetch (for SSR runtimes, mock testing, etc.). Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 30000 (30s). Set to 0 to disable. */
  timeout?: number;
  /** Extra headers merged into every request (e.g. tracing). */
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  /** Path relative to baseUrl, must start with `/`. */
  path: string;
  /** HTTP method. */
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Optional JSON body. Will be serialized + Content-Type set. */
  body?: unknown;
  /**
   * Query string params. Keys with `undefined`, `null`, or empty-string values are skipped.
   * Typed loosely so resource-level interface types (e.g. `ListEmailsQuery`) flow through.
   */
  query?: Record<string, unknown>;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** When true, do not attempt to parse the response body as JSON (used for 204 No Content). */
  noContent?: boolean;
}

/**
 * Sendly SDK entry point. Construct once with an API key and reuse the
 * resource accessors (`emails`, `contacts`, ...) for all calls.
 *
 * The client speaks two dialects against the same base URL. The legacy
 * `/api/*` resources return `{ success, data }` envelopes that the SDK
 * unwraps, and fail with `{ success: false, error: { message, code } }`. The
 * `/api/v1` resources (`campaigns`, `segments`, `workflows`, `analytics`,
 * `usage`, and the v1 methods on `events`) return the bare resource body and
 * fail with RFC 9457 problem documents. Both map onto the same
 * {@link SendlyError} subclasses, so error handling does not fork.
 */
export class Sendly {
  readonly emails: EmailsResource;
  readonly contacts: ContactsResource;
  readonly domains: DomainsResource;
  readonly templates: TemplatesResource;
  readonly webhooks: WebhooksResource;
  readonly suppression: SuppressionResource;
  readonly events: EventsResource;
  readonly verify: VerifyResource;
  readonly lists: ListsResource;

  /** Campaigns on the versioned `/api/v1` surface. */
  readonly campaigns: CampaignsResource;
  /** Segments on the versioned `/api/v1` surface. */
  readonly segments: SegmentsResource;
  /** Automation workflows on the versioned `/api/v1` surface. */
  readonly workflows: WorkflowsResource;
  /** Sending analytics on the versioned `/api/v1` surface. */
  readonly analytics: AnalyticsResource;
  /** Usage against enforced limits, on the versioned `/api/v1` surface. */
  readonly usage: UsageResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: SendlyClientOptions) {
    if (!options || !options.apiKey) {
      throw new SendlyError(0, "invalid_options", "Sendly: `apiKey` is required.");
    }

    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new SendlyError(
        0,
        "no_fetch",
        "Sendly: global `fetch` is not available. Pass `fetch` in options (Node <18 / non-fetch runtime).",
      );
    }
    this.timeout = options.timeout ?? 30_000;
    this.defaultHeaders = options.defaultHeaders ?? {};

    this.emails = new EmailsResource(this);
    this.contacts = new ContactsResource(this);
    this.domains = new DomainsResource(this);
    this.templates = new TemplatesResource(this);
    this.webhooks = new WebhooksResource(this);
    this.suppression = new SuppressionResource(this);
    this.events = new EventsResource(this);
    this.verify = new VerifyResource(this);
    this.lists = new ListsResource(this);

    this.campaigns = new CampaignsResource(this);
    this.segments = new SegmentsResource(this);
    this.workflows = new WorkflowsResource(this);
    this.analytics = new AnalyticsResource(this);
    this.usage = new UsageResource(this);
  }

  /**
   * Low-level request helper. Resources call this; consumers can call it
   * directly for endpoints not yet wrapped by a resource.
   *
   * Returns the parsed JSON body of a successful response verbatim. On the
   * legacy `/api/*` surface that is a `{ success: true, data: ... }` envelope
   * the caller unwraps via {@link unwrap}; on `/api/v1` it is already the bare
   * resource. Errors are thrown as {@link SendlyError} subclasses based on
   * status, in either dialect.
   */
  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": `sendly-node/${SDK_VERSION}`,
      ...this.defaultHeaders,
      ...options.headers,
    };

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const init: RequestInit = {
      method: options.method,
      headers,
      body,
    };

    if (this.timeout > 0) {
      init.signal = AbortSignal.timeout(this.timeout);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SendlyConnectionError(`Sendly request failed: ${message}`, error);
    }

    // 204 No Content (DELETE endpoints)
    if (response.status === 204 || options.noContent) {
      if (!response.ok) {
        await this.throwForError(response);
      }
      return undefined as T;
    }

    const contentType = response.headers?.get("content-type") ?? undefined;

    let parsed: unknown = undefined;
    const text = await response.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw errorFromResponse(
            response.status,
            "invalid_response",
            `Sendly returned non-JSON ${response.status}: ${text.slice(0, 200)}`,
            text,
          );
        }
        // eslint-disable-next-line sendly/no-unknown-cast-laundering -- non-JSON success response; caller expects T
        return text as unknown as T;
      }
    }

    if (!response.ok) {
      // Legacy envelope fields; on /api/v1 the body is an RFC 9457 problem
      // document instead and errorFromResponse overrides both from it.
      const envelope = parsed as Partial<ErrorEnvelope> | undefined;
      const errorMessage = envelope?.error?.message ?? `Sendly request failed with status ${response.status}`;
      const errorCode = envelope?.error?.code ?? `http_${response.status}`;
      throw errorFromResponse(response.status, errorCode, errorMessage, parsed, contentType);
    }

    return parsed as T;
  }

  /**
   * Resources receive the parsed envelope; they call this to unwrap the
   * `data` field when present, or pass through otherwise. Centralizing the
   * `{success, data}` -> `data` extraction here keeps resource code clean.
   */
  unwrap<T>(envelope: unknown): T {
    if (envelope && typeof envelope === "object" && "data" in envelope) {
      return (envelope as { data: T }).data;
    }
    return envelope as T;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    if (!path.startsWith("/")) {
      throw new SendlyError(0, "invalid_path", `Sendly: path must start with "/" (got "${path}").`);
    }
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const parameters = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            if (v === undefined || v === null || v === "") continue;
            parameters.append(key, String(v));
          }
        } else {
          parameters.append(key, String(value));
        }
      }
      const qs = parameters.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private async throwForError(response: Response): Promise<never> {
    let body: unknown;
    try {
      const text = await response.text();
      body = text ? JSON.parse(text) : undefined;
      // eslint-disable-next-line sendly/no-silent-catch -- best-effort JSON parse of an error body; a typed error is always thrown below regardless
    } catch {
      body = undefined;
    }
    const envelope = body as Partial<ErrorEnvelope> | undefined;
    const errorMessage = envelope?.error?.message ?? `Sendly request failed with status ${response.status}`;
    const errorCode = envelope?.error?.code ?? `http_${response.status}`;
    throw errorFromResponse(
      response.status,
      errorCode,
      errorMessage,
      body,
      response.headers?.get("content-type") ?? undefined,
    );
  }
}
