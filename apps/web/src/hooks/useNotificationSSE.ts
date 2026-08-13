import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';

import { probeSessionVerdict } from '../components/utils/apiClient';
import { useAuthStore } from '../stores/authStore';
import { isDesktopApp } from '../utils/platform';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

// A connection that never reached the `connected` event never authenticated.
// Left alone that backs off to a 30s beat and then keeps it forever: a tab whose
// session had died stayed "half logged in" and hammered the endpoint every 30s
// for as long as it was open (production log: an endless `[Session] 401 GET
// /api/notifications/stream reason=no_session_cookie` from several tabs at once,
// for as long as they stayed open).
//
// So a failed handshake asks the session probe whether dialing again can ever
// work — but ONLY that. It must never trigger the teardown itself, however
// certain the verdict looks: EventSource hides the status code, so this code
// cannot know it saw a 401 rather than a dropped connection or an endpoint that
// simply isn't reachable in this environment. Handing it the logout decision
// once got every page redirected to /login in the a11y lane, where the fake
// session is client-side only and the stream endpoint has no backend at all.
// The XHR stacks do see real status codes and do tear down — the polling
// notification query alone gets there within a minute — so stopping here loses
// nothing and risks nothing.
const MAX_HANDSHAKE_FAILURES = 5;

// Why the stop needs a reason: only one of the two is final. A session the probe
// calls dead stays dead until someone logs in again, which is a full page load.
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
        const verdict = await probeSessionVerdict();
        if (stopReasonRef.current !== null) return;
        if (verdict === 'dead') {
          // Nothing this hook can dial will authenticate. Go quiet and leave the
          // teardown to the stacks that saw an actual status code.
          stopReasonRef.current = 'auth';
          return;
        }
        if (verdict === 'alive') {
          // The session is provably fine, so this was never an auth failure and
          // must not spend the budget — reconnect as freely as an ordinary drop.
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
    // auth-stopped one: a session the probe called dead does not come back
    // without a login, and that is a full page load anyway.
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
