'use client';

import { type Mentionable } from '../../lib/mentionables';
import { type MentionSection } from '../../lib/mentionSections';
import { ComposerToken } from '../thread/ComposerToken';

export interface NotebookRecipeGroup {
  title: string;
  recipes: readonly Mentionable[];
}

/**
 * Das gewählte Rezept der Notebook-Seite als Chip im Composer. Gewählt wird im
 * Einstellungsmenü oder mit `@`; das Rezept gibt nur die Form der Antwort vor
 * (Wahlprüfstein, Pressemitteilung, Bürger*innenmail …), Suche und Quellen
 * bleiben die des Notebooks. Es steht nicht im Text, sonst landete die
 * Erwähnung in der Suchanfrage.
 */
export function NotebookRecipeChip({
  value,
  onRemove,
}: {
  value: Mentionable;
  onRemove: () => void;
}) {
  // Below `sm` the chip takes its own row above the input, like the chat's
  // mention pills — inline it squeezed the textarea to a single character.
  return (
    <div className="flex min-w-0 max-sm:order-first max-sm:basis-full max-sm:px-1 max-sm:pt-1.5">
      <ComposerToken
        icon={value.icon ?? null}
        glyph={value.avatar}
        brandColor={value.backgroundColor}
        label={value.title}
        removeLabel={`Rezept ${value.title} entfernen`}
        onRemove={onRemove}
      />
    </div>
  );
}

/** The notebook's recipes as the composer's @-list, filtered by the typed query. */
export function recipeMentionSections(
  groups: readonly NotebookRecipeGroup[],
  query: string
): MentionSection[] {
  const q = query.trim().toLowerCase();
  const matches = (m: Mentionable) =>
    !q || m.title.toLowerCase().includes(q) || m.mention.toLowerCase().includes(q);
  return groups
    .map((g) => ({ kind: 'flat' as const, label: g.title, items: g.recipes.filter(matches) }))
    .filter((s) => s.items.length > 0);
}
