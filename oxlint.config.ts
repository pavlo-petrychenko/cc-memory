import { defineConfig } from "oxlint";

/**
 * Lint gate. Two halves:
 *
 *  1. oxlint's own categories — correctness/suspicious/perf are errors; nothing here
 *     is advisory, a red lint run means the change is not done.
 *  2. the vendored anti-slop plugin (tools/oxlint/anti-slop) — 15 rules that reject
 *     low-evidence TypeScript: `unknown` crossing a signature, `Record<string,
 *     unknown>` bags, runtime `typeof` instead of parsing at the boundary, chained
 *     assertions, module mocking. They are what keeps the parse-at-the-boundary
 *     discipline honest; see CLAUDE.md.
 *
 * oxlint is syntactic only — `tsc --noEmit` remains the type gate.
 */
export default defineConfig({
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
  },
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",

    // Readability rules the reviewer asked for explicitly (see CLAUDE.md § Readability).
    "no-extraneous-class": ["error", { allowWithDecorator: true }],
    "no-nested-ternary": "error",
    "no-else-return": "error",
    "max-depth": ["error", 4],
  },
  ignorePatterns: ["dist/**", "node_modules/**", "tools/oxlint/anti-slop/**"],
});
