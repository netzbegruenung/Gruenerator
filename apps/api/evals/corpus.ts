/**
 * Corpus loading + runtime validation.
 *
 * Split out of runChatEval.ts so it is importable from a unit test — that file
 * calls `main()` at module scope, so importing it would launch a live run.
 *
 * Every line is validated against the Zod schemas rather than cast. The cast
 * this replaces (`JSON.parse(l) as EvalCase`) accepted a misspelled key,
 * handed the assertion `undefined`, and let the scenario report green having
 * asserted nothing.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { evalCaseSchema, evalScenarioSchema, type EvalCase, type EvalScenario } from './types.js';

function isScenario(line: EvalCase | EvalScenario): line is EvalScenario {
  return Array.isArray((line as EvalScenario).turns);
}

/** Legacy single-turn line → the one-turn scenario the runner executes. */
export function normalize(line: EvalCase | EvalScenario): EvalScenario {
  if (isScenario(line)) return line;
  return {
    id: line.id,
    category: line.category,
    ...(line.modelId ? { modelId: line.modelId } : {}),
    ...(line.knownFailure ? { knownFailure: true } : {}),
    ...(line.systemMcpLane ? { systemMcpLane: true } : {}),
    turns: [{ prompt: line.prompt, expect: line.expect ?? {} }],
  };
}

/**
 * Parse one .jsonl corpus file. Rejections name the file, the 1-based line
 * number and the offending field path — a corpus typo should be a two-second
 * fix, not a hunt.
 */
export function parseCorpusText(text: string, fileLabel: string): EvalScenario[] {
  const scenarios: EvalScenario[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const at = `${fileLabel}:${i + 1}`;

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `${at}: not valid JSON — ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Pick the schema by shape BEFORE parsing rather than handing both to a
    // z.union: a union reports only "Invalid input" at the root because it
    // can't know which branch was intended, which loses the field path — the
    // one piece of information that makes the error worth having.
    const hasTurns = Array.isArray((json as { turns?: unknown })?.turns);
    const schema = hasTurns ? evalScenarioSchema : evalCaseSchema;

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((iss) => `${iss.path.join('.') || '<root>'}: ${iss.message}`)
        .join('; ');
      const id = (json as { id?: unknown })?.id;
      const label = typeof id === 'string' ? ` (id "${id}")` : '';
      throw new Error(`${at}${label}: invalid corpus line — ${issues}`);
    }

    scenarios.push(normalize(parsed.data));
  });
  return scenarios;
}

export interface CorpusFilter {
  /** Comma-separated OR match on id or category substrings. */
  filter: string;
  slow: boolean;
  mcp: boolean;
  notebook: boolean;
  /** Szenarien, die die SYSTEM-MCP-Server brauchen (SYSTEM_MCP_*_URL). */
  systemMcp: boolean;
}

/** Glob evals/corpus/*.jsonl plus the legacy single-file corpus, then filter. */
export function loadCorpus(here: string, opts: CorpusFilter): EvalScenario[] {
  const files: string[] = [];
  const legacy = join(here, 'chat-corpus.jsonl');
  if (existsSync(legacy)) files.push(legacy);
  const corpusDir = join(here, 'corpus');
  if (existsSync(corpusDir)) {
    for (const f of readdirSync(corpusDir).sort()) {
      if (f.endsWith('.jsonl')) files.push(join(corpusDir, f));
    }
  }

  const scenarios: EvalScenario[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    for (const scenario of parseCorpusText(readFileSync(file, 'utf8'), file)) {
      if (seen.has(scenario.id)) {
        throw new Error(`Duplicate scenario id "${scenario.id}" (${file})`);
      }
      seen.add(scenario.id);
      scenarios.push(scenario);
    }
  }

  return scenarios.filter((s) => {
    if (s.slow && !opts.slow) return false;
    if (s.mcpLane && !opts.mcp) return false;
    if (s.systemMcpLane && !opts.systemMcp) return false;
    if (s.notebookLane && !opts.notebook) return false;
    if (!opts.filter) return true;
    return opts.filter
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
      .some((f) => s.id.includes(f) || s.category.includes(f));
  });
}
