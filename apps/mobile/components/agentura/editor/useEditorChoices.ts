import { useOwnRecipes, usePublicRecipes, type FormState } from '@gruenerator/shared/grueneratoren';
import { useAuth } from '@gruenerator/shared/hooks';
import { useMemo } from 'react';

import { getVisibleNotebooks, MOBILE_SYSTEM_NOTEBOOKS } from '../../../config/notebooksConfig';
import { useAgenturaCatalog } from '../../../hooks/agents/useAgenturaCatalog';
import { useNotebookCollections } from '../../../hooks/useNotebookCollections';

import { customRecipeOptions } from './agentEditorLogic';

export interface NotebookChoice {
  id: string;
  title: string;
}

/**
 * Notebooks, die ein Agent als Wissen bekommen kann: die für die Region
 * sichtbaren System-Notebooks plus die eigenen. Ein schon gewähltes
 * System-Notebook, das hier sonst fehlte (andere Region), bleibt in der Liste,
 * damit es sich wieder abwählen lässt.
 */
export function useNotebookChoices(selectedIds: readonly string[]) {
  const { locale } = useAuth();
  const { collections, isLoading } = useNotebookCollections();

  const system = useMemo((): NotebookChoice[] => {
    const visible = getVisibleNotebooks(locale);
    const visibleIds = new Set(visible.map((nb) => nb.id));
    const extra = MOBILE_SYSTEM_NOTEBOOKS.filter(
      (nb) => selectedIds.includes(nb.id) && !visibleIds.has(nb.id)
    );
    return [...visible, ...extra].map((nb) => ({ id: nb.id, title: nb.title }));
  }, [locale, selectedIds]);

  const own = useMemo(
    (): NotebookChoice[] => collections.map((c) => ({ id: String(c.id), title: c.name })),
    [collections]
  );

  const titleFor = (id: string): string | null =>
    system.find((nb) => nb.id === id)?.title ?? own.find((nb) => nb.id === id)?.title ?? null;

  return { system, own, ownLoading: isLoading, titleFor };
}

/** System-Rezepte (wie die Agentura gefiltert) und eigene/öffentliche Rezepte. */
export function useRecipeChoices() {
  const { skills } = useAgenturaCatalog();
  // Der geteilte Hook, nicht der mobile: wie im Web zählen hier auch Rezepte,
  // die in ein Projekt geteilt wurden.
  const ownQ = useOwnRecipes(true);
  const publicQ = usePublicRecipes(true);

  const custom = useMemo(
    () => customRecipeOptions(ownQ.data ?? [], publicQ.data ?? []),
    [ownQ.data, publicQ.data]
  );

  const titleFor = (form: Pick<FormState, 'defaultRecipeMention' | 'defaultRecipeId'>) => {
    if (form.defaultRecipeId) {
      const hit = custom.find((o) => o.id === form.defaultRecipeId);
      if (hit) return hit.title;
    }
    if (form.defaultRecipeMention) {
      const sys = skills.find((s) => s.mention === form.defaultRecipeMention);
      return sys?.title ?? `@${form.defaultRecipeMention}`;
    }
    return null;
  };

  return {
    system: skills,
    custom,
    customLoading: ownQ.isPending || publicQ.isPending,
    titleFor,
  };
}
