'use client';

import { type MouseEvent, useCallback, useState, useSyncExternalStore } from 'react';
import {
  ThreadListItemPrimitive,
  ThreadListItemMorePrimitive,
  useThreadListItem,
  useAui,
} from '@assistant-ui/react';
import {
  MoreVertical,
  Pencil,
  Archive,
  Trash2,
  Share2,
  Pin,
  PinOff,
  Tag,
  Users,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAgentStore } from '../../stores/chatStore';
import useChatPinsStore, { useIsChatPinned } from '../../stores/useChatPinsStore';
import { useExternalThread } from '../../context/ExternalThreadContext';
import {
  getThreadType,
  getNotebookCollectionId,
  getThreadTags,
  subscribeThreadTags,
} from '../../runtime/GrueneratorThreadListAdapter';
import { EditTagsDialog } from './EditTagsDialog';
import { MoveToSpaceDialog } from './MoveToSpaceDialog';
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
        'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 min-h-[34px] transition-colors',
        'hover:bg-secondary-50 dark:hover:bg-secondary-800/40',
        isActive && 'bg-secondary-100 dark:bg-secondary-800/60 font-medium'
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          useAgentStore.getState().setChatViewMode('thread');
          if (externalId) ctx?.onClick(externalId);
        }}
        className="flex min-w-0 flex-1 items-center text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{title ?? 'Notebook'}</p>
        </div>
      </button>
    </div>
  );
}

export function GrueneratorThreadListItem() {
  const { externalId, remoteId } = useThreadListItem();
  const baseSwitchTo = useSafeThreadAction('switchTo');
  const handleArchive = useSafeThreadAction('archive');
  const handleDelete = useSafeThreadAction('delete');
  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  // Live read from the tags cache: fresh per remoteId (no stale value on item
  // recycle) and re-renders when list()/edits change the cache.
  const tags = useSyncExternalStore(
    subscribeThreadTags,
    () => getThreadTags(remoteId ?? ''),
    () => getThreadTags(remoteId ?? '')
  );
  const ctx = useExternalThread();
  const isPinned = useIsChatPinned(remoteId);
  const togglePin = useCallback(() => {
    if (remoteId) useChatPinsStore.getState().togglePin(remoteId);
  }, [remoteId]);
  const handleSwitch = useCallback(
    (e: MouseEvent) => {
      // Notebook threads navigate to the notebook page instead of opening in chat
      if (remoteId) {
        const threadType = getThreadType(remoteId);
        if (threadType === 'notebook') {
          const collectionId = getNotebookCollectionId(remoteId);
          if (collectionId && ctx?.onClick) {
            const path = collectionId.endsWith('-system')
              ? `/gruene-${collectionId.replace('-system', '')}?thread=${remoteId}`
              : `/notebook/${collectionId}?thread=${remoteId}`;
            ctx.onClick(path);
            return;
          }
        }
      }
      const store = useAgentStore.getState();
      // Explicit thread pick: drop queued auto-send state so a stale persisted
      // value can't make AutoMessageSender hijack the switch into a new thread.
      store.setPendingInitialAssistantMessage(null);
      store.setChatViewMode('thread');
      baseSwitchTo(e);
    },
    [baseSwitchTo, remoteId, ctx]
  );

  if (externalId) {
    return <ExternalThreadItem />;
  }

  return (
    <>
      <ThreadListItemPrimitive.Root
        className={cn(
          'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 min-h-[34px] transition-colors',
          'hover:bg-secondary-50 dark:hover:bg-secondary-800/40',
          'data-[active]:bg-secondary-100 dark:data-[active]:bg-secondary-800/60 data-[active]:font-medium'
        )}
      >
        <ThreadListItemPrimitive.Trigger
          onClick={handleSwitch}
          className="flex min-w-0 flex-1 items-center text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
            </p>
            {tags.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1 overflow-hidden">
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="max-w-full truncate rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] leading-tight text-foreground-muted dark:bg-secondary-800/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </ThreadListItemPrimitive.Trigger>

        <ThreadListItemMorePrimitive.Root>
          <ThreadListItemMorePrimitive.Trigger
            className="flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100"
            aria-label="Mehr Optionen"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </ThreadListItemMorePrimitive.Trigger>
          <ThreadListItemMorePrimitive.Content className="z-50 min-w-[10rem] rounded-xl border border-border bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl p-1 shadow-lg">
            <ThreadListItemMorePrimitive.Item
              onClick={togglePin}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {isPinned ? 'Lösen' : 'Anheften'}
            </ThreadListItemMorePrimitive.Item>
            <ThreadListItemMorePrimitive.Item className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
              Umbenennen
            </ThreadListItemMorePrimitive.Item>
            <ThreadListItemMorePrimitive.Item
              onClick={() => setTagsOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            >
              <Tag className="h-3.5 w-3.5" />
              Tags bearbeiten
            </ThreadListItemMorePrimitive.Item>
            <ThreadListItemMorePrimitive.Item
              onClick={() => setSpaceOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            >
              <Users className="h-3.5 w-3.5" />
              Zu Space hinzufügen
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

      {shareOpen && (
        <ShareThreadDialog
          threadId={remoteId ?? null}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      {tagsOpen && (
        <EditTagsDialog
          threadId={remoteId ?? null}
          initialTags={tags}
          open={tagsOpen}
          onOpenChange={setTagsOpen}
        />
      )}

      {spaceOpen && (
        <MoveToSpaceDialog
          threadId={remoteId ?? null}
          open={spaceOpen}
          onOpenChange={setSpaceOpen}
        />
      )}
    </>
  );
}

export function GrueneratorArchivedThreadListItem() {
  const baseSwitchTo = useSafeThreadAction('switchTo');
  const handleUnarchive = useSafeThreadAction('unarchive');
  const handleDelete = useSafeThreadAction('delete');
  const handleSwitch = useCallback(
    (e: MouseEvent) => {
      const store = useAgentStore.getState();
      store.setPendingInitialAssistantMessage(null);
      store.setChatViewMode('thread');
      baseSwitchTo(e);
    },
    [baseSwitchTo]
  );

  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 min-h-[34px] transition-colors',
        'hover:bg-secondary-50 dark:hover:bg-secondary-800/40 opacity-60',
        'data-[active]:bg-secondary-100 dark:data-[active]:bg-secondary-800/60 data-[active]:font-medium data-[active]:opacity-100'
      )}
    >
      <ThreadListItemPrimitive.Trigger
        onClick={handleSwitch}
        className="flex min-w-0 flex-1 items-center text-left"
      >
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
