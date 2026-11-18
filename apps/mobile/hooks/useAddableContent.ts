import { getContractsClient } from '@gruenerator/shared/api';
import { type AddableItem, type GroupFeedKind } from '@gruenerator/shared/groups';
import { useUserAgents } from '@gruenerator/shared/grueneratoren';
import { useAuthStore } from '@gruenerator/shared/stores';
import { useQuery } from '@tanstack/react-query';

import { useOwnRecipes } from './agents/useOwnRecipes';

export interface AddableSection {
  kind: GroupFeedKind;
  title: string;
  items: AddableItem[];
}

interface OwnedLists {
  notebooks: AddableItem[];
  docs: AddableItem[];
  boards: AddableItem[];
}

/**
 * Nur Eigenes: der Server lässt fremde Inhalte ohnehin nicht teilen
 * (`NOT_OWNER`), und eine Liste voller Absagen hilft niemandem. Die Listen
 * für Docs und Boards enthalten auch, was andere mit einem teilen.
 */
async function fetchOwned(userId: string): Promise<OwnedLists> {
  const client = getContractsClient();
  const [notebooks, docs, boards] = await Promise.all([
    client.notebookCollections.listCollections(),
    client.docs.listDocuments({ query: { preview: 'true' } }),
    client.boards.listBoards(),
  ]);
  return {
    notebooks:
      notebooks.status === 200
        ? notebooks.body.collections
            .filter((c) => c.user_id === userId)
            .map((c) => ({ contentType: 'notebook_collections', id: c.id, title: c.name }))
        : [],
    docs:
      docs.status === 200
        ? docs.body
            .filter((d) => d.created_by === userId)
            .map((d) => ({ contentType: 'collaborative_documents', id: d.id, title: d.title }))
        : [],
    boards:
      boards.status === 200
        ? boards.body
            .filter((b) => b.created_by === userId)
            .map((b) => ({ contentType: 'collaborative_documents', id: b.id, title: b.title }))
        : [],
  };
}

/** Was die Person in ein Projekt legen kann — Abschnitte in der Reihenfolge der Auswahl. */
export function useAddableContent(): { sections: AddableSection[]; isPending: boolean } {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const agents = useUserAgents();
  const recipes = useOwnRecipes();
  const owned = useQuery({
    queryKey: ['add-to-project', userId],
    queryFn: () => fetchOwned(userId ?? ''),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const sections: AddableSection[] = [
    {
      kind: 'agent',
      title: 'Agents',
      items: (agents.data ?? []).flatMap((a): AddableItem[] =>
        a.id ? [{ contentType: 'user_agents', id: a.id, title: a.title }] : []
      ),
    },
    {
      kind: 'recipe',
      title: 'Rezepte',
      items: (recipes.data ?? []).map((f) => ({
        contentType: 'user_text_forms',
        id: f.id,
        title: f.title,
      })),
    },
    { kind: 'notebook', title: 'Notebooks', items: owned.data?.notebooks ?? [] },
    { kind: 'doc', title: 'Docs', items: owned.data?.docs ?? [] },
    { kind: 'board', title: 'Boards', items: owned.data?.boards ?? [] },
  ];

  return {
    sections: sections.filter((s) => s.items.length > 0),
    isPending: agents.isPending || recipes.isPending || (!!userId && owned.isPending),
  };
}
