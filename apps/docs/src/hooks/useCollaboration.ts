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

const HOCUSPOCUS_URL =
  import.meta.env.VITE_HOCUSPOCUS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

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
  const [state, setState] = useState<CollaborationState>(() => {
    return {
      ydoc: new Y.Doc(),
      provider: null,
      isConnected: false,
      isSynced: false,
    };
  });

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const mountCountRef = useRef(0);

  useEffect(() => {
    mountCountRef.current++;

    if (!documentId || !user) {
      return;
    }
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
      const newIsConnected = event.status === 'connected';
      setState((prev) => {
        // Only update if value actually changed to prevent unnecessary re-renders
        if (prev.isConnected === newIsConnected) {
          return prev;
        }
        return {
          ...prev,
          isConnected: newIsConnected,
        };
      });
    });

    provider.on('synced', () => {
      setState((prev) => {
        if (prev.isSynced) {
          return prev;
        }
        return {
          ...prev,
          isSynced: true,
        };
      });
    });

    provider.on('disconnect', () => {});

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
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

    const updateCollaborators = () => {
      // Cancel any pending update to avoid stale state
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }

      // Defer state update to avoid "setState during render" warning
      // This happens when BlockNote sets awareness state during initialization
      pendingUpdateRef.current = setTimeout(() => {
        const states = awareness.getStates();
        const users: CollaborationUser[] = [];

        states.forEach((state, clientId) => {
          if (state.user && clientId !== awareness.clientID) {
            users.push(state.user as CollaborationUser);
          }
        });

        // Only update if collaborators actually changed
        setCollaborators((prev) => {
          const prevIds = prev
            .map((u) => u.id)
            .sort()
            .join(',');
          const newIds = users
            .map((u) => u.id)
            .sort()
            .join(',');
          if (prevIds === newIds) {
            return prev;
          }
          return users;
        });
        pendingUpdateRef.current = null;
      }, 0);
    };

    // Update on awareness changes
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
