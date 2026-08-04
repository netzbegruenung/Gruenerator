/**
 * Admin-curated Rezept visibility — the discovery-only counterpart to
 * `admin_hidden_skills` (apps/api/database/schema/adminHiddenSkills.ts).
 *
 * Discovery only, same principle as the instance content policy
 * (`packages/shared/src/instances`): a hidden Rezept disappears from
 * catalogs and pickers, but `resolveSkillMention` stays unfiltered so an
 * existing `@mention`/link keeps resolving.
 *
 * Keyed by `mention` (e.g. 'presse'), not a skill's `identifier` — the
 * identifier is the owning agent and is shared across several Rezepte, so it
 * can't address a single one (see mentionableKey's comment in
 * packages/chat/src/lib/mentionables.ts).
 */
export function isAdminVisibleSkill(mention: string, hiddenMentions: readonly string[]): boolean {
  return !hiddenMentions.includes(mention.toLowerCase());
}
