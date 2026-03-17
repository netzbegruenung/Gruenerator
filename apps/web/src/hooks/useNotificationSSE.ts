import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';

import { useNotificationStore } from '../stores/notificationStore';

import { useOptimizedAuth } from './useAuth';
import { useBetaFeatures } from './useBetaFeatures';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

interface SSENotificationData {
  title?: string;
  body?: string;
}

type OnNotificationCallback = (data: SSENotificationData) => void;

export function useNotificationSSE(onNotification?: OnNotificationCallback): void {
  const { user } = useOptimizedAuth();
  const { canAccessBetaFeature } = useBetaFeatures();
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  const isEnabled = !!user?.id && canAccessBetaFeature('workplace');

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

    es.addEventListener('notification', (event) => {
      incrementUnreadCount();
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });

      try {
        const data = JSON.parse(event.data) as SSENotificationData;
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
