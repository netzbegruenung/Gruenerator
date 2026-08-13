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
// confirmed-dead session tears the tab down like any other 401; anything else
// (infra blip, offline) gets a bounded number of retries instead of an
// unbounded one.
const MAX_HANDSHAKE_FAILURES = 5;

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
  const stoppedRef = useRef(false);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  // Disabled in the desktop (Tauri) shell: EventSource is cross-origin to the
  // API and can only send cookies (not the bearer token), so it can never
  // authenticate — it just 404s to the SPA fallback (text/html) and
  // auto-reconnects in a tight loop, which thrashes the UI (sidebar flicker).
  const isEnabled = !!user?.id && !isDesktopApp();

  const connect = useCallback(() => {
    if (stoppedRef.current) return;
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
      if (stoppedRef.current) return;

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
        // 'logout' → the teardown + /login redirect already fired; this tab is
        // navigating away, so never reconnect.
        if (outcome === 'logout' || stoppedRef.current) {
          stoppedRef.current = true;
          return;
        }
        if (handshakeFailuresRef.current >= MAX_HANDSHAKE_FAILURES) {
          stoppedRef.current = true;
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
    stoppedRef.current = false;
    reconnectAttemptRef.current = 0;
    handshakeFailuresRef.current = 0;
    connect();

    return () => {
      stoppedRef.current = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [isEnabled, connect]);
}
