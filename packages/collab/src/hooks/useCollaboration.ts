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
  user: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_robot_id?: number | null;
  } | null;
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
      console.info(
        '[Collab] Initializing provider for document:',
        documentId,
        '| isGuest:',
        isGuest,
        '| url:',
        config.url
      );
      const token = isGuest ? null : await config.getToken();
      console.info('[Collab] Token resolved:', token ? 'present' : 'null');

      if (ignore) return;

      const WebSocketPolyfill = config.getWebSocketPolyfill?.();

      const provider = new HocuspocusProvider({
        url: config.url,
        name: documentId,
        document: ydoc,
        token: token ?? undefined,
        ...(WebSocketPolyfill ? { WebSocketPolyfill } : {}),
        ...(isGuest && guestId ? { parameters: { guestId, guestName: guestName || 'Gast' } } : {}),
      } as ConstructorParameters<typeof HocuspocusProvider>[0]);

      // Immediately disconnect to prevent the auto-connect race condition.
      // We reconnect explicitly after event listeners are set up.
      provider.disconnect();

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
            ...(user!.avatar_robot_id ? { avatarRobotId: user!.avatar_robot_id } : {}),
          };

      provider.awareness?.setLocalStateField('user', awarenessUser);

      provider.on('status', (event: { status: string }) => {
        console.info('[Collab] Status:', event.status, '| doc:', documentId);
        if (ignore) return;
        const newIsConnected = event.status === 'connected';
        setState((prev) => {
          if (prev.isConnected === newIsConnected) return prev;
          return { ...prev, isConnected: newIsConnected };
        });
      });

      provider.on('synced', () => {
        console.info('[Collab] Synced | doc:', documentId);
        if (ignore) return;
        setState((prev) => {
          if (prev.isSynced) return prev;
          return { ...prev, isSynced: true };
        });
      });

      provider.on('authenticationFailed', (data: { reason: string }) => {
        console.error('[Collab] Auth FAILED:', data.reason, '| doc:', documentId);
      });

      provider.on('close', (event: { event: CloseEvent }) => {
        console.warn(
          '[Collab] Connection closed | doc:',
          documentId,
          '| code:',
          event.event.code,
          '| reason:',
          event.event.reason
        );
      });

      provider.on('disconnect', () => {
        console.warn('[Collab] Disconnected | doc:', documentId);
      });

      if (ignore) {
        provider.destroy();
        return;
      }

      setState({
        ydoc,
        provider,
        isConnected: false,
        isSynced: false,
      });

      if (!ignore) {
        console.info('[Collab] Connecting to', config.url, '| doc:', documentId);
        provider.connect();
      }
    };

    initProvider();

    return () => {
      console.info('[Collab] Cleanup — destroying provider | doc:', documentId);
      ignore = true;
      providerRef.current?.awareness?.setLocalState(null);
      providerRef.current?.destroy();
    };
  }, [documentId, user, config, isGuest, guestId, guestName]);

  return state;
};
