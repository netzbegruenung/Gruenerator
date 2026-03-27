import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

import { generateUserColor } from '../utils';

import type { CollaborationUser } from '../types';

export interface CollaborationConfig {
  url: string;
  getToken: () => Promise<string | null>;
  getWebSocketPolyfill?: () => (new (...args: unknown[]) => WebSocket) | undefined;
}

interface CollaborationState {
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  isConnected: boolean;
  isSynced: boolean;
}

export interface UseCollaborationOptions {
  documentId: string;
  user: { id: string; display_name?: string; email?: string } | null;
  config: CollaborationConfig;
  isGuest?: boolean;
  guestId?: string;
  guestName?: string;
}

export const useCollaboration = ({
  documentId,
  user,
  config,
  isGuest,
  guestId,
  guestName,
}: UseCollaborationOptions) => {
  const [state, setState] = useState<CollaborationState>(() => ({
    ydoc: new Y.Doc(),
    provider: null,
    isConnected: false,
    isSynced: false,
  }));

  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!documentId) return;
    if (!isGuest && !user) return;

    let ignore = false;
    const ydoc = new Y.Doc();

    const initProvider = async () => {
      const token = isGuest ? null : await config.getToken();

      if (ignore) return;

      const WebSocketPolyfill = config.getWebSocketPolyfill?.();

      const provider = new HocuspocusProvider({
        url: config.url,
        name: documentId,
        document: ydoc,
        token: token ?? undefined,
        connect: false,
        maxAttempts: 15,
        delay: 3000,
        ...(WebSocketPolyfill ? { WebSocketPolyfill } : {}),
        ...(isGuest && guestId ? { parameters: { guestId, guestName: guestName || 'Gast' } } : {}),
      });

      if (ignore) {
        provider.destroy();
        return;
      }

      providerRef.current = provider;

      const awarenessUser: CollaborationUser = isGuest
        ? { id: guestId || 'guest', name: guestName || 'Gast', color: generateUserColor() }
        : {
            id: user!.id,
            name: user!.display_name || user!.email || 'Anonymous',
            color: generateUserColor(),
          };

      provider.awareness?.setLocalStateField('user', awarenessUser);

      provider.on('status', (event: { status: string }) => {
        if (ignore) return;
        const newIsConnected = event.status === 'connected';
        setState((prev) => {
          if (prev.isConnected === newIsConnected) return prev;
          return { ...prev, isConnected: newIsConnected };
        });
      });

      provider.on('synced', () => {
        if (ignore) return;
        setState((prev) => {
          if (prev.isSynced) return prev;
          return { ...prev, isSynced: true };
        });
      });

      provider.on('authenticationFailed', (data: { reason: string }) => {
        console.warn('[Hocuspocus] Auth failed:', data.reason);
      });

      setState({
        ydoc,
        provider,
        isConnected: false,
        isSynced: false,
      });

      provider.connect();
    };

    initProvider();

    return () => {
      ignore = true;
      providerRef.current?.awareness?.setLocalState(null);
      providerRef.current?.destroy();
    };
  }, [documentId, user, config, isGuest, guestId, guestName]);

  return state;
};
