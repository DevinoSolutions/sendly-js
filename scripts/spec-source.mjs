// Resolve where the OpenAPI spec is read from. Shared by sync-spec.mjs and
// check-spec-drift.mjs so the two can never disagree about the source.
//
// There is deliberately NO default. Syncing the vendored spec from the live
// production API is forbidden by platform policy (see "Refreshing openapi.json"
// in README.md), and a script that silently picks *some* remote when
// unconfigured is the same class of bug — so an unset SENDLY_OPENAPI_URL is an
// error with a message naming exactly what to set, not a fallback.
//
// SENDLY_OPENAPI_URL accepts either form:
//   - a filesystem path (absolute or relative) to a committed spec  <- normal case
//   - an http(s):// URL of a local or staging API                   <- occasional
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SPEC_SOURCE_ENV = "SENDLY_OPENAPI_URL";

/** Canonical location of the contract inside the Sendly platform monorepo. */
export const MONOREPO_SPEC_PATH = "apps/web/openapi/openapi.json";

/**
 * The message shown when no source is configured. Kept as one exported string
 * so `sync-spec` and `check-spec-drift` report the missing configuration
 * identically, and so it stays in step with sendly-python's sync_spec.py.
 */
export const UNCONFIGURED_MESSAGE = [
  `${SPEC_SOURCE_ENV} is not set, and there is no default.`,
  "",
  "Point it at the committed contract in the Sendly platform monorepo:",
  `  ${SPEC_SOURCE_ENV}=/path/to/sendly/${MONOREPO_SPEC_PATH} pnpm sync-spec`,
  "",
  "An http(s):// URL of a local or staging API works too. Do NOT point it at",
  "production (https://api.sendly.now): the SDK spec is synced from the committed",
  "contract, never live-synced from the deployed API.",
].join("\n");

/**
 * Describe the configured spec source without reading it.
 * @returns {{ kind: "file" | "http", value: string, display: string }}
 * @throws {Error} when SENDLY_OPENAPI_URL is unset or empty.
 */
export function resolveSpecSource() {
  const raw = process.env[SPEC_SOURCE_ENV]?.trim();
  if (!raw) throw new Error(UNCONFIGURED_MESSAGE);

  if (/^https?:\/\//i.test(raw)) return { kind: "http", value: raw, display: raw };

  // Everything else is a path on disk. A file:// URL is accepted because it is
  // what a shell tab-completion or a URL-shaped habit tends to produce; Node's
  // fetch() rejects that scheme outright, which is why this cannot simply be
  // handed to fetch.
  const path = /^file:\/\//i.test(raw) ? fileURLToPath(raw) : raw;
  return { kind: "file", value: path, display: path };
}

/**
 * Read and parse the OpenAPI document from the configured source.
 * @param {{ kind: "file" | "http", value: string, display: string }} source
 * @returns {Promise<Record<string, unknown>>}
 * @throws {Error} on any read/fetch/parse failure, or if the document is not OpenAPI.
 */
export async function loadSpec(source) {
  let text;
  if (source.kind === "file") {
    try {
      text = await readFile(source.value, "utf8");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`could not read ${source.display}: ${reason}`);
    }
  } else {
    const response = await fetch(source.value, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`fetch failed with HTTP ${response.status} ${response.statusText} for ${source.display}`);
    }
    text = await response.text();
  }

  let spec;
  try {
    spec = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${source.display} did not contain valid JSON: ${reason}`);
  }
  if (!spec || typeof spec !== "object" || spec.openapi == null || spec.paths == null) {
    throw new Error(`${source.display} is not a valid OpenAPI document`);
  }
  return spec;
}
