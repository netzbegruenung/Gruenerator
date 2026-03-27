import { useCallback } from 'react';

import type { HocuspocusProvider } from '@hocuspocus/provider';

import type { CollaborationUser } from '../types';

import { useAwarenessState } from './useAwarenessState';

function arraysEqualByIds(a: CollaborationUser[], b: CollaborationUser[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

export function useCollaborators(provider: HocuspocusProvider | null): CollaborationUser[] {
  const selector = useCallback(
    (states: Map<number, Record<string, unknown>>, localClientId: number) => {
      const users: CollaborationUser[] = [];
      states.forEach((state, clientId) => {
        if (state['user'] && clientId !== localClientId) {
          users.push(state['user'] as CollaborationUser);
        }
      });
      return users;
    },
    []
  );

  return useAwarenessState(provider, selector, arraysEqualByIds);
}
