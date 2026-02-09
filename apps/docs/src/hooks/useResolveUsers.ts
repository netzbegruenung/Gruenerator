import { getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { useCallback, useRef } from 'react';

import { apiClient } from '../lib/apiClient';

interface BlockNoteUser {
  id: string;
  username: string;
  avatarUrl: string;
}

interface ApiUser {
  id: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  avatar_robot_id?: number;
}

interface CacheEntry {
  user: BlockNoteUser;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useResolveUsers = () => {
  const cache = useRef<Map<string, CacheEntry>>(new Map());

  const resolveUsers = useCallback(
    async (userIds: string[]): Promise<(BlockNoteUser | undefined)[]> => {
      const now = Date.now();
      const results: (BlockNoteUser | undefined)[] = new Array(userIds.length);
      const idsToFetch: string[] = [];
      const indexMap = new Map<string, number[]>();

      for (let i = 0; i < userIds.length; i++) {
        const id = userIds[i];
        const cached = cache.current.get(id);

        if (cached && now - cached.timestamp < CACHE_TTL) {
          results[i] = cached.user;
        } else {
          idsToFetch.push(id);
          const indices = indexMap.get(id) || [];
          indices.push(i);
          indexMap.set(id, indices);
        }
      }

      if (idsToFetch.length === 0) {
        return results;
      }

      try {
        const uniqueIds = [...new Set(idsToFetch)];
        const response = await apiClient.post<ApiUser[]>('/users/batch', { userIds: uniqueIds });
        const users = response.data;

        for (const dbUser of users) {
          const blockNoteUser: BlockNoteUser = {
            id: dbUser.id,
            username: dbUser.display_name || dbUser.email?.split('@')[0] || 'Unbekannt',
            avatarUrl: dbUser.avatar_url || getRobotAvatarPath(dbUser.avatar_robot_id || 1),
          };

          cache.current.set(dbUser.id, { user: blockNoteUser, timestamp: now });

          const indices = indexMap.get(dbUser.id);
          if (indices) {
            for (const idx of indices) {
              results[idx] = blockNoteUser;
            }
          }
        }
      } catch (error) {
        console.error('[resolveUsers] Error fetching users:', error);
      }

      return results;
    },
    []
  );

  return resolveUsers;
};
