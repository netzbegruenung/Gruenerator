import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { prefetchNotebookCollection } from './hooks/useNotebookCollection';
import { loadNotebookPage } from './routeChunks';

/**
 * Start what a click on a notebook link will wait for: the page's chunk and,
 * for a user notebook (`slugOrId`), its collection.
 */
export function useNotebookPrefetch() {
  const queryClient = useQueryClient();
  return useCallback(
    (slugOrId?: string) => {
      void loadNotebookPage();
      if (slugOrId) void prefetchNotebookCollection(queryClient, slugOrId);
    },
    [queryClient]
  );
}
