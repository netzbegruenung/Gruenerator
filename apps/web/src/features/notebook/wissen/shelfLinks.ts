import { collectionSlug, type ShelfEntry } from './useNotebookShelves';

// Jedes Notebook öffnet mit frischem Gespräch.
export const OPEN_STATE = { freshConversation: true };

/** Titel und Ziel eines Listeneintrags. */
export function shelfEntryLink(entry: ShelfEntry): {
  title: string;
  to: string;
  state: typeof OPEN_STATE;
} {
  const state = OPEN_STATE;
  switch (entry.kind) {
    case 'system':
      return { title: entry.notebook.title, to: entry.notebook.path, state };
    case 'own':
    case 'shared':
      return {
        title: entry.collection.name,
        to: `/notebooks/${collectionSlug(entry.collection)}`,
        state,
      };
    case 'saved':
      return { title: entry.item.title, to: `/notebooks/${entry.item.notebook.slug}`, state };
  }
}
