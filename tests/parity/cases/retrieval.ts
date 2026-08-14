import { loadPromptCorpus } from "../../fixtures/prompts.ts";
/**
 * Retrieval replay case table (C7): each prompt in the corpus
 * (tests/fixtures/prompts.ts) run through memory-inject.py's auto-retrieval
 * against the primary fixture workspace, comparing the injected context.
 * Real-vault sampling only widens the corpus (PARITY_REAL_VAULT=1); it never
 * changes which vault the replay runs against — always this synthetic one.
 */
import type { FixtureVault, FixtureWorkspace } from "../../fixtures/vault.ts";
import type { HookCase } from "../harness.ts";
import { HookScript } from "../harness.ts";

function workspaceById(fixture: FixtureVault, id: string): FixtureWorkspace {
  const workspace = fixture.workspaces.find((candidate) => candidate.id === id);
  if (workspace === undefined) {
    throw new Error(`fixture has no workspace "${id}"`);
  }
  return workspace;
}

const primaryCwd = (fixture: FixtureVault): string =>
  workspaceById(fixture, "primary").projectDir;

function noopPrepare(): void {
  // the fixture vault is already reindexed by requiresIndexBuild
}

function slugify(prompt: string): string {
  return prompt
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 48);
}

function buildRetrievalCase(prompt: string, index: number): HookCase {
  return {
    name: `retrieval/${index}-${slugify(prompt)}`,
    hookScript: HookScript.MemoryInject,
    requiresIndexBuild: true,
    prepare: noopPrepare,
    invocations: [
      {
        buildPayload: (fixture) => ({
          cwd: primaryCwd(fixture),
          session_id: `retrieval-${index}`,
          prompt,
        }),
        cwd: primaryCwd,
      },
    ],
  };
}

export const RETRIEVAL_CASES: readonly HookCase[] =
  loadPromptCorpus().map(buildRetrievalCase);
