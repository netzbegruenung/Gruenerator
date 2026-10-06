import { useAuthStore } from '@gruenerator/shared/stores';
import { useMemo } from 'react';

import { type HiddenMember, useHiddenMembersStore } from '../stores/hiddenMembersStore';

const NONE: HiddenMember[] = [];

/** The people the logged-in account has hidden; empty when logged out. */
export function useHiddenMembers(): HiddenMember[] {
  const ownerId = useAuthStore((s) => s.user?.id ?? null);
  const list = useHiddenMembersStore((s) => (ownerId ? s.byUser[ownerId] : undefined));
  return list ?? NONE;
}

export function useHiddenMemberIds(): Set<string> {
  const hidden = useHiddenMembers();
  return useMemo(() => new Set(hidden.map((m) => m.userId)), [hidden]);
}
