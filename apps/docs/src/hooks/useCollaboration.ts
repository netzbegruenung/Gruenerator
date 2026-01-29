import { HocuspocusProvider } from '@hocuspocus/provider';
import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { useAuthStore } from '../stores/authStore';

interface CollaborationState {
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  isConnected: boolean;
  isSynced: boolean;
}

interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

const HOCUSPOCUS_URL = import.meta.env.VITE_HOCUSPOCUS_URL || 'ws://localhost:1240';

// Generate a random color for the user
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

export const useCollaboration = (documentId: string) => {
  const user = useAuthStore((state) => state.user);
  const [state, setState] = useState<CollaborationState>({
    ydoc: new Y.Doc(),
    provider: null,
    isConnected: false,
    isSynced: false,
  });

  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!documentId || !user) return;

    const ydoc = new Y.Doc();

    // Create Hocuspocus provider
    const provider = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: documentId,
      document: ydoc,
    });

    providerRef.current = provider;

    // Set user awareness (presence)
    const awarenessUser: CollaborationUser = {
      id: user.id,
      name: user.display_name || user.email || 'Anonymous',
      color: generateUserColor(),
    };

    provider.awareness?.setLocalStateField('user', awarenessUser);

    // Connection status handlers
    provider.on('status', (event: { status: string }) => {
      console.log('[Hocuspocus] Status event:', event.status);
      setState((prev) => ({
        ...prev,
        isConnected: event.status === 'connected',
      }));
    });

    provider.on('synced', () => {
      console.log('[Hocuspocus] Synced event');
      setState((prev) => ({
        ...prev,
        isSynced: true,
      }));
    });

    provider.on('connect', () => {
      console.log('[Hocuspocus] Connected event');
    });

    provider.on('disconnect', () => {
      console.log('[Hocuspocus] Disconnected event');
    });

    setState({
      ydoc,
      provider,
      isConnected: false,
      isSynced: false,
    });

    // Cleanup on unmount
    return () => {
      provider.awareness?.setLocalState(null);
      provider.destroy();
    };
  }, [documentId, user]);

  return state;
};

// Hook to get current collaborators from awareness
export const useCollaborators = (provider: HocuspocusProvider | null) => {
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

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

    // Update on awareness changes
    awareness.on('change', updateCollaborators);
    updateCollaborators();

    return () => {
      awareness.off('change', updateCollaborators);
    };
  }, [provider]);

  return collaborators;
};
