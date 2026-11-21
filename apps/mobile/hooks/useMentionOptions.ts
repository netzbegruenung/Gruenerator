import { canShareIntoGroup } from '@gruenerator/shared/groups';
import { useAuthStore } from '@gruenerator/shared/stores';
import { useMemo } from 'react';

import { buildMentionOptions, type MentionOptions } from '../components/projekte/mentionDraft';

import { useGroupMembers } from './useGroups';

/** Mitglieder des Projekts als Erwähnungs-Vorschläge (ohne mich selbst). */
export function useMentionOptions(
  groupId: string | null,
  isSystem: boolean,
  isAdmin: boolean
): MentionOptions {
  const members = useGroupMembers(groupId).data;
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useMemo(
    () =>
      buildMentionOptions(
        members ?? [],
        userId,
        isSystem,
        canShareIntoGroup({ is_system: isSystem, isAdmin })
      ),
    [members, userId, isSystem, isAdmin]
  );
}
