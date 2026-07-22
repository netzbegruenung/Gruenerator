/**
 * Map an active skill mention to the lookup key for a user's learned text form
 * ("Texte anlernen").
 *
 * Preset skills fold onto their text type so any LV variant (e.g. `presse-bayern`,
 * `insta-berlin`) still resolves the user's general Presse/Instagram style; a
 * dokumente skill maps to `antrag`; everything else (custom `/omveinladungen`
 * mentions, or non-preset skills) resolves to the raw mention. Returns null when
 * no skill mention is active.
 *
 * Kept in its own dependency-free module so it can be unit-tested without pulling
 * in the whole respond node.
 */
export function deriveTextFormMention(
  mention: string | null,
  activeSkill: { skillCategory?: string } | undefined
): string | null {
  if (!mention) return null;
  if (mention.startsWith('insta')) return 'instagram';
  if (mention.startsWith('facebook')) return 'facebook';
  if (mention.startsWith('presse')) return 'presse';
  if (activeSkill?.skillCategory === 'dokumente') return 'antrag';
  return mention;
}
