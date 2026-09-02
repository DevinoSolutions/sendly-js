// Resolve where the OpenAPI spec is read from. Shared by sync-spec.mjs and
// check-spec-drift.mjs so the two can never disagree about the source.
//
// WHY PRODUCTION IS BANNED AS A SOURCE — this is the reason, not a superstition,
// and it is written down so nobody deletes the guardrail for lack of one:
//
//   Vendoring the spec from the deployed API makes the SDK mirror whatever is
//   RUNNING rather than what the repo DECLARES. Any drift between the platform's
//   code and its committed contract is then laundered into "correct" on the way
//   in — the SDK regenerates itself to match the deployment and the mismatch
//   disappears silently. That destroys the one job the vendored spec has: it is
//   the fixed reference `src/__tests__/contract.test.ts` compares against, so
//   an SDK synced from production can no longer detect the very drift it exists
//   to catch. It is also unreproducible (two maintainers on the same commit can
//   get different files) and unreviewable (the diff traces to no merged change).
//
// So there is deliberately NO default, and a script that silently picks *some*
// remote when unconfigured is the same class of bug — an unset
// SENDLY_OPENAPI_URL is an error naming exactly what to set, not a fallback.
//
// Production is NOT hard-blocked: "what does production actually serve?" is a
// legitimate one-off check. It is made LOUD instead (see productionWarning),
// because quiet is the property that made the old default dangerous, not the
// host itself.
//
// SENDLY_OPENAPI_URL accepts either form:
//   - a filesystem path (absolute or relative) to a committed spec  <- normal case
//   - an http(s):// URL of a local or staging API                   <- occasional
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SPEC_SOURCE_ENV = "SENDLY_OPENAPI_URL";

/** Host of the deployed production API. Never a legitimate unattended source. */
export const PRODUCTION_HOST = "api.sendly.now";

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
 * True when the source is the deployed production API.
 * @param {{ kind: "file" | "http", value: string }} source
 */
export function isProductionSource(source) {
  if (source.kind !== "http") return false;
  try {
    return new URL(source.value).hostname.toLowerCase() === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

/**
 * Shout — do not refuse — when the resolved source is production.
 *
 * A refusal would block the legitimate "verify what production actually serves"
 * one-off. What must not happen is this occurring QUIETLY, which is exactly how
 * the old default went unnoticed while running on every push, every PR and a
 * weekly cron. So it is unmissable in a scrolling log, and it annotates the run
 * when it happens inside GitHub Actions.
 *
 * @param {{ kind: "file" | "http", value: string, display: string }} source
 */
export function warnIfProduction(source) {
  if (!isProductionSource(source)) return false;

  const banner = [
    "!!!===========================================================================!!!",
    "!!!  WARNING: reading the OpenAPI spec from PRODUCTION                        !!!",
    `!!!  ${source.display}`,
    "!!!                                                                          !!!",
    "!!!  This is the BANNED path. Vendoring a spec from the deployed API makes    !!!",
    "!!!  the SDK mirror what is RUNNING instead of what the repo DECLARES, which  !!!",
    "!!!  launders code-vs-contract drift into 'correct' and destroys the SDK's    !!!",
    "!!!  ability to detect the very drift it exists to catch.                     !!!",
    "!!!                                                                          !!!",
    "!!!  Only ever do this as a DELIBERATE one-off (e.g. 'what does production    !!!",
    "!!!  actually serve right now?'). NEVER commit the result, and never wire     !!!",
    "!!!  this host into CI or any unattended job.                                 !!!",
    "!!!===========================================================================!!!",
  ].join("\n");
  console.error(banner);

  if (process.env.GITHUB_ACTIONS) {
    console.log(
      `::warning title=OpenAPI spec read from PRODUCTION::${source.display} is the deployed API. ` +
        `Syncing an SDK spec from production is banned — it launders code-vs-contract drift into "correct". ` +
        `An unattended job must never be pointed at this host.`,
    );
  }
  return true;
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
