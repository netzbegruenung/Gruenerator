'use client';

import { memo, useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Folder, FolderPlus, X, Check } from 'lucide-react';

import { useChatConfigStore } from '../../stores/chatConfigStore';

interface ChatFolder {
  id: string;
  name: string;
}

interface MoveToFolderDialogProps {
  threadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Sort a chat into one of the user's folders (or remove it from its folder).
 *  Mirrors EditTagsDialog: fetches via the ChatConfig store's fetch fn and
 *  PATCHes chat_threads.folder_id. */
export const MoveToFolderDialog = memo(function MoveToFolderDialog({
  threadId,
  open,
  onOpenChange,
}: MoveToFolderDialogProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchFn('/api/chat-service/folders')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ChatFolder[]) => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([]))
      .finally(() => setLoading(false));
  }, [open, fetchFn]);

  const move = async (folderId: string | null) => {
    if (!threadId) return;
    setSaving(true);
    try {
      const res = await fetchFn('/api/chat-service/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, folderId }),
      });
      if (!res.ok) {
        console.error('[MoveToFolder] PATCH rejected:', res.status);
        return;
      }
      onOpenChange(false);
    } catch (err) {
      console.error('[MoveToFolder] PATCH failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const createAndMove = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetchFn('/api/chat-service/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        console.error('[MoveToFolder] create rejected:', res.status);
        return;
      }
      const folder = (await res.json()) as ChatFolder;
      setNewName('');
      await move(folder.id);
    } catch (err) {
      console.error('[MoveToFolder] create failed:', err);
      setSaving(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 m-auto h-fit w-full max-w-[24rem] rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-primary-600" />
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                Verschieben nach…
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="cursor-pointer rounded-md border-none bg-transparent p-1 text-grey-400 hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="mb-3 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {loading && <span className="px-1 text-sm text-grey-400">Wird geladen…</span>}
            {!loading && folders.length === 0 && (
              <span className="px-1 text-sm text-grey-400">Noch keine Ordner.</span>
            )}
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => move(f.id)}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-primary/10 disabled:opacity-50"
              >
                <Folder className="h-4 w-4 shrink-0 text-grey-500" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <FolderPlus className="h-4 w-4 shrink-0 text-grey-500" />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createAndMove();
              }}
              placeholder="Neuen Ordner erstellen…"
              className="min-w-0 flex-1 rounded-lg border border-grey-200 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500/50 focus:outline-none dark:border-grey-700"
            />
            <button
              onClick={createAndMove}
              disabled={saving || !newName.trim()}
              className="rounded-lg bg-primary-600 p-1.5 text-white hover:bg-primary-700 disabled:opacity-50"
              aria-label="Ordner erstellen und verschieben"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex justify-between">
            <button
              onClick={() => move(null)}
              disabled={saving || !threadId}
              className="rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-grey-100 disabled:opacity-50 dark:hover:bg-grey-800"
            >
              Aus Ordner entfernen
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-grey-100 dark:hover:bg-grey-800"
            >
              Abbrechen
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});
