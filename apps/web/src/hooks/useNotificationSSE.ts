import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { isDesktopApp } from '../utils/platform';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

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
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  // Disabled in the desktop (Tauri) shell: EventSource is cross-origin to the
  // API and can only send cookies (not the bearer token), so it can never
  // authenticate — it just 404s to the SPA fallback (text/html) and
  // auto-reconnects in a tight loop, which thrashes the UI (sidebar flicker).
  const isEnabled = !!user?.id && !isDesktopApp();

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const { incrementUnreadCount, setSseConnected } = useNotificationStore.getState();

    const es = new EventSource('/api/notifications/stream', { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      reconnectAttemptRef.current = 0;
      setSseConnected(true);
    });

    es.addEventListener('notification', (event: Event) => {
      incrementUnreadCount();
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
      setSseConnected(false);

      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
        RECONNECT_MAX_DELAY
      );
      reconnectAttemptRef.current++;

      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isEnabled) return;

    connect();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      useNotificationStore.getState().setSseConnected(false);
    };
  }, [isEnabled, connect]);
}
