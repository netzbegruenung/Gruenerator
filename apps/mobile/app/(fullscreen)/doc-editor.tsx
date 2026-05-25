import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Pressable, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocAiReviewBar } from '../../components/docs/DocAiReviewBar';
import DocEditorDOM from '../../components/docs/DocEditorDOM';
import { GuestBanner } from '../../components/docs/GuestBanner';
import { NativeChatSidebar } from '../../components/docs/NativeChatSidebar';
import { NativeDocTopBar } from '../../components/docs/NativeDocTopBar';
import { NativeFormattingToolbar } from '../../components/docs/NativeFormattingToolbar';
import { NativeShareModal } from '../../components/docs/NativeShareModal';
import { docsService } from '../../services/docs/docsApi';
import { trackDocumentOpen } from '../../services/docs/recentDocs';
import { secureStorage } from '../../services/storage';
import {
  useDocsEditorBridgeStore,
  type ChatMessage,
  type ActiveFormattingState,
} from '../../stores/docsEditorBridgeStore';
import { useDocsStore } from '../../stores/docsStore';
import { lightTheme, darkTheme, colors } from '../../theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_DOCS_API_URL || 'https://gruenerator.eu/api';
const HOCUSPOCUS_URL = process.env.EXPO_PUBLIC_HOCUSPOCUS_URL || 'wss://gruenerator.eu/ws';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.centerContainer}>
      <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
      <Text style={styles.errorTitle}>{error.message || 'Ein Fehler ist aufgetreten'}</Text>
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary[600] }]}
        onPress={retry}
      >
        <Text style={styles.backButtonText}>Erneut versuchen</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [token, setToken] = useState<string | null>(null);
  const [initialTitle, setInitialTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  // Connection diagnostics: the Hocuspocus handshake can fail for auth/access
  // reasons (surfaced via onAuthError) or just never connect (network). Both
  // were previously invisible — only a tiny red dot. Surface a real reason + retry.
  const [authError, setAuthError] = useState<string | null>(null);
  const [connTimedOut, setConnTimedOut] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const store = useDocsEditorBridgeStore;
  const connectionStatus = store((s) => s.connectionStatus);
  const pendingAction = store((s) => s.pendingAction);
  const actionCounter = store((s) => s.actionCounter);
  const aiReviewPending = store((s) => s.aiReviewPending);

  // Load token (fast) — mounts editor immediately
  useEffect(() => {
    if (!id) {
      setError('Keine Dokument-ID angegeben');
      setIsLoading(false);
      return;
    }

    console.log('[DocScreen] Getting token...');
    void secureStorage.getToken().then((authToken) => {
      console.log('[DocScreen] Token:', authToken ? 'present' : 'null');
      if (!authToken) {
        setError('Nicht angemeldet');
        setIsLoading(false);
        return;
      }

      // Use cached title synchronously if available
      const cached = useDocsStore.getState().getCachedDoc(id);
      if (cached) {
        setInitialTitle(cached.title);
        store.getState().setDocumentTitle(cached.title);
      }

      setToken(authToken);
      setIsLoading(false);

      // Fetch metadata + track open in background (non-blocking)
      if (!cached) {
        docsService
          .fetchDocument(id)
          .then((doc) => {
            if (doc) {
              setInitialTitle(doc.title);
              store.getState().setDocumentTitle(doc.title);
            }
          })
          .catch(() => {});
      }
      void trackDocumentOpen(id);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bridge callbacks: DOM → Native
  const handleConnectionStatusChange = useCallback(async (status: string) => {
    store.getState().setConnectionStatus(status as 'connected' | 'syncing' | 'disconnected');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuthError = useCallback(async (reason: string) => {
    setAuthError(reason || 'Authentifizierung fehlgeschlagen');
  }, []);

  const handleRetry = useCallback(() => {
    setAuthError(null);
    setConnTimedOut(false);
    setReloadKey((k) => k + 1); // remount the editor → fresh Hocuspocus connection
  }, []);

  // If the socket hasn't connected within 15s (and no explicit auth error),
  // assume a network/server-reachability problem rather than leaving a bare dot.
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setConnTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      if (useDocsEditorBridgeStore.getState().connectionStatus !== 'connected') {
        setConnTimedOut(true);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [connectionStatus, reloadKey]);

  const handleTitleChange = useCallback(
    async (title: string) => {
      store.getState().setDocumentTitle(title);
      // Persist title change via API
      if (id) {
        try {
          await docsService.updateDocument(id, { title });
        } catch {
          // Silently fail — title is already updated in UI
        }
      }
    },
    [id]
  );

  const handleCanEditChange = useCallback(async (canEdit: boolean) => {
    store.getState().setCanEdit(canEdit);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDocumentLoaded = useCallback(async (doc: { title: string; canEdit: boolean }) => {
    store.getState().setDocumentMeta(doc.title, doc.canEdit);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChatMessagesChange = useCallback(async (messagesJson: string) => {
    try {
      const parsed = JSON.parse(messagesJson) as ChatMessage[];
      // Don't clear existing messages with empty array — happens during DOM re-init
      if (parsed.length === 0 && store.getState().chatMessages.length > 0) return;
      store.getState().setChatMessages(parsed);
    } catch {
      // Ignore parse errors
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocalUserIdChange = useCallback(async (userId: string) => {
    store.getState().setLocalUserId(userId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypingUsersChange = useCallback(async (usersJson: string) => {
    try {
      store.getState().setTypingUsers(JSON.parse(usersJson) as string[]);
    } catch {
      // Ignore parse errors
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActiveStylesChange = useCallback(async (stylesJson: string) => {
    try {
      store.getState().setActiveFormatting(JSON.parse(stylesJson) as ActiveFormattingState);
    } catch {
      // Ignore parse errors
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle openShare action from native top bar
  const [shareModalVisible, setShareModalVisible] = useState(false);

  useEffect(() => {
    if (pendingAction?.type !== 'openShare') return;
    store.getState().clearPendingAction();
    setShareModalVisible(true);
  }, [pendingAction, actionCounter]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Native network proxy for DOM WebView (bypasses CORS) ---

  const handleProxyFetch = useCallback(
    async (url: string, options?: string) => {
      const opts = options
        ? (JSON.parse(options) as {
            method?: string;
            headers?: Record<string, string>;
            body?: BodyInit;
          })
        : ({} as { method?: string; headers?: Record<string, string>; body?: BodyInit });
      const headers: Record<string, string> = { ...opts.headers };
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(url, { ...opts, headers });
      const headersObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      return JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        headers: headersObj,
        body: await response.text(),
      });
    },
    [token]
  );

  // WebSocket proxy: native manages the real WS, DOM communicates via async props
  const wsRef = useRef<WebSocket | null>(null);
  const wsMessageQueue = useRef<string[]>([]);
  const wsResolvers = useRef<Array<(msg: string) => void>>([]);

  const handleWsOpen = useCallback(async (url: string, protocols?: string) => {
    // Close any existing connection to prevent zombie sockets
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    wsMessageQueue.current = [];
    wsResolvers.current.forEach((r) => r('__close__'));
    wsResolvers.current = [];

    return new Promise<string>((resolve, reject) => {
      const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        resolve('open');
      };
      ws.onerror = () => {
        reject(new Error('ws-error'));
      };
      ws.onclose = (e) => {
        if (e.code !== 1000) {
          console.warn('[NativeWS] closed unexpectedly:', e.code, e.reason);
        }
        const resolver = wsResolvers.current.shift();
        if (resolver) resolver('__close__');
        else wsMessageQueue.current.push('__close__');
      };
      ws.onmessage = (e) => {
        let b64: string;
        if (e.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(e.data);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          b64 = btoa(binary);
        } else {
          b64 = 'str:' + btoa(unescape(encodeURIComponent(e.data as string)));
        }
        const resolver = wsResolvers.current.shift();
        if (resolver) {
          resolver(b64);
        } else {
          wsMessageQueue.current.push(b64);
        }
      };
    });
  }, []);

  const handleWsSend = useCallback(async (b64: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (b64.startsWith('str:')) {
      wsRef.current.send(decodeURIComponent(escape(atob(b64.slice(4)))));
    } else {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      wsRef.current.send(bytes.buffer);
    }
  }, []);

  const handleWsReceive = useCallback(async () => {
    const queued = wsMessageQueue.current.shift();
    if (queued) return queued;
    return new Promise<string>((resolve) => wsResolvers.current.push(resolve));
  }, []);

  const handleWsClose = useCallback(async () => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  if (isLoading) {
    return <View style={[styles.container, { backgroundColor: theme.background }]} />;
  }

  if (error || !token || !user) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          {error || 'Ein Fehler ist aufgetreten'}
        </Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary[600] }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color="white" />
          <Text style={styles.backButtonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} hidden={!chromeVisible} />

      {chromeVisible && (
        <>
          <NativeDocTopBar />
          <NativeFormattingToolbar />
          {aiReviewPending && <DocAiReviewBar />}
          <GuestBanner />
        </>
      )}

      <View style={styles.editorContainer}>
        <DocEditorDOM
          key={reloadKey}
          documentId={id!}
          authToken={token}
          userId={user.id}
          userName={user.display_name || user.email || 'Unbekannt'}
          userEmail={user.email || ''}
          initialTitle={initialTitle}
          hocuspocusUrl={HOCUSPOCUS_URL}
          apiBaseUrl={API_BASE_URL}
          colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
          onConnectionStatusChange={handleConnectionStatusChange}
          onAuthError={handleAuthError}
          onTitleChange={handleTitleChange}
          onCanEditChange={handleCanEditChange}
          onDocumentLoaded={handleDocumentLoaded}
          onChatMessagesChange={handleChatMessagesChange}
          onLocalUserIdChange={handleLocalUserIdChange}
          onTypingUsersChange={handleTypingUsersChange}
          onActiveStylesChange={handleActiveStylesChange}
          onDocSnapshotChange={(markdown, selectionText) =>
            store.getState().setDocSnapshot(markdown, selectionText)
          }
          onAiReviewPendingChange={(p) => store.getState().setAiReviewPending(p)}
          proxyFetch={handleProxyFetch}
          wsOpen={handleWsOpen}
          wsSend={handleWsSend}
          wsReceive={handleWsReceive}
          wsClose={handleWsClose}
          pendingAction={pendingAction}
          actionCounter={actionCounter}
          dom={{ scrollEnabled: false }}
        />
      </View>

      <NativeChatSidebar documentId={id!} />
      <NativeShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        documentId={id!}
        userDisplayName={user?.display_name ?? undefined}
        isOwner={true}
      />

      {/* Connection failure banner — auth/access denied or never connected.
          Replaces the silent red dot with the actual server reason + retry. */}
      {(authError || connTimedOut) && (
        <View style={[styles.errorBanner, { top: insets.top + 8, backgroundColor: theme.card }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.error[500]} />
          <Text style={[styles.errorBannerText, { color: theme.text }]} numberOfLines={2}>
            {authError
              ? `Dokument konnte nicht geladen werden: ${authError}`
              : 'Keine Verbindung zum Dokumentenserver.'}
          </Text>
          <Pressable
            onPress={handleRetry}
            style={[styles.retryButton, { backgroundColor: colors.primary[600] }]}
          >
            <Text style={styles.retryButtonText}>Erneut</Text>
          </Pressable>
        </View>
      )}

      {/* Transient connection status dot — only while (re)connecting/syncing */}
      {connectionStatus !== 'connected' && !authError && !connTimedOut && (
        <View style={[styles.statusOverlay, { top: insets.top + 8 }]}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connectionStatus === 'syncing' ? '#f59e0b' : '#ef4444' },
            ]}
          />
        </View>
      )}

      {/* Fullscreen toggle */}
      <Pressable
        onPress={() => setChromeVisible((v) => !v)}
        style={[styles.fab, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <Ionicons
          name={chromeVisible ? 'contract-outline' : 'expand-outline'}
          size={20}
          color={theme.textSecondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  statusOverlay: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  errorBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
