import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import type { BuildOptions } from "esbuild";

const repoRoot = resolve(__dirname, "..");

/**
 * Install the BUILT package the way a consumer receives it: `pnpm pack`, then unpack
 * into `<dir>/node_modules/sendly-sdk`. Every runtime test imports `sendly-sdk` from
 * there, so the `exports` map, `dist/` and the shipped `.d.ts` are what is under test,
 * never `src/`.
 */
export function installPackedSdk(): string {
  if (!existsSync(join(repoRoot, "dist", "index.js"))) {
    throw new Error("dist/ is missing: run `pnpm build` before the edge-runtime tests.");
  }
  const dir = mkdtempSync(join(tmpdir(), "sendly-edge-"));
  execSync(`pnpm pack --pack-destination "${dir}"`, { cwd: repoRoot, stdio: "pipe" });
  const tarball = readdirSync(dir).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack produced no tarball.");
  // Relative paths: a Windows drive letter in -C confuses the tar that ships with Git Bash.
  mkdirSync(join(dir, "node_modules", "sendly-sdk"), { recursive: true });
  execFileSync("tar", ["xzf", tarball, "-C", "node_modules/sendly-sdk", "--strip-components=1"], {
    cwd: dir,
    stdio: "pipe",
  });
  return dir;
}

export function removeFixture(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Bundle consumer source that imports `sendly-sdk` from the packed fixture. */
export async function bundleConsumer(fixtureDir: string, source: string, options: BuildOptions): Promise<string> {
  const result = await build({
    stdin: { contents: source, resolveDir: fixtureDir, loader: "ts" },
    bundle: true,
    write: false,
    logLevel: "silent",
    absWorkingDir: fixtureDir,
    ...options,
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error("esbuild produced no output.");
  return output.text;
}

/** A consumer that sends one email and reports what the SDK saw. Runs unchanged on every runtime. */
export const SEND_CONSUMER = `
import { Sendly, SendlyAuthenticationError } from "sendly-sdk";

export async function run() {
  const sendly = new Sendly({ apiKey: "sk_test_edge_runtime" });
  const receipt = await sendly.emails.send(
    { to: "test+edge@example.com", subject: "edge", body: "<p>edge</p>" },
    { idempotencyKey: "edge-key-1" },
  );
  let rejected = "";
  try {
    await new Sendly({ apiKey: "sk_test_bad" }).emails.send({ to: "test+edge@example.com", subject: "x", body: "x" });
  } catch (error) {
    rejected = error instanceof SendlyAuthenticationError ? "SendlyAuthenticationError" : String(error);
  }
  return { receipt, rejected };
}
`;

/** Canned API: a 202 receipt for the good key and an RFC 9457 401 for the bad one. */
export function cannedApiResponse(authorization: string | null): { status: number; body: unknown; type: string } {
  if (authorization === "Bearer sk_test_edge_runtime") {
    return {
      status: 202,
      body: { id: "em_edge_1", status: "PENDING", to: "test+edge@example.com" },
      type: "application/json",
    };
  }
  return {
    status: 401,
    body: { type: "about:blank", title: "Unauthorized", status: 401, detail: "bad key" },
    type: "application/problem+json",
  };
}
