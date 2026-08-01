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
 * 2. **A prompt body back in a public skill or agent file.** Both registries
 *    carry frontmatter only; the prompt text is party-internal and lives in
 *    `INTERN_CONTENT_DIR` (see apps/api/services/skills/internalPrompts.ts).
 *    A body here would flow through codegen into the committed
 *    `index.generated.ts`, into the web bundle, and into every shipped mobile
 *    binary — and a shipped binary cannot be un-shipped. `build-skills.ts` and
 *    `build-agents.ts` already refuse to emit one; this repeats the check
 *    without running codegen, so a hand-edited generated file is caught too.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = 'packages/shared/src/agents/skills';
const AGENTS_DIR = 'packages/shared/src/agents/definitions';

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

// ── 2. Prompt bodies in public skill and agent files ────────────────────────
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

for (const [dir, label, target] of [
  [SKILLS_DIR, 'skill', '<INTERN_CONTENT_DIR>/skills/<mention>.md'],
  [AGENTS_DIR, 'agent', '<INTERN_CONTENT_DIR>/agents/<identifier>.md'],
]) {
  const withBodies = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      file: f,
      body: readFileSync(join(dir, f), 'utf8').replace(FRONTMATTER, '').trim(),
    }))
    .filter(({ body }) => body.length > 0);

  if (withBodies.length > 0) {
    failures.push(
      `${withBodies.length} public ${label} file(s) carry a prompt body:\n` +
        withBodies.map(({ file, body }) => `  · ${file} (${body.length} chars)`).join('\n') +
        `\n\n  ${label === 'skill' ? 'Skill prompts' : 'Agent personas'} are party-internal.` +
        ` Move the body to ${target} (dev: .external/gruenerator-intern/).`
    );
  }
}

// The generated registries are committed and bundled into web and mobile, so a
// prompt in them is public the moment it builds. Skills must carry no prompt
// field at all; agents keep `systemRole` (the shape is shared with user agents,
// whose role is real) but it has to be the empty string on every entry.
const generatedSkills = readFileSync(join(SKILLS_DIR, 'index.generated.ts'), 'utf8');
if (generatedSkills.includes('skillSystemPrompt')) {
  failures.push(
    `${SKILLS_DIR}/index.generated.ts contains a "skillSystemPrompt" field.\n` +
      `  That file is committed and bundled into web and mobile — it must stay metadata-only.\n` +
      `  Re-run: pnpm --filter @gruenerator/shared build:skills`
  );
}

const generatedAgents = readFileSync(join(AGENTS_DIR, 'index.generated.ts'), 'utf8');
const nonEmptyRoles = [...generatedAgents.matchAll(/systemRole: (?!'',)(.+)$/gm)];
if (nonEmptyRoles.length > 0) {
  failures.push(
    `${AGENTS_DIR}/index.generated.ts has ${nonEmptyRoles.length} non-empty systemRole(s).\n` +
      `  Agent personas are party-internal and loaded at runtime; this file is bundled.\n` +
      `  Re-run: pnpm --filter @gruenerator/shared build:agents`
  );
}

if (failures.length > 0) {
  console.error(`\n[check-internal-content] ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`${failure}\n`);
  process.exit(1);
}

console.log('[check-internal-content] ok — no internal content exposed');
