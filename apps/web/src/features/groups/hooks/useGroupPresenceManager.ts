import { generateUserColor } from '@gruenerator/collab';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';

import { HOCUSPOCUS_URL, type PresenceUser } from './useGroupPresence';

import type { CollaborationUser } from '@gruenerator/collab';

interface GroupPresenceEntry {
  provider: HocuspocusProvider;
  ydoc: Y.Doc;
  handleChange: () => void;
}

const MAX_CONNECTIONS = 10;

export function useGroupPresenceManager(groupIds: string[], user: PresenceUser | null) {
  const connectionsRef = useRef<Map<string, GroupPresenceEntry>>(new Map());
  const [presenceState, setPresenceState] = useState<{
    counts: Record<string, number>;
    members: Record<string, CollaborationUser[]>;
  }>({ counts: {}, members: {} });

  useEffect(() => {
    if (!user) return;

    const connections = connectionsRef.current;
    const activeIds = new Set(groupIds.slice(0, MAX_CONNECTIONS));

    // Disconnect groups no longer in the list
    for (const [gid, entry] of connections) {
      if (!activeIds.has(gid)) {
        entry.provider.awareness?.off('change', entry.handleChange);
        entry.provider.awareness?.setLocalState(null);
        entry.provider.destroy();
        connections.delete(gid);
      }
    }

    const color = generateUserColor();

    // Connect new groups
    for (const gid of activeIds) {
      if (connections.has(gid)) continue;

      const ydoc = new Y.Doc();
      const provider = new HocuspocusProvider({
        url: HOCUSPOCUS_URL,
        name: `group-presence-${gid}`,
        document: ydoc,
      });

      provider.awareness?.setLocalStateField('user', { id: user.id, name: user.name, color });

      const handleChange = () => {
        setTimeout(() => {
          const awareness = provider.awareness;
          if (!awareness) return;
          const members: CollaborationUser[] = [];

          awareness.getStates().forEach((state, clientId) => {
            if (state['user'] && clientId !== awareness.clientID) {
              members.push(state['user'] as CollaborationUser);
            }
          });

          // Deduplicate by user ID
          const seen = new Set<string>();
          const unique = members.filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });

          setPresenceState((prev) => {
            const prevCount = prev.counts[gid] || 0;
            const prevIds = (prev.members[gid] || [])
              .map((u) => u.id)
              .sort()
              .join(',');
            const newIds = unique
              .map((u) => u.id)
              .sort()
              .join(',');
            if (prevCount === unique.length && prevIds === newIds) return prev;
            return {
              counts: { ...prev.counts, [gid]: unique.length },
              members: { ...prev.members, [gid]: unique },
            };
          });
        }, 0);
      };

      provider.awareness?.on('change', handleChange);
      connections.set(gid, { provider, ydoc, handleChange });
    }

    return () => {
      for (const [, entry] of connections) {
        entry.provider.awareness?.off('change', entry.handleChange);
        entry.provider.awareness?.setLocalState(null);
        entry.provider.destroy();
      }
      connections.clear();
    };
  }, [groupIds.join(','), user?.id]);

  const getOnlineCount = useCallback(
    (groupId: string) => presenceState.counts[groupId] || 0,
    [presenceState.counts]
  );

  const getOnlineMembers = useCallback(
    (groupId: string): CollaborationUser[] => presenceState.members[groupId] || [],
    [presenceState.members]
  );

  return { getOnlineCount, getOnlineMembers };
}
