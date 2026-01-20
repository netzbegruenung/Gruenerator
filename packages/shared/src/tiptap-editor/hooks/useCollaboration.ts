import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useAuthStore } from '../../stores';

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

export interface UseCollaborationOptions {
  url?: string;
  token?: string;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
}

const generateUserColor = () => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export const useCollaboration = (
  documentId: string,
  options?: UseCollaborationOptions
) => {
  const authUser = useAuthStore((state) => state.user);
  const user = options?.user || authUser;

  const [state, setState] = useState<CollaborationState>({
    ydoc: new Y.Doc(),
    provider: null,
    isConnected: false,
    isSynced: false,
  });

  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!documentId || !user) return;

    // Support various environment configurations
    const hocuspocusUrl = options?.url ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_HOCUSPOCUS_URL) ||
      (typeof window !== 'undefined' ? (window as any).__HOCUSPOCUS_URL__ : undefined) ||
      (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_HOCUSPOCUS_URL : undefined) ||
      'ws://localhost:1240';

    const ydoc = new Y.Doc();

    const provider = new HocuspocusProvider({
      url: hocuspocusUrl,
      name: documentId,
      document: ydoc,
      token: options?.token,
    });

    providerRef.current = provider;

    const awarenessUser: CollaborationUser = {
      id: user.id,
      name: (user as any).display_name || (user as any).name || user.email || 'Anonymous',
      color: generateUserColor(),
    };

    provider.awareness?.setLocalStateField('user', awarenessUser);

    provider.on('status', (event: { status: string }) => {
      setState((prev) => ({
        ...prev,
        isConnected: event.status === 'connected',
      }));
    });

    provider.on('synced', () => {
      setState((prev) => ({
        ...prev,
        isSynced: true,
      }));
    });

    setState({
      ydoc,
      provider,
      isConnected: false,
      isSynced: false,
    });

    return () => {
      provider.awareness?.setLocalState(null);
      provider.destroy();
    };
  }, [documentId, user?.id, options?.url, options?.token]);

  return state;
};

export const useCollaborators = (provider: HocuspocusProvider | null) => {
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);

  useEffect(() => {
    if (!provider?.awareness) return;

    const awareness = provider.awareness;

    const updateCollaborators = () => {
      const states = awareness.getStates();
      const users: CollaborationUser[] = [];

      states.forEach((state, clientId) => {
        if (state.user && clientId !== awareness.clientID) {
          users.push(state.user as CollaborationUser);
        }
      });

      setCollaborators(users);
    };

    awareness.on('change', updateCollaborators);
    updateCollaborators();

    return () => {
      awareness.off('change', updateCollaborators);
    };
  }, [provider]);

  return collaborators;
};
