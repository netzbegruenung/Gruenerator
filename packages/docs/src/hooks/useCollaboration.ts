import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { generateUserColor, type CollaborationUser } from '@gruenerator/collab';
import { useDocsAdapter } from '../context/DocsContext';

interface CollaborationState {
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  isConnected: boolean;
  isSynced: boolean;
}

export interface UseCollaborationOptions {
  documentId: string;
  user: { id: string; display_name?: string; email?: string } | null;
  isGuest?: boolean;
  guestId?: string;
  guestName?: string;
}

export const useCollaboration = ({
  documentId,
  user,
  isGuest,
  guestId,
  guestName,
}: UseCollaborationOptions) => {
  const adapter = useDocsAdapter();
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

    const ydoc = new Y.Doc();

    const initProvider = async () => {
      const url = adapter.getHocuspocusUrl();
      const token = isGuest ? null : await adapter.getHocuspocusToken();

      console.log('[DocsDebug][useCollaboration] initProvider:', {
        url,
        documentId,
        isGuest: !!isGuest,
        hasToken: !!token,
        tokenLength: token?.length,
        tokenPrefix: token?.substring(0, 20) + '...',
      });

      const WebSocketPolyfill = adapter.getWebSocketPolyfill?.();

      const provider = new HocuspocusProvider({
        url,
        name: documentId,
        document: ydoc,
        token: token ?? undefined,
        ...(WebSocketPolyfill ? { WebSocketPolyfill } : {}),
        ...(isGuest && guestId ? { parameters: { guestId, guestName: guestName || 'Gast' } } : {}),
      });

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
        console.log('[DocsDebug][useCollaboration] status event:', event.status);
        const newIsConnected = event.status === 'connected';
        setState((prev) => {
          if (prev.isConnected === newIsConnected) return prev;
          return { ...prev, isConnected: newIsConnected };
        });
      });

      provider.on('synced', () => {
        console.log('[DocsDebug][useCollaboration] synced!');
        setState((prev) => {
          if (prev.isSynced) return prev;
          return { ...prev, isSynced: true };
        });
      });

      // Log connection errors — this is the most likely failure point
      provider.on('close', (event: { event: CloseEvent }) => {
        console.warn('[DocsDebug][useCollaboration] WebSocket closed:', {
          code: event.event.code,
          reason: event.event.reason,
          wasClean: event.event.wasClean,
        });
      });

      provider.on('disconnect', () => {
        console.warn('[DocsDebug][useCollaboration] disconnected');
      });

      // HocuspocusProvider emits 'authenticationFailed' if server rejects token
      provider.on('authenticationFailed', (data: { reason: string }) => {
        console.error('[DocsDebug][useCollaboration] AUTH FAILED:', data.reason);
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
  }, [documentId, user, isGuest, guestId, guestName, adapter]);

  return state;
};
