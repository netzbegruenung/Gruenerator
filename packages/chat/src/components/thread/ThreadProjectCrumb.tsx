'use client';

import { useCollaborators } from '@gruenerator/collab';
import { buildGroupPath, useUserGroups } from '@gruenerator/shared/groups';
import { FolderOpen } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { useChatCollaborationContext } from '../../context/ChatCollaborationContext';
import { useChatNavigation } from '../../context/ChatNavigationContext';
import {
  getThreadGroupId,
  isThreadTeamChat,
  subscribeThreadTags,
} from '../../runtime/GrueneratorThreadListAdapter';
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
  const isTeam = useSyncExternalStore(
    subscribeThreadTags,
    () => (threadId ? isThreadTeamChat(threadId) : false),
    () => false
  );
  // Same collaboration context as the thread header — no second provider.
  const collab = useChatCollaborationContext();
  const onlineCount = useCollaborators(collab?.provider ?? null).length;
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
      {isTeam ? (
        <span className="shrink-0 rounded-full bg-background-alt px-2 py-0.5 text-xs font-medium text-foreground">
          Team
        </span>
      ) : null}
      {isTeam && onlineCount > 0 ? (
        <span className="shrink-0 text-xs">{onlineCount} online</span>
      ) : null}
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
