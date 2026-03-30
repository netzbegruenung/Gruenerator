import { useState, useEffect, useRef, useCallback } from 'react';
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
  // Refs for values that should NOT trigger reconnection — only awareness updates
  const userRef = useRef(user);
  userRef.current = user;
  const guestNameRef = useRef(guestName);
  guestNameRef.current = guestName;
  const guestIdRef = useRef(guestId);
  guestIdRef.current = guestId;

  const buildAwarenessUser = useCallback((): CollaborationUser => {
    const u = userRef.current;
    const gId = guestIdRef.current;
    const gName = guestNameRef.current;
    if (isGuest || !u) {
      return { id: gId || 'guest', name: gName || 'Gast', color: generateUserColor() };
    }
    return {
      id: u.id,
      name: u.display_name || u.email || 'Anonymous',
      color: generateUserColor(),
      ...(u.avatar_robot_id ? { avatarRobotId: u.avatar_robot_id } : {}),
    };
  }, [isGuest]);

  // Connection effect — only reconnects when document/config/auth-mode changes
  useEffect(() => {
    if (!documentId) return;
    if (!isGuest && !userRef.current) return;

    let ignore = false;
    const ydoc = new Y.Doc();

    const initProvider = async () => {
      console.info('[Collab] Init | doc:', documentId, '| isGuest:', isGuest, '| url:', config.url);
      const token = isGuest ? null : await config.getToken();
      console.info('[Collab] Token:', token ? 'present' : 'null');

      if (ignore) return;

      const WebSocketPolyfill = config.getWebSocketPolyfill?.();
      const gId = guestIdRef.current;
      const gName = guestNameRef.current;

      const provider = new HocuspocusProvider({
        url: config.url,
        name: documentId,
        document: ydoc,
        token: token ?? undefined,
        ...(WebSocketPolyfill ? { WebSocketPolyfill } : {}),
        ...(isGuest && gId ? { parameters: { guestId: gId, guestName: gName || 'Gast' } } : {}),
      } as ConstructorParameters<typeof HocuspocusProvider>[0]);

      // Disconnect immediately to prevent auto-connect race condition.
      // We reconnect after event listeners are set up.
      provider.disconnect();

      if (ignore) {
        provider.destroy();
        return;
      }

      providerRef.current = provider;
      provider.awareness?.setLocalStateField('user', buildAwarenessUser());

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
          '[Collab] Closed | doc:',
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

      setState({ ydoc, provider, isConnected: false, isSynced: false });
      console.info('[Collab] Connecting to', config.url, '| doc:', documentId);
      provider.connect();
    };

    initProvider();

    return () => {
      console.info('[Collab] Cleanup | doc:', documentId);
      ignore = true;
      providerRef.current?.awareness?.setLocalState(null);
      providerRef.current?.destroy();
      providerRef.current = null;
    };
  }, [documentId, config, isGuest, buildAwarenessUser]);

  // Update awareness when user identity changes — no reconnection needed
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider?.awareness) return;
    provider.awareness.setLocalStateField('user', buildAwarenessUser());
  }, [
    user?.id,
    user?.display_name,
    user?.email,
    user?.avatar_robot_id,
    guestId,
    guestName,
    buildAwarenessUser,
  ]);

  return state;
};
