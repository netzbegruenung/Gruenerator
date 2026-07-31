#!/usr/bin/env node
/**
 * Guards the boundary between this public repo and party-internal content.
 *
 * Two failure modes, both of which have already happened once:
 *
 * 1. **Ignored but tracked.** `.gitignore` does not apply to files git already
 *    tracks. `documentation/docs/intern/` was listed in `.gitignore` and 26 of
 *    its files still sat on `origin/master`, because they were committed before
 *    the rule (or force-added past it). Adding a path to `.gitignore` therefore
 *    proves nothing on its own — this check is what makes it true.
 *
 *    Scoped to `PRIVATE_PREFIXES` rather than every ignored-but-tracked file:
 *    this repo force-adds plenty on purpose (CLAUDE*.md, scripts/, docs/), and
 *    a check that shouts about those would be muted within a week. Add a prefix
 *    here when a path must never reach the public remote.
 *
 * 2. **A prompt body back in a public skill file.** Skill recipes carry
 *    frontmatter only; the prompt text is party-internal and lives in
 *    `SKILLS_INTERN_DIR` (see apps/api/services/skills/internalSkillPrompts.ts).
 *    A body here would flow through codegen into the committed
 *    `index.generated.ts`, into the web bundle, and into every shipped mobile
 *    binary — and a shipped binary cannot be un-shipped. `build-skills.ts`
 *    already refuses to emit one; this repeats the check without running codegen,
 *    so a hand-edited generated file is caught too.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = 'packages/shared/src/agents/skills';
const GENERATED = join(SKILLS_DIR, 'index.generated.ts');

const failures = [];

/** Paths that must never be tracked, whatever .gitignore happens to say. */
const PRIVATE_PREFIXES = [
  '.external/', // sidecar checkouts, incl. the internal skill prompts
  'documentation/docs/intern/', // internal analyses and corpus dumps
];

// ── 1. Tracked files under a private prefix ─────────────────────────────────
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const leaked = tracked.filter((f) => PRIVATE_PREFIXES.some((p) => f.startsWith(p)));

if (leaked.length > 0) {
  failures.push(
    `${leaked.length} tracked file(s) live under a private prefix:\n` +
      leaked.map((f) => `  · ${f}`).join('\n') +
      `\n\n  Fix: git rm --cached <file> (keeps it on disk), then commit.` +
      `\n  Note: this only stops FUTURE commits. Anything already pushed is public.`
  );
}

// ── 2. Prompt bodies in public skill files ──────────────────────────────────
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const withBodies = readdirSync(SKILLS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ file: f, body: readFileSync(join(SKILLS_DIR, f), 'utf8').replace(FRONTMATTER, '').trim() }))
  .filter(({ body }) => body.length > 0);

if (withBodies.length > 0) {
  failures.push(
    `${withBodies.length} public skill file(s) carry a prompt body:\n` +
      withBodies.map(({ file, body }) => `  · ${file} (${body.length} chars)`).join('\n') +
      `\n\n  Skill prompts are party-internal. Move the body to` +
      ` <SKILLS_INTERN_DIR>/<mention>.md (dev: .external/gruenerator-intern/skills/).`
  );
}

if (readFileSync(GENERATED, 'utf8').includes('skillSystemPrompt')) {
  failures.push(
    `${GENERATED} contains a "skillSystemPrompt" field.\n` +
      `  That file is committed and bundled into web and mobile — it must stay metadata-only.\n` +
      `  Re-run: pnpm --filter @gruenerator/shared build:skills`
  );
}

if (failures.length > 0) {
  console.error(`\n[check-internal-content] ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`${failure}\n`);
  process.exit(1);
}

console.log('[check-internal-content] ok — no internal content exposed');
