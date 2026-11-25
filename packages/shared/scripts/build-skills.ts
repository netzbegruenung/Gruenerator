/**
 * Codegen — read packages/shared/src/agents/skills/*.md and emit
 * `index.generated.ts` as a typed `SKILLS` array.
 *
 * Each markdown file is one skill: YAML frontmatter for metadata
 * (validated by `skillFrontmatterSchema` from @gruenerator/contracts) and
 * nothing else. A markdown body is rejected — see `detectPromptBodies`.
 *
 * Ordering: numeric `order` ascending; on a tie the party level of a
 * Landesverband (`lvEbene: partei`) comes before its Fraktion, then alphabetically
 * by `mention`. Partei first because it is the default (`lvRecipePreference`), and
 * hub and sidebar list the recipes in this order.
 *
 * Run via `pnpm --filter @gruenerator/shared build:skills`. Pre-bound to
 * `prebuild` / `predev` so consumers don't need to remember it.
 *
 * Watch mode: `--watch` re-emits on any *.md change (chokidar).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skillFrontmatterSchema, type SkillFrontmatter } from '@gruenerator/contracts';
import chokidar from 'chokidar';
import matter from 'gray-matter';

import { INSTANCES, isInstanceId } from '../src/instances/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '../src/agents/skills');
const OUT_PATH = resolve(SKILLS_DIR, 'index.generated.ts');
const SLIM_OUT_PATH = resolve(SKILLS_DIR, 'slim.generated.ts');

interface ParsedSkill {
  filename: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

function parseAll(): ParsedSkill[] {
  const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    throw new Error(`[build-skills] No *.md files in ${SKILLS_DIR}`);
  }
  return files.map((filename) => {
    const raw = readFileSync(resolve(SKILLS_DIR, filename), 'utf8');
    const { data, content } = matter(raw);
    const result = skillFrontmatterSchema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`[build-skills] Invalid frontmatter in ${filename}:\n${issues}`);
    }
    return { filename, frontmatter: result.data, body: content.trim() };
  });
}

function detectDuplicates(skills: readonly ParsedSkill[]): void {
  const seen = new Map<string, string>();
  for (const skill of skills) {
    const prior = seen.get(skill.frontmatter.mention);
    if (prior) {
      throw new Error(
        `[build-skills] Duplicate mention "${skill.frontmatter.mention}" in ${skill.filename} (also in ${prior})`
      );
    }
    seen.set(skill.frontmatter.mention, skill.filename);
  }
}

/**
 * `instances` is a plain string array in the contract — contracts must not
 * import shared, so the schema cannot narrow it to `InstanceId` there. The
 * narrowing happens here instead, and it has to be a hard stop: a typo'd id
 * matches no instance, so the recipe would exist nowhere while looking
 * perfectly configured in review.
 */
function detectUnknownInstances(skills: readonly ParsedSkill[]): void {
  const offenders = skills.flatMap((s) =>
    (s.frontmatter.instances ?? [])
      .filter((id) => !isInstanceId(id))
      .map((id) => `  · ${s.filename}: "${id}"`)
  );
  if (offenders.length === 0) return;
  throw new Error(
    `[build-skills] Unknown instance id in ${offenders.length} entry/entries:\n` +
      offenders.join('\n') +
      `\n\nKnown ids: ${INSTANCES.map((i) => i.id).join(', ')}` +
      ` (packages/shared/src/instances/index.ts)`
  );
}

/**
 * The prompt body is party-internal and must not enter this repo. It lives in
 * the directory the API reads at runtime (`INTERN_CONTENT_DIR`, see
 * apps/api/services/skills/internalPrompts.ts); these files carry
 * frontmatter only.
 *
 * This is the seam where a leak would happen, so it fails here rather than in
 * review: everything downstream of codegen — the committed `index.generated.ts`,
 * the web bundle, every shipped mobile binary — is public by construction, and
 * a binary that already shipped cannot be un-shipped.
 */
function detectPromptBodies(skills: readonly ParsedSkill[]): void {
  const offenders = skills.filter((s) => s.body.length > 0);
  if (offenders.length === 0) return;
  throw new Error(
    `[build-skills] Prompt body found in ${offenders.length} public skill file(s):\n` +
      offenders.map((s) => `  · ${s.filename} (${s.body.length} chars)`).join('\n') +
      `\n\nSkill prompts are party-internal. Move the body to <INTERN_CONTENT_DIR>/skills/<mention>.md` +
      ` (dev: .external/gruenerator-intern/skills/) and leave only frontmatter here.`
  );
}

function sortSkills(skills: readonly ParsedSkill[]): ParsedSkill[] {
  return [...skills].sort((a, b) => {
    const ao = a.frontmatter.order ?? Number.POSITIVE_INFINITY;
    const bo = b.frontmatter.order ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    const fraktion = (s: ParsedSkill) => (s.frontmatter.lvEbene === 'fraktion' ? 1 : 0);
    if (fraktion(a) !== fraktion(b)) return fraktion(a) - fraktion(b);
    return a.frontmatter.mention.localeCompare(b.frontmatter.mention);
  });
}

function emit(skills: readonly ParsedSkill[]): string {
  const lines: string[] = [
    '// AUTO-GENERATED by packages/shared/scripts/build-skills.ts — do not edit.',
    '// Source: packages/shared/src/agents/skills/*.md',
    '// Re-run `pnpm --filter @gruenerator/shared build:skills` after editing.',
    '',
    "import type { SystemSkill } from './types.js';",
    '',
    'export const SKILLS = [',
  ];
  for (const skill of skills) {
    lines.push('  {');
    for (const [key, value] of Object.entries(skill.frontmatter)) {
      if (key === 'order') continue;
      lines.push(`    ${key}: ${JSON.stringify(value)},`);
    }
    lines.push('  },');
  }
  lines.push('] as const satisfies readonly SystemSkill[];');
  lines.push('');
  return lines.join('\n');
}

/**
 * The boot-time projection of `SKILLS` (see `SkillSlim` in types.ts): the
 * fields the app shell reads while booting, without descriptions, prompts
 * templates or tool lists. `slim.vitest.ts` checks it against the full array.
 */
const SLIM_KEYS = [
  'identifier',
  'mention',
  'title',
  'iconKey',
  'skillCategory',
  'audience',
  'modelOnly',
  'instances',
] as const;

function emitSlim(skills: readonly ParsedSkill[]): string {
  const lines: string[] = [
    '// AUTO-GENERATED by packages/shared/scripts/build-skills.ts — do not edit.',
    '// Boot-time projection of skills/*.md (see SkillSlim).',
    '// Re-run `pnpm --filter @gruenerator/shared build:skills` after editing.',
    '',
    "import type { SkillSlim } from '../types.js';",
    '',
    'export const SKILL_SLIMS: readonly SkillSlim[] = [',
  ];
  for (const skill of skills) {
    const frontmatter: Record<string, unknown> = skill.frontmatter;
    const slim = Object.fromEntries(
      SLIM_KEYS.filter((key) => frontmatter[key] !== undefined).map((key) => [
        key,
        frontmatter[key],
      ])
    );
    lines.push(`  ${JSON.stringify(slim)},`);
  }
  lines.push('];', '');
  return lines.join('\n');
}

function build(): void {
  const parsed = parseAll();
  detectDuplicates(parsed);
  detectUnknownInstances(parsed);
  detectPromptBodies(parsed);
  const sorted = sortSkills(parsed);
  writeFileSync(OUT_PATH, emit(sorted));
  writeFileSync(SLIM_OUT_PATH, emitSlim(sorted));
  console.log(`[build-skills] wrote ${sorted.length} skills → ${OUT_PATH}`);
}

const watchMode = process.argv.includes('--watch');
build();
if (watchMode) {
  console.log(`[build-skills] watching ${SKILLS_DIR}/*.md`);
  // chokidar v4+ dropped glob support — watch the dir and filter to *.md
  // (skips the generated index.generated.ts, avoiding a write→rebuild loop).
  chokidar.watch(SKILLS_DIR, { ignoreInitial: true }).on('all', (event, path) => {
    if (!path.endsWith('.md')) return;
    try {
      build();
      console.log(`[build-skills] regenerated after ${event} on ${path}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
    }
  });
}
