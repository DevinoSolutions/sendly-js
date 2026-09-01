#!/usr/bin/env node
// Refresh ./openapi.json from the Sendly OpenAPI contract.
//
// The source is REQUIRED and comes from SENDLY_OPENAPI_URL — normally a path to
// the committed contract in the platform monorepo (apps/web/openapi/openapi.json).
// There is no default: syncing from the live production API is forbidden, so
// running this unconfigured fails with instructions rather than reaching for a
// remote of its own choosing. See scripts/spec-source.mjs.
//
// Zero-dependency: Node 20+ only. Run via `pnpm sync-spec`.
// The committed openapi.json is the contract the SDK is tested against
// (see src/__tests__/contract.test.ts) and the input to `pnpm build:types`;
// this script is the sync mechanism when the platform contract changes.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadSpec, resolveSpecSource } from "./spec-source.mjs";

const OUT_PATH = fileURLToPath(new URL("../openapi.json", import.meta.url));

let source;
try {
  source = resolveSpecSource();
} catch (error) {
  console.error(`sync-spec: ${error.message}`);
  process.exit(1);
}

let spec;
try {
  spec = await loadSpec(source);
} catch (error) {
  console.error(`sync-spec: ${error.message}`);
  process.exit(1);
}

// Pretty-printed (2-space) with a trailing newline for a stable, reviewable diff.
await writeFile(OUT_PATH, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
console.log(
  `sync-spec: wrote openapi.json (OpenAPI ${spec.openapi}, ${Object.keys(spec.paths).length} paths) from ${source.display}`,
);
