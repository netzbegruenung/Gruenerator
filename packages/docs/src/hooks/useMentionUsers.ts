import { useCallback, useRef } from 'react';
import { type BlockNoteEditor } from '@blocknote/core';
import { type DefaultReactSuggestionItem } from '@blocknote/react';
import { type HocuspocusProvider } from '@hocuspocus/provider';
import { useDocsAdapter } from '../context/DocsContext';
import { type CollaborationUser } from './useCollaboration';

interface SearchUser {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
}

export function useMentionUsers(provider: HocuspocusProvider | null) {
  const adapter = useDocsAdapter();
  const abortRef = useRef<AbortController | null>(null);

  const getMentionMenuItems = useCallback(
    async (
      editor: BlockNoteEditor<any, any, any>,
      query: string
    ): Promise<DefaultReactSuggestionItem[]> => {
      const seen = new Set<string>();
      const items: DefaultReactSuggestionItem[] = [];

      // 1. Awareness-based collaborators (instant, no network)
      if (provider?.awareness) {
        const states = provider.awareness.getStates();
        states.forEach((state) => {
          const user = state.user as CollaborationUser | undefined;
          if (!user?.id || !user?.name) return;

          const lowerQuery = query.toLowerCase();
          if (lowerQuery && !user.name.toLowerCase().includes(lowerQuery)) return;

          if (seen.has(user.id)) return;
          seen.add(user.id);

          items.push({
            title: user.name,
            onItemClick: () => {
              editor.insertInlineContent([
                { type: 'mention', props: { userId: user.id, userName: user.name } },
                ' ',
              ]);
            },
          });
        });
      }

      // 2. Server search for users not currently online (2+ char query)
      if (query.length >= 2) {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const url = `${adapter.getApiBaseUrl()}/api/users/search?q=${encodeURIComponent(query)}`;
          const response = await adapter.fetch(url, { signal: controller.signal });

          if (response.ok) {
            const users: SearchUser[] = await response.json();

            for (const user of users) {
              if (seen.has(user.id)) continue;
              seen.add(user.id);

              const displayName = user.display_name || user.email;
              items.push({
                title: displayName,
                onItemClick: () => {
                  editor.insertInlineContent([
                    { type: 'mention', props: { userId: user.id, userName: displayName } },
                    ' ',
                  ]);
                },
              });
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('[MentionUsers] Search failed:', err);
          }
        }
      }

      return items;
    },
    [provider, adapter]
  );

  return getMentionMenuItems;
}
