import { execFileSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { installPackedSdk, removeFixture } from "./fixture";

const repoRoot = resolve(__dirname, "..");

/** Every compiler the repo can resolve: the pinned one, an older major and the newest major. */
const compilers = [
  { name: "typescript 6.0.3 (repo pin)", bin: "typescript/bin/tsc" },
  { name: "typescript 5.9.3", bin: "typescript-5/bin/tsc" },
  { name: "typescript 7.0.2 (latest)", bin: "typescript-7/bin/tsc" },
];

/** What an edge consumer compiles with. No `types: ["node"]`: a Worker or Edge project has no Node typings. */
const configs = [
  {
    name: "moduleResolution bundler",
    compilerOptions: { module: "ESNext", moduleResolution: "Bundler" },
    file: "consumer.ts",
  },
  {
    name: "module nodenext (ESM)",
    compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
    file: "consumer.mts",
  },
  {
    name: "module nodenext (CJS)",
    compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
    file: "consumer.cts",
  },
];

let fixtureDir = "";

function typecheck(compilerBin: string, config: (typeof configs)[number], withNodeTypes: boolean): string {
  const tsconfig = join(fixtureDir, `tsconfig.${config.file}.json`);
  writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        ...config.compilerOptions,
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: false,
        noEmit: true,
        types: withNodeTypes ? ["node"] : [],
        typeRoots: [join(repoRoot, "node_modules", "@types")],
      },
      files: [config.file],
    }),
  );
  try {
    execFileSync(process.execPath, [join(repoRoot, "node_modules", compilerBin), "-p", tsconfig], {
      cwd: fixtureDir,
      stdio: "pipe",
    });
    return "";
  } catch (error) {
    const failure = error as { stdout?: Buffer };
    return String(failure.stdout ?? error);
  }
}

beforeAll(() => {
  fixtureDir = installPackedSdk();
  for (const config of configs) copyFileSync(join(__dirname, "types", "consumer.ts"), join(fixtureDir, config.file));
}, 120_000);

afterAll(() => removeFixture(fixtureDir));

describe("the shipped .d.ts under strict, skipLibCheck: false", () => {
  for (const compiler of compilers) {
    for (const config of configs) {
      test(`${compiler.name}, ${config.name}, with @types/node`, () => {
        expect(typecheck(compiler.bin, config, true)).toBe("");
      });
    }
  }

  // KNOWN GAP (T-7169): the webhook helpers are typed `string | Buffer`, so the .d.ts names a
  // Node global. A Workers or Edge project without @types/node cannot compile with
  // skipLibCheck: false. When `Buffer` leaves the public types this goes red: drop it.
  test("KNOWN GAP: without @types/node the declarations name Buffer", () => {
    const output = typecheck(compilers[0]!.bin, configs[0]!, false);

    expect(output).toMatch(/Cannot find name 'Buffer'/);
  });
});
