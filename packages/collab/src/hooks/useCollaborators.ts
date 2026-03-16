import { useState, useEffect, useRef } from 'react';

import type { HocuspocusProvider } from '@hocuspocus/provider';

import type { CollaborationUser } from '../types';

export function useCollaborators(provider: HocuspocusProvider | null): CollaborationUser[] {
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!provider) return;
    const awareness = provider.awareness;
    if (!awareness) return;

    const updateCollaborators = () => {
      if (pendingUpdateRef.current) clearTimeout(pendingUpdateRef.current);

      pendingUpdateRef.current = setTimeout(() => {
        const states = awareness.getStates();
        const users: CollaborationUser[] = [];

        states.forEach((state, clientId) => {
          if (state['user'] && clientId !== awareness.clientID) {
            users.push(state['user'] as CollaborationUser);
          }
        });

        setCollaborators((prev) => {
          const prevIds = prev
            .map((u) => u.id)
            .sort()
            .join(',');
          const newIds = users
            .map((u) => u.id)
            .sort()
            .join(',');
          if (prevIds === newIds) return prev;
          return users;
        });
        pendingUpdateRef.current = null;
      }, 0);
    };

    awareness.on('change', updateCollaborators);
    updateCollaborators();

    return () => {
      awareness.off('change', updateCollaborators);
      if (pendingUpdateRef.current) clearTimeout(pendingUpdateRef.current);
    };
  }, [provider]);

  return collaborators;
}
