/**
 * Skills registry — auto-generated from packages/shared/src/agents/skills/*.md.
 *
 * The `SKILLS` constant below is re-exported from `index.generated.ts`,
 * emitted by `scripts/build-skills.ts` (runs via the `build:skills`
 * package script and the `prebuild` / `predev` hooks). To add or edit a
 * skill's *metadata*, create or edit a `<mention>.md` file in this directory
 * and re-run `pnpm --filter @gruenerator/shared build:skills`.
 *
 * The files here are frontmatter ONLY. A skill's prompt body is party-internal
 * and lives in the private `netzbegruenung/gruenerator-intern` repo; the API
 * reads it at runtime from `INTERN_CONTENT_DIR`. This array ships inside the web
 * bundle and every released mobile binary, so a prompt in it is public the
 * moment it builds — and a released binary cannot be recalled. `build-skills.ts`
 * therefore rejects a markdown body outright. See CLAUDE-deployment.md and
 * apps/api/services/skills/internalPrompts.ts.
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

/**
 * Recipes that were split or renamed after shipping — the F1 escape hatch, with
 * an expiry.
 *
 * Each of these was a single recipe that opened with a Partei/Fraktion switch
 * the model had to resolve per turn. They are now two recipes each. Released
 * mobile binaries, persisted sidebar favourites and old threads still send the
 * retired mention, so it keeps resolving.
 *
 * They resolve to the Fraktion — not because that level is the default (there
 * is none, the user picks), but because the retired recipe covered both and the
 * Fraktion outweighs the Partei in each corpus behind them by a factor of 7 to
 * 17.
 *
 * `presse-berlin` is the exception and points at the Partei: its retired text
 * described the Landesverband alone — the 858 Fraktions-Dokumente next to it
 * had never been analysed. Continuity is what this map is for, so it keeps
 * handing back what those threads used to get. Entfernen frühestens 2027-08.
 */
const LEGACY_SKILL_MENTIONS: Readonly<Record<string, string>> = {
  'presse-hessen': 'presse-hessen-fraktion',
  'presse-mv': 'presse-mv-fraktion',
  'presse-bayern': 'presse-bayern-fraktion',
  'presse-sachsen-anhalt': 'presse-sachsen-anhalt-fraktion',
  'presse-berlin': 'presse-berlin-partei',
};

/** The live mention for a possibly retired one. Unknown mentions pass through. */
export function canonicalSkillMention(mention: string): string {
  return LEGACY_SKILL_MENTIONS[mention.toLowerCase()] ?? mention;
}

const mentionMap = new Map<string, string>(
  SKILLS.map((skill) => [skill.mention.toLowerCase(), skill.identifier])
);

export function resolveSkillMention(alias: string): string | null {
  return mentionMap.get(canonicalSkillMention(alias).toLowerCase()) ?? null;
}
