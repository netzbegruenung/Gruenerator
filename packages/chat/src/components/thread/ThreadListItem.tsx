'use client';

import { type MouseEvent, useCallback, useState } from 'react';
import {
  ThreadListItemPrimitive,
  ThreadListItemMorePrimitive,
  useThreadListItem,
  useAui,
} from '@assistant-ui/react';
import {
  MessageSquare,
  MoreVertical,
  Pencil,
  Archive,
  Trash2,
  BookOpen,
  Share2,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAgentStore } from '../../stores/chatStore';
import { useExternalThread } from '../../context/ExternalThreadContext';
import { getThreadType } from '../../runtime/GrueneratorThreadListAdapter';
import { ShareThreadDialog } from './ShareThreadDialog';

function useSafeThreadAction(action: 'delete' | 'switchTo' | 'archive' | 'unarchive') {
  const aui = useAui();
  return useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      Promise.resolve()
        .then(() => aui.threadListItem()[action]())
        .catch((err) => {
          console.warn(`[ThreadList] ${action} failed (thread likely already removed):`, err);
        });
    },
    [aui, action]
  );
}

function ExternalThreadItem() {
  const { title, externalId } = useThreadListItem();
  const ctx = useExternalThread();
  const isActive = ctx?.activePath != null && ctx.activePath === externalId;

  return (
    <div
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors',
        'hover:bg-primary/5',
        isActive && 'bg-primary/10 text-primary'
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          useAgentStore.getState().setChatViewMode('thread');
          if (externalId) ctx?.onClick(externalId);
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <BookOpen className="h-4 w-4 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{title ?? 'Notebook'}</p>
        </div>
      </button>
    </div>
  );
}

function ThreadTypeIcon({ remoteId }: { remoteId: string | undefined }) {
  const threadType = remoteId ? getThreadType(remoteId) : 'chat';
  switch (threadType) {
    case 'search':
      return <Search className="h-4 w-4 flex-shrink-0" />;
    case 'notebook':
      return <BookOpen className="h-4 w-4 flex-shrink-0" />;
    default:
      return <MessageSquare className="h-4 w-4 flex-shrink-0" />;
  }
}

export function GrueneratorThreadListItem() {
  const { externalId, remoteId } = useThreadListItem();
  const baseSwitchTo = useSafeThreadAction('switchTo');
  const handleArchive = useSafeThreadAction('archive');
  const handleDelete = useSafeThreadAction('delete');
  const [shareOpen, setShareOpen] = useState(false);
  const handleSwitch = useCallback(
    (e: MouseEvent) => {
      useAgentStore.getState().setChatViewMode('thread');
      baseSwitchTo(e);
    },
    [baseSwitchTo]
  );

  if (externalId) {
    return <ExternalThreadItem />;
  }

  return (
    <>
      <ThreadListItemPrimitive.Root
        className={cn(
          'group flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors',
          'hover:bg-primary/5',
          'data-[active]:bg-primary/10 data-[active]:text-primary'
        )}
      >
        <ThreadListItemPrimitive.Trigger
          onClick={handleSwitch}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ThreadTypeIcon remoteId={remoteId} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
            </p>
          </div>
        </ThreadListItemPrimitive.Trigger>

        <ThreadListItemMorePrimitive.Root>
          <ThreadListItemMorePrimitive.Trigger
            className="flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100"
            aria-label="Mehr Optionen"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </ThreadListItemMorePrimitive.Trigger>
          <ThreadListItemMorePrimitive.Content className="z-50 min-w-[10rem] rounded-xl border border-border bg-background p-1 shadow-lg">
            <ThreadListItemMorePrimitive.Item className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
              Umbenennen
            </ThreadListItemMorePrimitive.Item>
            <ThreadListItemMorePrimitive.Item
              onClick={() => setShareOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            >
              <Share2 className="h-3.5 w-3.5" />
              Teilen
            </ThreadListItemMorePrimitive.Item>
            <ThreadListItemMorePrimitive.Separator className="my-1 h-px bg-border" />
            <ThreadListItemPrimitive.Archive
              onClick={handleArchive}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            >
              <Archive className="h-3.5 w-3.5" />
              Archivieren
            </ThreadListItemPrimitive.Archive>
            <ThreadListItemPrimitive.Delete
              onClick={handleDelete}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Löschen
            </ThreadListItemPrimitive.Delete>
          </ThreadListItemMorePrimitive.Content>
        </ThreadListItemMorePrimitive.Root>
      </ThreadListItemPrimitive.Root>

      <ShareThreadDialog threadId={remoteId ?? null} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}

export function GrueneratorArchivedThreadListItem() {
  const baseSwitchTo = useSafeThreadAction('switchTo');
  const handleUnarchive = useSafeThreadAction('unarchive');
  const handleDelete = useSafeThreadAction('delete');
  const handleSwitch = useCallback(
    (e: MouseEvent) => {
      useAgentStore.getState().setChatViewMode('thread');
      baseSwitchTo(e);
    },
    [baseSwitchTo]
  );

  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors',
        'hover:bg-primary/5 opacity-60',
        'data-[active]:bg-primary/10 data-[active]:text-primary data-[active]:opacity-100'
      )}
    >
      <ThreadListItemPrimitive.Trigger
        onClick={handleSwitch}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Archive className="h-4 w-4 flex-shrink-0 text-foreground-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
          </p>
        </div>
      </ThreadListItemPrimitive.Trigger>

      <ThreadListItemMorePrimitive.Root>
        <ThreadListItemMorePrimitive.Trigger
          className="flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100"
          aria-label="Mehr Optionen"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </ThreadListItemMorePrimitive.Trigger>
        <ThreadListItemMorePrimitive.Content className="z-50 min-w-[10rem] rounded-xl border border-border bg-background p-1 shadow-lg">
          <ThreadListItemPrimitive.Unarchive
            onClick={handleUnarchive}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" />
            Wiederherstellen
          </ThreadListItemPrimitive.Unarchive>
          <ThreadListItemMorePrimitive.Separator className="my-1 h-px bg-border" />
          <ThreadListItemPrimitive.Delete
            onClick={handleDelete}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Endgültig löschen
          </ThreadListItemPrimitive.Delete>
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>
    </ThreadListItemPrimitive.Root>
  );
}
