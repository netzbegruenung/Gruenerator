import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';

import { useAuthStore } from '../stores/authStore';
import { isDesktopApp } from '../utils/platform';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

// A connection that never reached ANY server event never got an answer at all.
// Left alone that backs off to a 30s beat and then keeps it forever: a tab
// whose session had died stayed "half logged in" and hammered the endpoint
// every 30s for as long as it was open (production log: an endless
// `[Session] 401 GET /api/notifications/stream reason=no_session_cookie` from
// several tabs at once, for as long as they stayed open).
//
// The session case no longer arrives here — the server names it in the stream
// (`unauthorized`), so nothing has to be inferred from silence any more. What
// is left for the budget is the case no event can describe, because the
// endpoint never spoke: no backend in this environment (the a11y lane has
// none), a proxy swallowing the route, the network gone. Five silent
// handshakes and the hook goes quiet.
const MAX_HANDSHAKE_FAILURES = 5;

// Why the stop needs a reason: only one of the two is final. A session the
// server called dead stays dead until someone logs in again, which is a full
// page load. An exhausted retry budget is merely "not now": the same
// connectivity loss that spent it (lift, tunnel, sleeping laptop) ends, and
// coming back online has to revive the stream, or the fix would trade an
// endless reconnect loop for notifications that stay dead until the next full
// reload.
type StopReason = 'auth' | 'budget' | 'teardown';

interface SSENotificationData {
  title?: string;
  body?: string;
}

type OnNotificationCallback = (data: SSENotificationData) => void;

export function useNotificationSSE(onNotification?: OnNotificationCallback): void {
  const user = useAuthStore((s) => s.user);
  // The gate is the SERVER-confirmed tier, not the optimistic one. `user`
  // alone can come from the 5-minute instant-auth cache in localStorage, so a
  // warm start would dial an authenticated socket on an identity nobody has
  // checked this page load — which is how a tab whose cookie died ends up
  // dialing at all. `hasServerConfirmed` is false on every mount until the
  // auth query answers, and false again the moment it answers "guest".
  const hasServerConfirmed = useAuthStore((s) => s.hasServerConfirmed);
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handshakeFailuresRef = useRef(0);
  const connectedRef = useRef(false);
  const infraDropRef = useRef(false);
  const stopReasonRef = useRef<StopReason | null>(null);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  // Disabled in the desktop (Tauri) shell: EventSource is cross-origin to the
  // API and can only send cookies (not the bearer token), so it can never
  // authenticate — it just 404s to the SPA fallback (text/html) and
  // auto-reconnects in a tight loop, which thrashes the UI (sidebar flicker).
  const isEnabled = hasServerConfirmed && !!user?.id && !isDesktopApp();

  const connect = useCallback(() => {
    if (stopReasonRef.current !== null) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    connectedRef.current = false;
    infraDropRef.current = false;
    const es = new EventSource('/api/notifications/stream', { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      connectedRef.current = true;
      reconnectAttemptRef.current = 0;
      handshakeFailuresRef.current = 0;
    });

    // The server says this connection has no session. Stop dialing and hand
    // the question to the layer that owns it: the auth query re-asks, and its
    // answer flips `hasServerConfirmed` — which tears this stream down through
    // the effect below, instead of through a second opinion formed here.
    es.addEventListener('unauthorized', () => {
      stopReasonRef.current = 'auth';
      es.close();
      void queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    });

    // Auth backend down, not a dead session. Reconnect like an ordinary drop
    // and never spend the handshake budget: the budget is for an endpoint that
    // says nothing, and this one just said something.
    es.addEventListener('unavailable', () => {
      infraDropRef.current = true;
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
      // idle timeout, sleep/wake) — just reconnect. So is one the server ended
      // with `unavailable`, which is an answer, not silence.
      if (connectedRef.current || infraDropRef.current) {
        infraDropRef.current = false;
        scheduleReconnect();
        return;
      }

      handshakeFailuresRef.current++;
      if (handshakeFailuresRef.current >= MAX_HANDSHAKE_FAILURES) {
        stopReasonRef.current = 'budget';
        return;
      }
      scheduleReconnect();
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
    // auth-stopped one: a session the server called dead does not come back
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
