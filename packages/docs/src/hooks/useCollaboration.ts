import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useDocsAdapter } from '../context/DocsContext';

interface CollaborationState {
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  isConnected: boolean;
  isSynced: boolean;
}

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

const generateUserColor = () => {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E2',
    '#F8B739',
    '#52B788',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

interface UseCollaborationOptions {
  documentId: string;
  user: { id: string; display_name?: string; email?: string } | null;
}

export const useCollaboration = ({ documentId, user }: UseCollaborationOptions) => {
  const adapter = useDocsAdapter();
  const [state, setState] = useState<CollaborationState>(() => ({
    ydoc: new Y.Doc(),
    provider: null,
    isConnected: false,
    isSynced: false,
  }));

  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!documentId || !user) return;

    const ydoc = new Y.Doc();

    const initProvider = async () => {
      const url = adapter.getHocuspocusUrl();
      const token = await adapter.getHocuspocusToken();

      const provider = new HocuspocusProvider({
        url,
        name: documentId,
        document: ydoc,
        token: token ?? undefined,
      });

      providerRef.current = provider;

      const awarenessUser: CollaborationUser = {
        id: user.id,
        name: user.display_name || user.email || 'Anonymous',
        color: generateUserColor(),
      };

      provider.awareness?.setLocalStateField('user', awarenessUser);

      provider.on('status', (event: { status: string }) => {
        const newIsConnected = event.status === 'connected';
        setState((prev) => {
          if (prev.isConnected === newIsConnected) return prev;
          return { ...prev, isConnected: newIsConnected };
        });
      });

      provider.on('synced', () => {
        setState((prev) => {
          if (prev.isSynced) return prev;
          return { ...prev, isSynced: true };
        });
      });

      setState({
        ydoc,
        provider,
        isConnected: false,
        isSynced: false,
      });
    };

    initProvider();

    return () => {
      providerRef.current?.awareness?.setLocalState(null);
      providerRef.current?.destroy();
    };
  }, [documentId, user, adapter]);

  return state;
};

export const useCollaborators = (provider: HocuspocusProvider | null) => {
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

    const updateCollaborators = () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }

      pendingUpdateRef.current = setTimeout(() => {
        const states = awareness.getStates();
        const users: CollaborationUser[] = [];

        states.forEach((state, clientId) => {
          if (state.user && clientId !== awareness.clientID) {
            users.push(state.user as CollaborationUser);
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
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, [provider]);

  return collaborators;
};
