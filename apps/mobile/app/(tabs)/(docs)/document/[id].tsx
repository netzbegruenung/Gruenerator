import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@gruenerator/shared/stores';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';

import DocEditorDOM from '../../../../components/docs/DocEditorDOM';
import { GuestBanner } from '../../../../components/docs/GuestBanner';
import { NativeChatSidebar } from '../../../../components/docs/NativeChatSidebar';
import { NativeDocTopBar } from '../../../../components/docs/NativeDocTopBar';
import { NativeFormattingToolbar } from '../../../../components/docs/NativeFormattingToolbar';
import { NativeShareModal } from '../../../../components/docs/NativeShareModal';
import { secureStorage } from '../../../../services/storage';
import { docsService } from '../../../../services/docs/docsApi';
import { trackDocumentOpen } from '../../../../services/docs/recentDocs';
import { useDocsEditorBridgeStore } from '../../../../stores/docsEditorBridgeStore';
import { useDocsStore } from '../../../../stores/docsStore';
import { lightTheme, darkTheme, colors } from '../../../../theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_DOCS_API_URL || 'https://docs.gruenerator.eu/api';
const HOCUSPOCUS_URL = process.env.EXPO_PUBLIC_HOCUSPOCUS_URL || 'wss://docs.gruenerator.eu/ws';

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

  console.log('[DocScreen] Mounted, id:', id, 'user:', user?.id);

  const [token, setToken] = useState<string | null>(null);
  const [initialTitle, setInitialTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const store = useDocsEditorBridgeStore;
  const pendingAction = store((s) => s.pendingAction);
  const actionCounter = store((s) => s.actionCounter);

  // Load token (fast) — mounts editor immediately
  useEffect(() => {
    if (!id) {
      setError('Keine Dokument-ID angegeben');
      setIsLoading(false);
      return;
    }

    console.log('[DocScreen] Getting token...');
    secureStorage.getToken().then((authToken) => {
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
      trackDocumentOpen(id);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bridge callbacks: DOM → Native
  const handleConnectionStatusChange = useCallback(async (status: string) => {
    store.getState().setConnectionStatus(status as 'connected' | 'syncing' | 'disconnected');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanEditChange = useCallback(async (canEdit: boolean) => {
    store.getState().setCanEdit(canEdit);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDocumentLoaded = useCallback(async (doc: { title: string; canEdit: boolean }) => {
    store.getState().setDocumentMeta(doc.title, doc.canEdit);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChatMessagesChange = useCallback(async (messagesJson: string) => {
    try {
      const parsed = JSON.parse(messagesJson);
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
      store.getState().setTypingUsers(JSON.parse(usersJson));
    } catch {
      // Ignore parse errors
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActiveStylesChange = useCallback(async (stylesJson: string) => {
    try {
      store.getState().setActiveFormatting(JSON.parse(stylesJson));
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
      const opts = options ? JSON.parse(options) : {};
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
          b64 = 'str:' + btoa(unescape(encodeURIComponent(e.data)));
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
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      <NativeDocTopBar />
      <NativeFormattingToolbar />
      <GuestBanner />

      <View style={styles.editorContainer}>
        <DocEditorDOM
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
          onTitleChange={handleTitleChange}
          onCanEditChange={handleCanEditChange}
          onDocumentLoaded={handleDocumentLoaded}
          onChatMessagesChange={handleChatMessagesChange}
          onLocalUserIdChange={handleLocalUserIdChange}
          onTypingUsersChange={handleTypingUsersChange}
          onActiveStylesChange={handleActiveStylesChange}
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

      <NativeChatSidebar />
      <NativeShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        documentId={id!}
        userDisplayName={user?.display_name ?? undefined}
      />
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
