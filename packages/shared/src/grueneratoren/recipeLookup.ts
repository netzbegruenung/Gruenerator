import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';

export type RecipeSource = 'system' | 'own' | 'shared' | 'public';

export interface RecipeMatch<S> {
  source: RecipeSource;
  /** Catalogue entry, only for `source: 'system'`. */
  skill: S | null;
  /** The row behind an own/shared/public recipe. `null` for a system one. */
  form: TextForm | PublicTextForm | null;
  /** The caller's own row on this mention, whatever the source — for a system
   *  mention that is the override, for `source: 'own'` it is `form` again. */
  ownOverride: TextForm | null;
}

/**
 * Which source backs a recipe mention, in this order: the shipped catalogue
 * (a user's own row on the same mention OVERRIDES that recipe's body, it does
 * not replace it — it travels along as `ownOverride`), the caller's own row,
 * a row shared through a Projekt, a publicly listed row. `null` = none of the
 * lists that have answered so far knows the mention; whether that means "not
 * found" or "still loading" is the caller's call.
 *
 * `skill` is generic because the catalogue entry type (`AgentListItem`, with a
 * resolved icon) lives in `@gruenerator/chat`, which depends on this package.
 */
export function resolveRecipeByMention<S>(
  mention: string,
  skill: S | null,
  own: readonly TextForm[] | undefined,
  publicForms: readonly PublicTextForm[] | undefined
): RecipeMatch<S> | null {
  // Mentions are stored exactly as typed, but a link may carry any casing.
  const needle = mention.toLowerCase();
  const sameMention = (form: { mention: string }) => form.mention.toLowerCase() === needle;

  const ownRow = own?.find((f) => sameMention(f) && !f.sharedFromGroup) ?? null;
  if (skill) return { source: 'system', skill, form: null, ownOverride: ownRow };
  if (ownRow) return { source: 'own', skill: null, form: ownRow, ownOverride: ownRow };

  const sharedRow = own?.find((f) => sameMention(f) && f.sharedFromGroup) ?? null;
  if (sharedRow) return { source: 'shared', skill: null, form: sharedRow, ownOverride: null };

  const publicRow = publicForms?.find(sameMention) ?? null;
  if (publicRow) return { source: 'public', skill: null, form: publicRow, ownOverride: null };

  return null;
}
