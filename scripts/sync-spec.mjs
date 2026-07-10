#!/usr/bin/env node
// Refresh ./openapi.json from Sendly's live public OpenAPI spec.
//
// Zero-dependency: uses Node 20+ global fetch. Run via `pnpm sync-spec`.
// The committed openapi.json is the contract the SDK is tested against
// (see src/__tests__/contract.test.ts) and the input to `pnpm build:types`;
// this script is the sync mechanism when the platform API changes.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SPEC_URL = process.env.SENDLY_OPENAPI_URL ?? "https://api.sendly.now/api/openapi.json";
const OUT_PATH = fileURLToPath(new URL("../openapi.json", import.meta.url));

const response = await fetch(SPEC_URL, { headers: { Accept: "application/json" } });
if (!response.ok) {
  console.error(`sync-spec: fetch failed with HTTP ${response.status} ${response.statusText} for ${SPEC_URL}`);
  process.exit(1);
}

const spec = await response.json();
if (!spec || typeof spec !== "object" || spec.openapi == null || spec.paths == null) {
  console.error(`sync-spec: ${SPEC_URL} did not return a valid OpenAPI document`);
  process.exit(1);
}

// Pretty-printed (2-space) with a trailing newline for a stable, reviewable diff.
await writeFile(OUT_PATH, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
console.log(
  `sync-spec: wrote openapi.json (OpenAPI ${spec.openapi}, ${Object.keys(spec.paths).length} paths) from ${SPEC_URL}`,
);
