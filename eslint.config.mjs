// Standalone ESLint flat config for the mirrored SDK.
//
// In the Sendly platform monorepo this package extends @sendly/eslint-config,
// which layers in workspace-only plugins (eslint-plugin-unicorn as warnings,
// the custom @sendly/eslint-plugin-sendly rules, and an oxlint dedupe pass)
// that do not exist outside the monorepo. This file reproduces only the parts
// that actually gate the SDK source: the typescript-eslint recommended set,
// no-explicit-any promoted to an error, and the three type-aware "no fake
// success" promise rules the monorepo applies to library/server src.
//
// The copied source carries inline `eslint-disable`s for two custom rules from
// @sendly/eslint-plugin-sendly: `sendly/no-unknown-cast-laundering` and
// `sendly/no-silent-catch`. That plugin is monorepo-only, and ESLint errors
// ("Definition for rule ... was not found") on a disable directive whose rule
// it cannot resolve — reportUnusedDisableDirectives does NOT suppress that. To
// keep the mirrored source byte-for-byte unedited (future re-mirrors overwrite
// it) while still linting clean, we register a minimal no-op `sendly` plugin
// that provides those two rule names. The rules never report; with
// reportUnusedDisableDirectives OFF the now-resolvable directives are inert —
// neither errors nor warnings. This is the simplest configuration under which
// the copied source reports zero problems without touching src.
import tseslint from "typescript-eslint";

// No-op stand-ins for the monorepo-only @sendly/eslint-plugin-sendly rules that
// the mirrored source disables inline. Presence (not behavior) is all ESLint
// needs to resolve those disable directives.
const noop = { create: () => ({}) };
const sendlyStub = {
  rules: {
    "no-unknown-cast-laundering": noop,
    "no-silent-catch": noop,
  },
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", "src/types.generated.ts"],
  },
  {
    plugins: { sendly: sendlyStub },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Type-aware slice — the SDK is library code throughout, so all of src
    // (excluding tests) gets the unawaited-/misused-promise guards. Mirrors the
    // server/library block in @sendly/eslint-config.
    files: ["src/**/*.ts"],
    ignores: ["src/__tests__/**"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
];
