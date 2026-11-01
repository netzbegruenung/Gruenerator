// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';

import { createDocCacheRegistry, type DocCacheStorage } from './docCacheRegistry.js';

export interface CollaborationConfig {
  url: string;
  getToken: () => Promise<string | null>;
  getWebSocketPolyfill?: () => (new (...args: unknown[]) => WebSocket) | undefined;
}

/** What the session does after the server rejected the connection. */
export interface AuthFailureVerdict {
  /** Retrying cannot help: stop reconnecting for this document. */
  durable: boolean;
  /** The document is gone for this user: delete its offline cache. */
  dropLocalCache: boolean;
}

export interface CollaborationState {
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  isConnected: boolean;
  isSynced: boolean;
  isLocalLoaded: boolean;
  authError: string | null;
  /** The server authenticated this connection as `readonly`: it drops every update we send. */
  isReadOnly: boolean;
}

export interface UseCollaborationOptions {
  /** Room name on the server; also names the offline cache. */
  documentId: string;
  /** Keep its identity stable: a new object reconnects. */
  config: CollaborationConfig;
  /** Connect without asking `config.getToken` (a guest). Changing it reconnects. */
  anonymous?: boolean;
  /**
   * Read when the connection effect runs (on a new document, config or
   * `anonymous`); flipping it alone neither connects nor disconnects.
   * Default true.
   */
  canConnect?: boolean;
  /**
   * The local awareness `user` state. Called when the provider is created and
   * again whenever this function's identity changes — memoise it on the
   * identity fields so a rename republishes without reconnecting.
   */
  getAwarenessUser: () => unknown;
  /** Extra connection parameters, read when the provider is created. */
  getParameters?: () => Record<string, string> | null;
  /** Offline cache in IndexedDB. Null or absent: no local cache. */
  localCache?: DocCacheStorage | null;
  /** Rooms that get an offline cache. Default: every room. */
  isCachedRoom?: (documentId: string) => boolean;
  /** Default: every rejection is durable and keeps the cache. */
  classifyAuthFailure?: (reason: string) => AuthFailureVerdict;
}

const DURABLE_KEEP_CACHE: AuthFailureVerdict = { durable: true, dropLocalCache: false };
const cacheEveryRoom = () => true;

export const useCollaboration = ({
  documentId,
  config,
  anonymous = false,
  canConnect = true,
  getAwarenessUser,
  getParameters,
  localCache = null,
  isCachedRoom = cacheEveryRoom,
  classifyAuthFailure,
}: UseCollaborationOptions): CollaborationState => {
  const [state, setState] = useState<CollaborationState>(() => ({
    ydoc: new Y.Doc(),
    provider: null,
    isConnected: false,
    isSynced: false,
    isLocalLoaded: false,
    authError: null,
    isReadOnly: false,
  }));

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const idbProviderRef = useRef<IndexeddbPersistence | null>(null);
  // Values that must NOT trigger a reconnection: read when the effect runs.
  const hostRef = useRef({
    canConnect,
    getAwarenessUser,
    getParameters,
    localCache,
    isCachedRoom,
    classifyAuthFailure,
  });
  hostRef.current = {
    canConnect,
    getAwarenessUser,
    getParameters,
    localCache,
    isCachedRoom,
    classifyAuthFailure,
  };

  // Connection effect — only reconnects when document/config/auth-mode changes
  useEffect(() => {
    if (!documentId) return;
    if (!hostRef.current.canConnect) return;

    let ignore = false;
    let idbTimeout: ReturnType<typeof setTimeout> | null = null;
    const ydoc = new Y.Doc();
    const cacheStorage = hostRef.current.localCache;
    const cache = cacheStorage ? createDocCacheRegistry(cacheStorage) : null;

    // Exposes this effect's doc as soon as the local cache is in it, so a host
    // can render it before the server sync. A doc from an earlier effect run
    // never counts as synced for this one.
    const markLocalLoaded = () =>
      setState((prev) => {
        if (prev.ydoc !== ydoc) {
          return {
            ...prev,
            ydoc,
            provider: null,
            isConnected: false,
            isSynced: false,
            isLocalLoaded: true,
            isReadOnly: false,
          };
        }
        return prev.isLocalLoaded ? prev : { ...prev, isLocalLoaded: true };
      });

    if (cache && hostRef.current.isCachedRoom(documentId)) {
      try {
        const dbName = cache.dbName(documentId);
        const idbProvider = new IndexeddbPersistence(dbName, ydoc);
        idbProviderRef.current = idbProvider;
        idbProvider.on('synced', () => {
          if (ignore) return;
          markLocalLoaded();
        });
        // A slow IDB open is NOT corruption — slow disks/mobile/large docs hit
        // this regularly, and the cache may be the user's only copy while
        // offline. On timeout just proceed without the local cache for this
        // session (server state arrives over the websocket; IDB may still
        // finish syncing in the background).
        idbTimeout = setTimeout(() => {
          if (ignore || idbProvider.synced) return;
          console.warn(
            '[Collab] IndexedDB sync timeout — proceeding without local cache | doc:',
            documentId
          );
          markLocalLoaded();
        }, 10000);
        void idbProvider.whenSynced.then(() => {
          if (idbTimeout) clearTimeout(idbTimeout);
        });
        // Only an actual IDB open error means the cache is unusable — drop it
        // so the next visit starts clean. (whenSynced never rejects; the
        // underlying openDB promise is `_db`.) An AbortError is the browser
        // closing the connection (page unload, tab freeze), not corruption —
        // keep the cache then, it may hold unsynced edits.
        idbProvider._db.catch((err: unknown) => {
          if (ignore) return;
          void idbProvider.destroy();
          idbProviderRef.current = null;
          if (String(err).includes('AbortError')) {
            console.warn('[Collab] IndexedDB connection closed | doc:', documentId);
          } else {
            console.warn('[Collab] IndexedDB error — clearing local cache | doc:', documentId);
            try {
              indexedDB.deleteDatabase(dbName);
            } catch {
              /* best-effort */
            }
          }
          markLocalLoaded();
        });
        cache.registerAccess(documentId);
      } catch (err) {
        console.warn('[Collab] IndexedDB unavailable, continuing without local cache:', err);
        markLocalLoaded();
      }
    } else {
      markLocalLoaded();
    }

    const initProvider = async () => {
      const token = anonymous ? null : await config.getToken();

      if (ignore) return;

      const WebSocketPolyfill = config.getWebSocketPolyfill?.();
      const parameters = hostRef.current.getParameters?.() ?? null;

      const provider = new HocuspocusProvider({
        url: config.url,
        name: documentId,
        document: ydoc,
        token: token ?? undefined,
        // Connect only once the listeners below are attached.
        autoConnect: false,
        ...(WebSocketPolyfill ? { WebSocketPolyfill } : {}),
        ...(parameters ? { parameters } : {}),
      } as ConstructorParameters<typeof HocuspocusProvider>[0]);

      providerRef.current = provider;
      provider.awareness?.setLocalStateField('user', hostRef.current.getAwarenessUser());

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

      provider.on('authenticated', ({ scope }: { scope: string }) => {
        if (ignore) return;
        const isReadOnly = scope === 'readonly';
        setState((prev) => (prev.isReadOnly === isReadOnly ? prev : { ...prev, isReadOnly }));
      });

      provider.on('authenticationFailed', (data: { reason: string }) => {
        console.error('[Collab] Auth FAILED:', data.reason, '| doc:', documentId);
        if (ignore) return;
        const reason = data.reason || '';
        const verdict = hostRef.current.classifyAuthFailure?.(reason) ?? DURABLE_KEEP_CACHE;
        if (verdict.dropLocalCache && cache) {
          // Tear the live IndexedDB provider down BEFORE deleting its database.
          // destroy() synchronously detaches the Yjs `update` observer, so no
          // further write is queued; the registry can then delete the DB
          // safely. Skipping this lets a subsequent Yjs write (e.g. a paste)
          // race the pending deleteDatabase and throw "InvalidStateError: the
          // database connection is closing".
          void idbProviderRef.current?.destroy();
          idbProviderRef.current = null;
          cache.remove(documentId);
        }
        if (verdict.durable) {
          // A durable rejection is one retrying can never resolve — the
          // websocket layer otherwise retries forever with exponential
          // backoff (capped at ~30s), reconnecting to a doc the user will
          // never regain access to until they reload. Stop it;
          // provider.connect() below never fires again for this effect
          // instance.
          provider.disconnect();
        }
        setState((prev) => ({ ...prev, authError: reason }));
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

      setState((prev) => ({
        ...prev,
        ydoc,
        provider,
        isConnected: false,
        isSynced: false,
        isReadOnly: false,
      }));
      provider.connect();
    };

    void initProvider();

    return () => {
      ignore = true;
      if (idbTimeout) clearTimeout(idbTimeout);
      providerRef.current?.awareness?.setLocalState(null);
      providerRef.current?.destroy();
      providerRef.current = null;
      void idbProviderRef.current?.destroy();
      idbProviderRef.current = null;
    };
  }, [documentId, config, anonymous]);

  // Republish awareness when the user identity changes — no reconnection needed
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider?.awareness) return;
    provider.awareness.setLocalStateField('user', getAwarenessUser());
  }, [getAwarenessUser]);

  return state;
};
