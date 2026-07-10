#!/usr/bin/env node
// Non-blocking drift check: compare the committed ./openapi.json to the live
// public spec and emit a GitHub Actions warning annotation if they differ.
//
// Never fails — a moved production API must not block external contributors.
// CI runs this with continue-on-error; run it locally with
// `pnpm check-spec-drift`. Zero-dependency, Node 20+ global fetch.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SPEC_URL = process.env.SENDLY_OPENAPI_URL ?? "https://api.sendly.now/api/openapi.json";
const COMMITTED_PATH = fileURLToPath(new URL("../openapi.json", import.meta.url));

function warn(message) {
  // GitHub Actions annotation syntax; renders as plain text elsewhere.
  console.log(`::warning title=OpenAPI spec drift::${message}`);
}

function operationSet(spec) {
  const ops = new Set();
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(methods)) ops.add(`${method.toUpperCase()} ${path}`);
  }
  return ops;
}

async function main() {
  const committed = JSON.parse(await readFile(COMMITTED_PATH, "utf8"));

  let live;
  try {
    const response = await fetch(SPEC_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      warn(`could not fetch live spec (HTTP ${response.status}); skipping drift check`);
      return;
    }
    live = await response.json();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(`could not reach ${SPEC_URL} (${reason}); skipping drift check`);
    return;
  }

  // Re-serialize both (compact) so formatting/line-endings never register as drift.
  if (JSON.stringify(committed) === JSON.stringify(live)) {
    console.log(`spec drift check: committed openapi.json matches ${SPEC_URL}`);
    return;
  }

  const committedOps = operationSet(committed);
  const liveOps = operationSet(live);
  const onlyLiveOps = [...liveOps].filter((op) => !committedOps.has(op)).sort();
  const onlyCommittedOps = [...committedOps].filter((op) => !liveOps.has(op)).sort();

  const committedSchemas = new Set(Object.keys(committed.components?.schemas ?? {}));
  const liveSchemas = new Set(Object.keys(live.components?.schemas ?? {}));
  const onlyLiveSchemas = [...liveSchemas].filter((name) => !committedSchemas.has(name)).sort();
  const onlyCommittedSchemas = [...committedSchemas].filter((name) => !liveSchemas.has(name)).sort();

  const parts = [`committed openapi.json differs from ${SPEC_URL} — run \`pnpm sync-spec\` to refresh.`];
  if (onlyLiveOps.length) parts.push(`operations only live: ${onlyLiveOps.join(", ")}`);
  if (onlyCommittedOps.length) parts.push(`operations only committed: ${onlyCommittedOps.join(", ")}`);
  if (onlyLiveSchemas.length) parts.push(`schemas only live: ${onlyLiveSchemas.join(", ")}`);
  if (onlyCommittedSchemas.length) parts.push(`schemas only committed: ${onlyCommittedSchemas.join(", ")}`);
  if (!onlyLiveOps.length && !onlyCommittedOps.length && !onlyLiveSchemas.length && !onlyCommittedSchemas.length) {
    parts.push("field-level changes only (same operations and schemas).");
  }

  warn(parts.join(" | "));
}

try {
  await main();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  warn(`drift check errored (${reason})`);
}
