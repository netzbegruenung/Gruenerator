/**
 * Codegen — read packages/shared/src/agents/definitions/*.md and emit
 * `index.generated.ts` as a typed `SYSTEM_AGENT_DEFINITIONS` array.
 *
 * Each markdown file is one hand-written system agent: YAML frontmatter for all
 * structured metadata (validated by `agentFrontmatterSchema` from
 * @gruenerator/contracts), and nothing else. A markdown body is rejected — see
 * `detectPromptBodies`. Sibling to `build-skills.ts` — same split.
 *
 * The per-Landesverband agents (lvPrAgents.ts / lvBuergerAgents.ts) stay as
 * template builders — one template fans out to N agents, so per-file extraction
 * would only duplicate them. system.ts appends them after these definitions.
 *
 * Ordering: numeric `order` ascending, ties break alphabetically by `identifier`.
 *
 * Run via `pnpm --filter @gruenerator/shared build:agents`. Pre-bound to
 * `prebuild` / `predev` so consumers don't need to remember it.
 *
 * Watch mode: `--watch` re-emits on any *.md change (chokidar).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentFrontmatterSchema, type AgentFrontmatter } from '@gruenerator/contracts';
import chokidar from 'chokidar';
import matter from 'gray-matter';

import { AGENT_ICON_KEYS, isAgentIconKey } from '../src/agents/agentIcons.js';
import { AGENT_TOOL_KEYS, isAgentToolKey } from '../src/agents/agentToolKeys.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_DIR = resolve(__dirname, '../src/agents/definitions');
const SKILLS_DIR = resolve(__dirname, '../src/agents/skills');
const OUT_PATH = resolve(DEFINITIONS_DIR, 'index.generated.ts');

interface ParsedAgent {
  filename: string;
  frontmatter: AgentFrontmatter;
  body: string;
}

function parseAll(): ParsedAgent[] {
  const files = readdirSync(DEFINITIONS_DIR).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    throw new Error(`[build-agents] No *.md files in ${DEFINITIONS_DIR}`);
  }
  return files.map((filename) => {
    const raw = readFileSync(resolve(DEFINITIONS_DIR, filename), 'utf8');
    const { data, content } = matter(raw);
    const result = agentFrontmatterSchema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`[build-agents] Invalid frontmatter in ${filename}:\n${issues}`);
    }
    return { filename, frontmatter: result.data, body: content.trim() };
  });
}

function detectDuplicates(agents: readonly ParsedAgent[]): void {
  const seen = new Map<string, string>();
  for (const agent of agents) {
    const prior = seen.get(agent.frontmatter.identifier);
    if (prior) {
      throw new Error(
        `[build-agents] Duplicate identifier "${agent.frontmatter.identifier}" in ${agent.filename} (also in ${prior})`
      );
    }
    seen.set(agent.frontmatter.identifier, agent.filename);
  }
}

/**
 * The systemRole is party-internal and must not enter this repo. It lives in the
 * directory the API reads at runtime (`INTERN_CONTENT_DIR`, see
 * apps/api/services/skills/internalPrompts.ts); these files carry frontmatter only.
 *
 * This is the seam where a leak would happen, so it fails here rather than in
 * review: everything downstream of codegen — the committed `index.generated.ts`,
 * the web bundle, every shipped mobile binary — is public by construction, and a
 * binary that already shipped cannot be un-shipped.
 */
function detectPromptBodies(agents: readonly ParsedAgent[]): void {
  const offenders = agents.filter((a) => a.body.length > 0);
  if (offenders.length === 0) return;
  throw new Error(
    `[build-agents] Prompt body found in ${offenders.length} public agent file(s):\n` +
      offenders.map((a) => `  · ${a.filename} (${a.body.length} chars)`).join('\n') +
      `\n\nAgent personas are party-internal. Move the body to` +
      ` <INTERN_CONTENT_DIR>/agents/<identifier>.md` +
      ` (dev: .external/gruenerator-intern/agents/) and leave only frontmatter here.`
  );
}

/**
 * `defaultRecipeMention` must name an existing recipe: respondNode resolves it
 * against `SKILLS` and silently runs on the bare systemRole when the lookup
 * misses, so a typo would ship as a quiet behavior change instead of an error.
 * The skill *.md frontmatter is the same source `build-skills.ts` emits
 * `SKILLS` from — reading it directly keeps this check import-cycle-free.
 */
function detectUnknownRecipeMentions(agents: readonly ParsedAgent[]): void {
  const known = new Set(
    readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => matter(readFileSync(resolve(SKILLS_DIR, f), 'utf8')).data.mention as unknown)
      .filter((m): m is string => typeof m === 'string')
  );
  const offenders = agents.filter(
    (a) => a.frontmatter.defaultRecipeMention && !known.has(a.frontmatter.defaultRecipeMention)
  );
  if (offenders.length === 0) return;
  throw new Error(
    `[build-agents] defaultRecipeMention names no existing recipe in ${offenders.length} agent file(s):\n` +
      offenders
        .map((a) => `  · ${a.filename}: "${a.frontmatter.defaultRecipeMention}"`)
        .join('\n') +
      `\n\nKnown recipe mentions: ${[...known].sort().join(', ')}`
  );
}

/**
 * `iconKey` must name a concept from `AGENT_ICON_KEYS`. The three platform
 * registries map that closed set as `Record<AgentIconKey, …>`, so an unknown key
 * here is the one failure the compiler cannot see — it would just resolve to
 * nothing and render the generic sparkle, on every platform, silently. That is
 * exactly how #2951 happened: `gruenerator-presentations-editor` carried the
 * react-icons component name `PiProjectorScreenChart` instead of kebab-case, and
 * nothing said a word.
 *
 * Lives here rather than in `agentFrontmatterSchema` (a `z.enum` would be the
 * obvious home) because `@gruenerator/contracts` cannot import shared, and the
 * registry belongs next to the agents — `packages/shared/src/agents/` is
 * deliberately free of foreign packages.
 */
function detectUnknownIconKeys(agents: readonly ParsedAgent[]): void {
  const offenders = agents.filter(
    (a) => a.frontmatter.iconKey && !isAgentIconKey(a.frontmatter.iconKey)
  );
  if (offenders.length === 0) return;
  throw new Error(
    `[build-agents] Unknown iconKey in ${offenders.length} agent file(s):\n` +
      offenders.map((a) => `  · ${a.filename}: "${a.frontmatter.iconKey}"`).join('\n') +
      `\n\nKnown icon concepts: ${AGENT_ICON_KEYS.join(', ')}` +
      `\nAdd a new one to AGENT_ICON_KEYS (packages/shared/src/agents/agentIcons.ts);` +
      ` the compiler will then ask for its mapping in the three platform registries.`
  );
}

/**
 * `enabledTools` keys must name real capabilities — see agentToolKeys.ts for
 * the closed set and why. This is the validation seam system agents have been
 * missing: user agents are checked server-side (agentDraftService.ts), but a
 * typo'd or invented key in this frontmatter previously shipped silently —
 * `draft_structured` and `self_review` sat in 19 definitions unnoticed (#3078).
 */
function detectUnknownToolKeys(agents: readonly ParsedAgent[]): void {
  const offenders = agents.flatMap((a) =>
    (a.frontmatter.enabledTools ?? [])
      .filter((key) => !isAgentToolKey(key))
      .map((key) => `${a.filename}: "${key}"`)
  );
  if (offenders.length === 0) return;
  throw new Error(
    `[build-agents] Unknown enabledTools key in ${offenders.length} entr${offenders.length === 1 ? 'y' : 'ies'}:\n` +
      offenders.map((o) => `  · ${o}`).join('\n') +
      `\n\nKnown keys: ${AGENT_TOOL_KEYS.join(', ')}`
  );
}

function sortAgents(agents: readonly ParsedAgent[]): ParsedAgent[] {
  return [...agents].sort((a, b) => {
    const ao = a.frontmatter.order ?? Number.POSITIVE_INFINITY;
    const bo = b.frontmatter.order ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return a.frontmatter.identifier.localeCompare(b.frontmatter.identifier);
  });
}

function emit(agents: readonly ParsedAgent[]): string {
  const lines: string[] = [
    '// AUTO-GENERATED by packages/shared/scripts/build-agents.ts — do not edit.',
    '// Source: packages/shared/src/agents/definitions/*.md',
    '// Re-run `pnpm --filter @gruenerator/shared build:agents` after editing.',
    '',
    "import type { Agent } from '../types.js';",
    '',
    'export const SYSTEM_AGENT_DEFINITIONS = [',
  ];
  for (const agent of agents) {
    lines.push('  {');
    for (const [key, value] of Object.entries(agent.frontmatter)) {
      if (key === 'order') continue;
      lines.push(`    ${key}: ${JSON.stringify(value)},`);
    }
    // The persona is party-internal and loaded at runtime by the API; this
    // registry is bundled into web and mobile. Emitting the empty string keeps
    // the `Agent` shape intact — `gruenerator-suche` already shipped this way.
    lines.push("    systemRole: '',");
    lines.push('  },');
  }
  lines.push('] as const satisfies readonly Agent[];');
  lines.push('');
  return lines.join('\n');
}

function build(): void {
  const parsed = parseAll();
  detectDuplicates(parsed);
  detectPromptBodies(parsed);
  detectUnknownRecipeMentions(parsed);
  detectUnknownIconKeys(parsed);
  detectUnknownToolKeys(parsed);
  const sorted = sortAgents(parsed);
  writeFileSync(OUT_PATH, emit(sorted));
  console.log(`[build-agents] wrote ${sorted.length} agents → ${OUT_PATH}`);
}

const watchMode = process.argv.includes('--watch');
build();
if (watchMode) {
  console.log(`[build-agents] watching ${DEFINITIONS_DIR}/*.md`);
  // chokidar v4+ dropped glob support — watch the dir and filter to *.md
  // (skips the generated index.generated.ts, avoiding a write→rebuild loop).
  chokidar.watch(DEFINITIONS_DIR, { ignoreInitial: true }).on('all', (event, path) => {
    if (!path.endsWith('.md')) return;
    try {
      build();
      console.log(`[build-agents] regenerated after ${event} on ${path}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
    }
  });
}
