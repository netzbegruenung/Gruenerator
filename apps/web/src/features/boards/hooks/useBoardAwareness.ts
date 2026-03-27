import { useCallback, useEffect, useRef, useState } from 'react';

import type { HocuspocusProvider } from '@hocuspocus/provider';

export interface RemoteCursor {
  clientId: number;
  user: { id: string; name: string; color: string; avatarRobotId?: number };
  x: number;
  y: number;
}

export interface RemoteActivity {
  clientId: number;
  user: { id: string; name: string; color: string; avatarRobotId?: number };
  selectedCardId: string | null;
  draggedCardId: string | null;
  dragTargetColumnId: string | null;
  activeColumnId: string | null;
}

export interface BoardActivityState {
  selectedCardId?: string | null;
  draggedCardId?: string | null;
  dragTargetColumnId?: string | null;
  activeColumnId?: string | null;
}

const THROTTLE_MS = 50;
const STALE_MS = 5000;

export function useBoardAwareness(provider: HocuspocusProvider | null) {
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [remoteActivities, setRemoteActivities] = useState<RemoteActivity[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastBroadcast = useRef(0);
  const activityRef = useRef<BoardActivityState>({});

  useEffect(() => {
    if (!provider) return;
    const awareness = provider.awareness;
    if (!awareness) return;

    const pendingRef = { current: null as ReturnType<typeof setTimeout> | null };

    const handleChange = () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);

      pendingRef.current = setTimeout(() => {
        const now = Date.now();
        const cursors: RemoteCursor[] = [];
        const activities: RemoteActivity[] = [];

        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID) return;
          const user = state.user as RemoteCursor['user'] | undefined;
          if (!user) return;

          const cursor = state.boardCursor as { x: number; y: number; t: number } | undefined;
          if (cursor && now - (cursor.t || 0) < STALE_MS) {
            cursors.push({ clientId, user, x: cursor.x, y: cursor.y });
          }

          const activity = state.boardActivity as BoardActivityState | undefined;
          if (activity) {
            activities.push({
              clientId,
              user,
              selectedCardId: activity.selectedCardId ?? null,
              draggedCardId: activity.draggedCardId ?? null,
              dragTargetColumnId: activity.dragTargetColumnId ?? null,
              activeColumnId: activity.activeColumnId ?? null,
            });
          }
        });

        setRemoteCursors(cursors);
        setRemoteActivities(activities);
        pendingRef.current = null;
      }, 0);
    };

    awareness.on('change', handleChange);
    handleChange();

    return () => {
      awareness.off('change', handleChange);
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [provider]);

  const broadcastActivity = useCallback(
    (update: Partial<BoardActivityState>) => {
      if (!provider?.awareness) return;
      activityRef.current = { ...activityRef.current, ...update };
      provider.awareness.setLocalStateField('boardActivity', activityRef.current);
    },
    [provider]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!provider?.awareness) return;
      const container = containerRef.current;
      if (!container) return;

      const now = Date.now();
      if (now - lastBroadcast.current < THROTTLE_MS) return;
      lastBroadcast.current = now;

      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left + container.scrollLeft) / container.scrollWidth) * 100;
      const y = ((e.clientY - rect.top + container.scrollTop) / container.scrollHeight) * 100;

      provider.awareness.setLocalStateField('boardCursor', { x, y, t: now });
    },
    [provider]
  );

  const onMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const related = e.relatedTarget;
      if (related instanceof Node && container.contains(related)) return;
      provider?.awareness?.setLocalStateField('boardCursor', null);
    },
    [provider]
  );

  return {
    remoteCursors,
    remoteActivities,
    containerRef,
    onMouseMove,
    onMouseLeave,
    broadcastActivity,
  };
}
