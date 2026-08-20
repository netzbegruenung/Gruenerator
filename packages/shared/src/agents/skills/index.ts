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
import { type LvEbene } from '../types.js';

import { SKILLS } from './index.generated.js';
import { type SystemSkill } from './types.js';

export { SKILLS };
export type { SystemSkill };

/**
 * Recipes that were split or renamed after shipping — the F1 escape hatch, with
 * an expiry.
 *
 * Each of these was a single recipe that opened with a Partei/Fraktion switch
 * the model had to resolve per turn. They are now two recipes each. Released
 * mobile binaries, persisted sidebar favourites and old threads still send the
 * retired mention, so it keeps resolving.
 *
 * They all resolve to the Partei — not because that level ranks first (there is
 * no default, the user picks), but because it is the level the recipe is
 * actually offered to: `landesverbandForRoles` unlocks Landesverband material
 * for the Landesgeschäftsstelle alone, and the same choice governs each PR
 * agent's `defaultRecipeMention`. A retired mention has to land somewhere, and
 * landing anywhere else would contradict both.
 *
 * Entfernen frühestens 2027-08.
 */
const LEGACY_SKILL_MENTIONS: Readonly<Record<string, string>> = {
  'presse-hessen': 'presse-hessen-partei',
  'presse-mv': 'presse-mv-partei',
  'presse-bayern': 'presse-bayern-partei',
  'presse-sachsen-anhalt': 'presse-sachsen-anhalt-partei',
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

const ebeneMap = new Map<string, LvEbene>(
  (SKILLS as readonly SystemSkill[]).flatMap((skill) =>
    skill.lvEbene ? [[skill.mention.toLowerCase(), skill.lvEbene] as const] : []
  )
);

/**
 * Die Landesverbands-Ebene eines Rezepts, oder `null` für alles ohne
 * Ebenentrennung (generische Rezepte, einstufige Landesverbände, unbekannte
 * Kennungen). Zurückgezogene Kennungen laufen über {@link canonicalSkillMention},
 * damit ein alter Thread dieselbe Ebene trifft wie sein Nachfolger.
 *
 * Die API schneidet damit die PM-Beispielsuche zu (`narrowLvScopeToEbene`).
 */
export function lvEbeneForSkillMention(mention: string): LvEbene | null {
  return ebeneMap.get(canonicalSkillMention(mention).toLowerCase()) ?? null;
}
