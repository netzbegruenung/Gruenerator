'use client';

import { buildGroupPath, useUserGroups } from '@gruenerator/shared/groups';
import { FolderOpen } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { useChatNavigation } from '../../context/ChatNavigationContext';
import { getThreadGroupId, subscribeThreadTags } from '../../runtime/GrueneratorThreadListAdapter';
import { useAgentStore } from '../../stores/chatStore';

/**
 * "Projektname / Chattitel" above a chat that is filed in a Projekt, linking to
 * the Projekt page. The Projekt comes from the thread list's `groupId` (no extra
 * request) and its name from the cached user-groups list. Renders nothing for
 * chats outside a Projekt, or when the person is no longer a member (the name
 * is then unknown and the link would lead to a 403).
 */
export function ThreadProjectCrumb() {
  const threadId = useAgentStore((s) => s.currentThreadId);
  const title = useAgentStore((s) => s.currentThreadTitle);
  const nav = useChatNavigation();
  const groupId = useSyncExternalStore(
    subscribeThreadTags,
    () => (threadId ? getThreadGroupId(threadId) : null),
    () => null
  );
  const { data: groups } = useUserGroups({ enabled: !!groupId });
  const group = groupId ? groups?.find((g) => g.id === groupId) : undefined;
  if (!group) return null;

  const href = buildGroupPath(group);

  return (
    <nav
      aria-label="Projekt dieses Chats"
      className="flex min-w-0 items-center gap-1.5 px-4 pt-3 text-sm text-foreground-muted sm:px-6 lg:px-8"
    >
      <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
      <a
        href={href}
        className="max-w-[40%] shrink-0 truncate font-medium text-foreground hover:underline focus-visible:underline"
        onClick={(event) => {
          if (!nav || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
            return;
          event.preventDefault();
          nav.navigate(href);
        }}
      >
        {group.name}
      </a>
      {title ? (
        <>
          <span aria-hidden>/</span>
          <span className="truncate" aria-current="page">
            {title}
          </span>
        </>
      ) : null}
    </nav>
  );
}
