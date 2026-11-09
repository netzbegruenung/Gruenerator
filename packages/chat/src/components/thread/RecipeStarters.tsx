'use client';

import { useAui } from '@assistant-ui/react';
import { useMemo } from 'react';

import { useRecipeLibrary } from '../../hooks/useRecipeLibrary';
import { getAgentMentionables, type Mentionable } from '../../lib/mentionables';
import { libraryRecipeMentionables } from '../../lib/plusMenu';
import { cn } from '../../lib/utils';
import { useAgentStore } from '../../stores/chatStore';

import { useChatDensity } from './chatDensityContext';

/**
 * Rezepte als Einstieg im leeren Chat: zuerst die gespeicherten aus der
 * Bibliothek, dann die System-Standardrezepte. Ein Klick wählt das Rezept wie
 * das Plus-Menü — `setActiveSkillMention` im Chat-Store, ein Textform-Rezept
 * mit seiner Zeilen-ID — und setzt `@mention` in den Entwurf, damit man sieht,
 * was gilt (ohne Chip im Composer wäre die Wahl unsichtbar).
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
  const composer = useAui().composer;
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

  const select = (m: Mentionable) => {
    useAgentStore
      .getState()
      .setActiveSkillMention(m.mention, m.type === 'textform' ? m.identifier : null);
    composer.setText(`@${m.mention} `);
  };

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
            title={m.description || undefined}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            onClick={() => select(m)}
          >
            {m.title}
          </button>
        </li>
      ))}
    </ul>
  );
}
