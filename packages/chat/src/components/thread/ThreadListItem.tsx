'use client';

import {
  ThreadListItemPrimitive,
  ThreadListItemMorePrimitive,
  useAuiState,
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
import { type MouseEvent, useCallback, useState, useSyncExternalStore } from 'react';

import { useChatNavigation } from '../../context/ChatNavigationContext';
import { useExternalThread } from '../../context/ExternalThreadContext';
import { adoptAuiAction, auiPromise } from '../../lib/auiAsync';
import { buildThreadPath, pathNamesThread } from '../../lib/threadPath';
import { cn } from '../../lib/utils';
import { getThreadTags, subscribeThreadTags } from '../../runtime/GrueneratorThreadListAdapter';
import { useAgentStore } from '../../stores/chatStore';
import useChatPinsStore, { useIsChatPinned } from '../../stores/useChatPinsStore';

import { EditTagsDialog } from './EditTagsDialog';
import { MoveToSpaceDialog } from './MoveToSpaceDialog';
import { ShareThreadDialog } from './ShareThreadDialog';

function useSafeThreadAction(action: 'delete' | 'archive' | 'unarchive') {
  const aui = useAui();
  const nav = useChatNavigation();
  return useCallback(
    (e: MouseEvent) => {
      // The primitive's built-in call is fire-and-forget, so a rejection (the
      // thread was already removed elsewhere) would surface as an unhandled
      // rejection. Suppress it and re-issue with a catch — synchronously, see
      // adoptAuiAction for why the old microtask deferral was a bug.
      e.preventDefault();
      void (async () => {
        // A delete racing a switch that opens exactly this thread (the URL
        // still names it) can leave the main thread pointing at the slot
        // delete() just hid: for an archived thread the switch is suspended in
        // `await unarchive(...)` — before it assigns the main thread — and the
        // delete's "main is a different thread" check then skips its move. The
        // switch would complete against the removed slot and every
        // `item("main")` render throws `useClientLookup: key … not found`.
        // Parking on a new thread first bumps the switch generation, so the
        // in-flight switch dies at its generation check instead.
        if (action === 'delete') {
          const remoteId = aui.threadListItem.getState().remoteId ?? null;
          if (remoteId && pathNamesThread(nav?.activePath, remoteId)) {
            await auiPromise(aui.threads.switchToNewThread()).catch((err) => {
              console.warn('[ThreadList] Could not start a new thread before delete:', err);
            });
          }
        }
        adoptAuiAction(aui.threadListItem[action](), (err) => {
          console.warn(`[ThreadList] ${action} failed (thread likely already removed):`, err);
        });
      })();
    },
    [aui, action, nav]
  );
}

/**
 * Opening a thread is a navigation, not a runtime call: the URL is the single
 * source of truth and ChatThreadRouting performs the switch from it. Doing both
 * raced — the click's switch and the URL's switch cancelled each other, which
 * is what made rapid clicks flicker between two threads.
 */
function useOpenThread(remoteId: string | null | undefined, title: string | null | undefined) {
  const aui = useAui();
  const nav = useChatNavigation();
  const threadPath = remoteId ? buildThreadPath(remoteId, title ?? null) : null;

  const onClick = useCallback(
    (e: MouseEvent) => {
      // Leave new-tab / new-window / "open in background" to the browser.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      useAgentStore.getState().setChatViewMode('thread');
      if (nav && threadPath) {
        nav.navigate(threadPath);
        return;
      }
      // Host without a router (mobile drives selection itself): switch directly.
      useAgentStore.getState().setPendingInitialAssistantMessage(null);
      adoptAuiAction(aui.threadListItem.switchTo(), (err) => {
        console.warn('[ThreadList] switchTo failed (thread likely already removed):', err);
      });
    },
    [aui, nav, threadPath]
  );

  return { threadPath, onClick };
}

function ExternalThreadItem() {
  const { title, externalId } = useAuiState((s) => s.threadListItem);
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
  const { externalId, remoteId, title } = useAuiState((s) => s.threadListItem);
  const { threadPath, onClick: handleOpen } = useOpenThread(remoteId, title);
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
  const isPinned = useIsChatPinned(remoteId);
  const togglePin = useCallback(() => {
    if (remoteId) useChatPinsStore.getState().togglePin(remoteId);
  }, [remoteId]);

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
        {/* A real link, so the row carries its destination: middle-click and
            ⌘-click open a tab, and hovering shows where it goes. */}
        {threadPath ? (
          <a href={threadPath} onClick={handleOpen} className="flex min-w-0 flex-1 items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
              </p>
            </div>
          </a>
        ) : (
          // Draft row: no server-side thread yet, so there is nothing to link to.
          <ThreadListItemPrimitive.Trigger className="flex min-w-0 flex-1 items-center text-left">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
              </p>
            </div>
          </ThreadListItemPrimitive.Trigger>
        )}

        <ThreadListItemMorePrimitive.Root>
          <ThreadListItemMorePrimitive.Trigger
            className="flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100 pointer-coarse:opacity-100"
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
              Zu Projekt hinzufügen
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
  const { remoteId, title } = useAuiState((s) => s.threadListItem);
  const { threadPath, onClick: handleOpen } = useOpenThread(remoteId, title);
  const handleUnarchive = useSafeThreadAction('unarchive');
  const handleDelete = useSafeThreadAction('delete');

  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 min-h-[34px] transition-colors',
        'hover:bg-secondary-50 dark:hover:bg-secondary-800/40 opacity-60',
        'data-[active]:bg-secondary-100 dark:data-[active]:bg-secondary-800/60 data-[active]:font-medium data-[active]:opacity-100'
      )}
    >
      {threadPath ? (
        <a href={threadPath} onClick={handleOpen} className="flex min-w-0 flex-1 items-center">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
            </p>
          </div>
        </a>
      ) : (
        <ThreadListItemPrimitive.Trigger className="flex min-w-0 flex-1 items-center text-left">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <ThreadListItemPrimitive.Title fallback="Neue Unterhaltung" />
            </p>
          </div>
        </ThreadListItemPrimitive.Trigger>
      )}

      <ThreadListItemMorePrimitive.Root>
        <ThreadListItemMorePrimitive.Trigger
          className="flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100 pointer-coarse:opacity-100"
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
