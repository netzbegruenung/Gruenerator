'use client';

import { useMemo } from 'react';

import { useRecipeLibrary } from '../../hooks/useRecipeLibrary';
import { getAgentMentionables } from '../../lib/mentionables';
import { requestMention } from '../../lib/mentionRequest';
import { libraryRecipeMentionables } from '../../lib/plusMenu';
import { cn } from '../../lib/utils';

import { useChatDensity } from './chatDensityContext';

/**
 * Rezepte als Einstieg im leeren Chat: zuerst die gespeicherten aus der
 * Bibliothek, dann die System-Standardrezepte. Ein Klick wählt das Rezept wie
 * das @-Menü: die Auswahl geht an die Mention-Auswahl des Composers
 * (`requestMention`), die Chip und Store-Aktivierung setzt — und beim Entfernen
 * des Chips wieder löscht.
 */
export function RecipeStarters({
  limit = 4,
  layout = 'wrap',
}: {
  limit?: number;
  /** `row`: eine Zeile, seitwärts scrollbar (kompakte Fenster). */
  layout?: 'wrap' | 'row';
}) {
  const isCompact = useChatDensity() === 'compact';
  const { items } = useRecipeLibrary();

  const starters = useMemo(() => {
    const saved = libraryRecipeMentionables(
      items.filter((i) => i.kind === 'recipe').map((i) => i.ref)
    );
    const defaults = getAgentMentionables().filter((a) => a.isSystemDefault);
    const seen = new Set<string>();
    return [...saved, ...defaults]
      .filter((m) => !seen.has(m.mention) && seen.add(m.mention))
      .slice(0, limit);
  }, [items, limit]);

  if (starters.length === 0) return null;

  return (
    <ul
      aria-label="Rezepte"
      className={cn(
        'm-0 flex list-none p-0',
        layout === 'row' ? 'w-full gap-1.5 overflow-x-auto' : 'flex-wrap gap-2',
        isCompact ? 'mt-3' : 'mt-4'
      )}
    >
      {starters.map((m) => (
        <li key={m.mention} className="shrink-0">
          <button
            type="button"
            {...(m.description ? { title: m.description } : {})}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            onClick={() => requestMention(m)}
          >
            {m.title}
          </button>
        </li>
      ))}
    </ul>
  );
}
