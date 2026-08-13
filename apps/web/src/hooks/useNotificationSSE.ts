import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';

import { handleUnauthorized } from '../components/utils/apiClient';
import { useAuthStore } from '../stores/authStore';
import { isDesktopApp } from '../utils/platform';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

// A connection that never reached the `connected` event never authenticated:
// EventSource hides the status code, so a 401 is indistinguishable from a
// network failure here — except that the server, unlike the network, keeps
// answering instantly. Left alone this backs off to a 30s beat and then keeps
// it forever, because an EventSource error never passes through the shared 401
// authority: a tab whose session died stayed "half logged in" and hammered
// /api/notifications/stream every 30s for as long as it was open (observed in
// production as an endless `[Session] 401 GET /api/notifications/stream
// reason=no_session_cookie` stream from tabs the user had long stopped using).
//
// So a failed handshake asks the same authority every other stack asks. A
// confirmed-dead session tears the tab down like any other 401; a session the
// probe confirms alive keeps reconnecting freely (the failure was never an auth
// failure); only an unresolved one — infra blip, offline — spends the bounded
// budget below.
const MAX_HANDSHAKE_FAILURES = 5;

// Why the stop needs a reason: only one of the two is final. A dead session is
// terminal — the tab is already navigating to /login and must never dial again.
// An exhausted retry budget is merely "not now": the same connectivity loss that
// spent it (lift, tunnel, sleeping laptop) ends, and coming back online has to
// revive the stream, or the fix would trade an endless reconnect loop for
// notifications that stay dead until the next full reload.
type StopReason = 'auth' | 'budget' | 'teardown';

interface SSENotificationData {
  title?: string;
  body?: string;
}

type OnNotificationCallback = (data: SSENotificationData) => void;

export function useNotificationSSE(onNotification?: OnNotificationCallback): void {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handshakeFailuresRef = useRef(0);
  const connectedRef = useRef(false);
  const stopReasonRef = useRef<StopReason | null>(null);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  // Disabled in the desktop (Tauri) shell: EventSource is cross-origin to the
  // API and can only send cookies (not the bearer token), so it can never
  // authenticate — it just 404s to the SPA fallback (text/html) and
  // auto-reconnects in a tight loop, which thrashes the UI (sidebar flicker).
  const isEnabled = !!user?.id && !isDesktopApp();

  const connect = useCallback(() => {
    if (stopReasonRef.current !== null) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    connectedRef.current = false;
    const es = new EventSource('/api/notifications/stream', { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      connectedRef.current = true;
      reconnectAttemptRef.current = 0;
      handshakeFailuresRef.current = 0;
    });

    es.addEventListener('notification', (event: Event) => {
      // Refetch the unread-only list; the bell badge is derived from it, so it
      // updates together with the popover — no separate counter to bump.
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });

      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as SSENotificationData;
        onNotificationRef.current?.(data);
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      es.close();
      if (stopReasonRef.current !== null) return;

      const scheduleReconnect = () => {
        const delay = Math.min(
          RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
          RECONNECT_MAX_DELAY
        );
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      // A stream that was live and then dropped is the ordinary case (proxy
      // idle timeout, sleep/wake) — just reconnect.
      if (connectedRef.current) {
        scheduleReconnect();
        return;
      }

      handshakeFailuresRef.current++;
      void (async () => {
        const outcome = await handleUnauthorized('notification-sse');
        if (stopReasonRef.current !== null) return;
        // 'logout' → the teardown + /login redirect already fired; this tab is
        // navigating away, so never dial again.
        if (outcome === 'logout') {
          stopReasonRef.current = 'auth';
          return;
        }
        if (outcome === 'retry') {
          // The probe confirmed the session is alive, so this was never an auth
          // failure — it must not spend the auth budget, the same reason the
          // other 401 call sites replay instead of backing off.
          handshakeFailuresRef.current = 0;
        } else if (handshakeFailuresRef.current >= MAX_HANDSHAKE_FAILURES) {
          stopReasonRef.current = 'budget';
          return;
        }
        scheduleReconnect();
      })();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isEnabled) return;

    // A fresh mount (or a new user) is a fresh budget — a give-up must not
    // outlive the session it was decided for.
    stopReasonRef.current = null;
    reconnectAttemptRef.current = 0;
    handshakeFailuresRef.current = 0;
    connect();

    // Regained connectivity revives a budget-exhausted stream, never an
    // auth-stopped one: after a teardown the tab is on its way to /login, and
    // redialing from there would just probe a session we already know is gone.
    const onOnline = () => {
      if (stopReasonRef.current !== 'budget') return;
      stopReasonRef.current = null;
      reconnectAttemptRef.current = 0;
      handshakeFailuresRef.current = 0;
      connect();
    };
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('online', onOnline);
      stopReasonRef.current = 'teardown';
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [isEnabled, connect]);
}
