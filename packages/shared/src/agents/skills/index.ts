/**
 * Skills registry — auto-generated from packages/shared/src/agents/skills/*.md.
 *
 * The `SKILLS` constant below is re-exported from `index.generated.ts`,
 * emitted by `scripts/build-skills.ts` (runs via the `build:skills`
 * package script and the `prebuild` / `predev` hooks). To add or edit a
 * skill, create or edit a `<mention>.md` file in this directory and re-run
 * `pnpm --filter @gruenerator/shared build:skills`.
 *
 * The generated file IS committed (intentionally) so that lint-staged
 * doesn't stash it away and break type resolution in pre-commit hooks.
 * A CI check should re-run codegen and fail if the diff isn't clean.
 * Ordering is governed by the `order` frontmatter field; ties break
 * alphabetically by `mention`.
 */
import { SKILLS } from './index.generated.js';

export { SKILLS };
export type { SystemSkill } from './types.js';

const mentionMap = new Map<string, string>(
  SKILLS.map((skill) => [skill.mention.toLowerCase(), skill.identifier])
);

export function resolveSkillMention(alias: string): string | null {
  return mentionMap.get(alias.toLowerCase()) ?? null;
}
