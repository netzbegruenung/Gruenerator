'use client';

import { useState } from 'react';
import { ThreadListItemPrimitive, ThreadListItemMorePrimitive } from '@assistant-ui/react';
import { MessageSquare, MoreVertical, Pencil, Archive, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function GrueneratorThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors',
        'hover:bg-primary/5',
        'data-[active]:bg-primary/10 data-[active]:text-primary'
      )}
    >
      <ThreadListItemPrimitive.Trigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <MessageSquare className="h-4 w-4 flex-shrink-0" />
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
          <ThreadListItemMorePrimitive.Separator className="my-1 h-px bg-border" />
          <ThreadListItemPrimitive.Archive className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground">
            <Archive className="h-3.5 w-3.5" />
            Archivieren
          </ThreadListItemPrimitive.Archive>
          <ThreadListItemPrimitive.Delete className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-red-500/10 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
            Löschen
          </ThreadListItemPrimitive.Delete>
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>
    </ThreadListItemPrimitive.Root>
  );
}

export function GrueneratorArchivedThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors',
        'hover:bg-primary/5 opacity-60',
        'data-[active]:bg-primary/10 data-[active]:text-primary data-[active]:opacity-100'
      )}
    >
      <ThreadListItemPrimitive.Trigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
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
          <ThreadListItemPrimitive.Unarchive className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-primary/10 hover:text-foreground">
            <Archive className="h-3.5 w-3.5" />
            Wiederherstellen
          </ThreadListItemPrimitive.Unarchive>
          <ThreadListItemMorePrimitive.Separator className="my-1 h-px bg-border" />
          <ThreadListItemPrimitive.Delete className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-red-500/10 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
            Endgültig löschen
          </ThreadListItemPrimitive.Delete>
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>
    </ThreadListItemPrimitive.Root>
  );
}
