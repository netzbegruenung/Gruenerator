import { useCallback } from 'react';
import {
  useCollaboration as useCollaborationSession,
  type AuthFailureVerdict,
  type CollaborationConfig,
  type CollaborationState,
} from '@ggraphic/collab';

import { generateUserColor } from '../utils';
import { GRUENERATOR_DOC_CACHE } from '../lib/cacheRegistry';
import { isAwarenessOnlyRoom } from '../lib/roomTypes';

import type { CollaborationUser } from '../types';

export type { CollaborationConfig };

// `services/hocuspocus/src/auth.ts` reasons that mean "infra hiccup, try
// again" — a DB/session-store lookup itself failed, not a verdict about the
// user's access. Every OTHER reason (deleted, denied, not publicly
// accessible, no group access, expired session, ...) is a durable rejection:
// retrying gains nothing until the user reloads or re-authenticates. Kept as
// an allowlist of the transient cases (rather than enumerating every durable
// string) so a reason this file doesn't yet know about still defaults to
// durable instead of silently retrying forever.
const TRANSIENT_AUTH_FAILURE_REASONS = [
  'internal authentication error',
  'failed to check public access',
  'session verification failed',
];

function classifyAuthFailure(reason: string): AuthFailureVerdict {
  const lower = reason.toLowerCase();
  return {
    durable: !TRANSIENT_AUTH_FAILURE_REASONS.some((transient) => lower.includes(transient)),
    // The document is gone or no longer ours: its offline copy must go too.
    dropLocalCache: reason.includes('deleted') || reason.includes('denied'),
  };
}

const isCachedRoom = (documentId: string) => !isAwarenessOnlyRoom(documentId);

export interface UseCollaborationOptions {
  documentId: string;
  user: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_robot_id?: number | null;
  } | null;
  config: CollaborationConfig;
  isGuest?: boolean;
  guestId?: string;
  guestName?: string;
}

/**
 * The Grünerator's collaboration session: the neutral `@ggraphic/collab` hook
 * with the F0 cache names, the room kinds of `services/hocuspocus` and its
 * auth reasons, and the guest/user awareness identity.
 */
export const useCollaboration = ({
  documentId,
  user,
  config,
  isGuest,
  guestId,
  guestName,
}: UseCollaborationOptions): CollaborationState => {
  const hasUser = !!user;
  const userId = user?.id;
  const displayName = user?.display_name;
  const email = user?.email;
  const avatarRobotId = user?.avatar_robot_id;

  const getAwarenessUser = useCallback((): CollaborationUser => {
    if (isGuest || !hasUser) {
      return { id: guestId || 'guest', name: guestName || 'Gast', color: generateUserColor() };
    }
    return {
      id: userId!,
      name: displayName || email || 'Anonymous',
      color: generateUserColor(),
      avatarRobotId: avatarRobotId ?? 1,
    };
  }, [isGuest, hasUser, userId, displayName, email, avatarRobotId, guestId, guestName]);

  return useCollaborationSession({
    documentId,
    config,
    anonymous: !!isGuest,
    canConnect: !!isGuest || hasUser,
    getAwarenessUser,
    getParameters: () => (isGuest && guestId ? { guestId, guestName: guestName || 'Gast' } : null),
    localCache: GRUENERATOR_DOC_CACHE,
    isCachedRoom,
    classifyAuthFailure,
  });
};
