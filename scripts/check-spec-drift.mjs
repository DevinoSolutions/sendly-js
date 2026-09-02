#!/usr/bin/env node
// Non-blocking drift check: compare the committed ./openapi.json to the Sendly
// OpenAPI contract and emit a GitHub Actions warning annotation if they differ.
//
// Never fails — a moved contract must not block external contributors.
//
// The source is SENDLY_OPENAPI_URL, with no default (see scripts/spec-source.mjs).
// Unlike `sync-spec`, an unconfigured run SKIPS with a notice instead of failing:
// this runs unattended in CI on every pull request, including from forks that
// cannot supply a source, and turning that into a red step would report a
// configuration gap as if it were spec drift.
//
// Run it locally with:
//   SENDLY_OPENAPI_URL=/path/to/sendly/apps/web/openapi/openapi.json pnpm check-spec-drift
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SPEC_SOURCE_ENV, loadSpec, resolveSpecSource, warnIfProduction } from "./spec-source.mjs";

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
  let source;
  try {
    source = resolveSpecSource();
  } catch {
    console.log(
      `spec drift check: skipped — ${SPEC_SOURCE_ENV} is not set. ` +
        `Set it to the committed contract (apps/web/openapi/openapi.json in the platform monorepo) to compare.`,
    );
    return;
  }

  // This one matters most: it is the step that runs unattended in CI, so a
  // production source here is precisely the thing that must never be quiet.
  warnIfProduction(source);

  const committed = JSON.parse(await readFile(COMMITTED_PATH, "utf8"));

  let reference;
  try {
    reference = await loadSpec(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(`could not read ${source.display} (${reason}); skipping drift check`);
    return;
  }

  // Re-serialize both (compact) so formatting/line-endings never register as drift.
  if (JSON.stringify(committed) === JSON.stringify(reference)) {
    console.log(`spec drift check: committed openapi.json matches ${source.display}`);
    return;
  }

  const committedOps = operationSet(committed);
  const referenceOps = operationSet(reference);
  const onlyReferenceOps = [...referenceOps].filter((op) => !committedOps.has(op)).sort();
  const onlyCommittedOps = [...committedOps].filter((op) => !referenceOps.has(op)).sort();

  const committedSchemas = new Set(Object.keys(committed.components?.schemas ?? {}));
  const referenceSchemas = new Set(Object.keys(reference.components?.schemas ?? {}));
  const onlyReferenceSchemas = [...referenceSchemas].filter((name) => !committedSchemas.has(name)).sort();
  const onlyCommittedSchemas = [...committedSchemas].filter((name) => !referenceSchemas.has(name)).sort();

  const parts = [`committed openapi.json differs from ${source.display} — run \`pnpm sync-spec\` to refresh.`];
  if (onlyReferenceOps.length) parts.push(`operations only in source: ${onlyReferenceOps.join(", ")}`);
  if (onlyCommittedOps.length) parts.push(`operations only committed: ${onlyCommittedOps.join(", ")}`);
  if (onlyReferenceSchemas.length) parts.push(`schemas only in source: ${onlyReferenceSchemas.join(", ")}`);
  if (onlyCommittedSchemas.length) parts.push(`schemas only committed: ${onlyCommittedSchemas.join(", ")}`);
  if (
    !onlyReferenceOps.length &&
    !onlyCommittedOps.length &&
    !onlyReferenceSchemas.length &&
    !onlyCommittedSchemas.length
  ) {
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
