/**
 * Prompt corpus for the retrieval-replay parity cases (tests/parity/cases/retrieval.ts).
 *
 * A small committed synthetic corpus is used by default, sized to the fixture
 * vault (tests/fixtures/vault.ts) so every prompt below is expected to hit
 * something specific in it. Set PARITY_REAL_VAULT=1 to additionally sample
 * real prompts recorded by the memory-inject hook's own logging, under
 * ~/.claude/memory/<workspace>/inject.jsonl on this machine — read-only, and
 * never against the real vault itself: callers run the sampled prompt text
 * through the SAME synthetic fixture, not the machine's real workspaces.
 */
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Sized to tests/fixtures/vault.ts's PRIMARY_NOTES: camelCase-vs-prose,
 * title-vs-body weighting, adjacent-vs-distant term pairs, an off-topic
 * query expected to return nothing, and FTS operator words in a natural
 * sentence (must tokenize, not be parsed as raw MATCH syntax). */
export const SYNTHETIC_PROMPTS: readonly string[] = [
  "How does the wrap-gate hook handle stop_hook_active on Stop?",
  "what does the overallScore field on Scoring Camel mean",
  "tell me everything about kryptonite",
  "what happened with the red car",
  "how do apples and cars relate in the orchard trip",
  "does injecting tokens use NEAR or AND matching?",
  "quantum entanglement submarine",
  "rollback incident on the gateway",
];

const PROMPT_FIELD = /"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/u;

/**
 * Pull just the `prompt` field out of one inject.jsonl line via regex rather
 * than a full JSON-shape parse: the anti-slop plugin bans `unknown`/`typeof`
 * at a function boundary, and a raw JSONL line has no other field this
 * loader needs. Wrapping the captured (already JSON-escaped) group in
 * quotes and re-parsing decodes it per the JSON string grammar.
 */
function extractPrompt(line: string): string | null {
  const match = PROMPT_FIELD.exec(line);
  const captured = match?.[1];
  if (captured === undefined) return null;
  const decoded: string = JSON.parse(`"${captured}"`);
  return decoded.trim().length > 0 ? decoded : null;
}

function readInjectLogPrompts(logPath: string): readonly string[] {
  let contents: string;
  try {
    contents = readFileSync(logPath, "utf-8");
  } catch {
    return [];
  }
  const prompts: string[] = [];
  for (const line of contents.split("\n")) {
    const prompt = extractPrompt(line);
    if (prompt !== null) prompts.push(prompt);
  }
  return prompts;
}

/**
 * Sample up to `sampleSize` real prompts from this machine's
 * ~/.claude/memory/<workspace>/inject.jsonl files. Read-only — never opens
 * the files for writing, and the returned strings are meant to be replayed
 * against a throwaway fixture vault, never the real one.
 */
export function loadRealPrompts(
  sampleSize: number,
  homeDirectory: string = homedir(),
): readonly string[] {
  const memoryRoot = join(homeDirectory, ".claude", "memory");
  let workspaceIds: readonly string[];
  try {
    workspaceIds = readdirSync(memoryRoot);
  } catch {
    return [];
  }
  const collected: string[] = [];
  for (const workspaceId of workspaceIds) {
    const logPath = join(memoryRoot, workspaceId, "inject.jsonl");
    collected.push(...readInjectLogPrompts(logPath));
    if (collected.length >= sampleSize) break;
  }
  return collected.slice(0, sampleSize);
}

const REAL_VAULT_SAMPLE_SIZE = 50;

/**
 * The prompt corpus a retrieval parity run should use: the synthetic corpus,
 * plus up to 50 real prompts when PARITY_REAL_VAULT=1 is set. Off by
 * default — the synthetic corpus alone is enough to validate the harness
 * itself (tests/parity/self.test.ts), and real-vault replay is opt-in
 * because it reads this machine's actual `~/.claude/memory` logs.
 */
export function loadPromptCorpus(): readonly string[] {
  if (process.env["PARITY_REAL_VAULT"] !== "1") {
    return SYNTHETIC_PROMPTS;
  }
  return [...SYNTHETIC_PROMPTS, ...loadRealPrompts(REAL_VAULT_SAMPLE_SIZE)];
}
