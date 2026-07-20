'use client';

import { memo, useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Users, FolderPlus, X } from 'lucide-react';

import { useChatConfigStore } from '../../stores/chatConfigStore';

interface Space {
  id: string;
  name: string;
}

interface MoveToSpaceDialogProps {
  threadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** File a chat into one of the user's Spaces (groups), or remove it from its
 *  Space. Personal or team — a Space is just a group. Fetches via the ChatConfig
 *  store's fetch fn and PATCHes chat_threads.group_id. */
export const MoveToSpaceDialog = memo(function MoveToSpaceDialog({
  threadId,
  open,
  onOpenChange,
}: MoveToSpaceDialogProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  // New Spaces created from a chat default to personal (solo organizing); the
  // user can opt into a team Space.
  const [newIsTeam, setNewIsTeam] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchFn('/api/chat-service/threads/user-groups')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Space[]) => setSpaces(Array.isArray(data) ? data : []))
      .catch(() => setSpaces([]))
      .finally(() => setLoading(false));
  }, [open, fetchFn]);

  const file = async (groupId: string | null) => {
    if (!threadId) return;
    setSaving(true);
    try {
      const res = await fetchFn('/api/chat-service/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, groupId }),
      });
      if (!res.ok) {
        console.error('[MoveToSpace] PATCH rejected:', res.status);
        return;
      }
      // Let the web Space page / sidebar refresh their filed-chats lists.
      try {
        window.dispatchEvent(new CustomEvent('gruenerator:space-threads-changed'));
      } catch {
        // no window (SSR) — ignore
      }
      onOpenChange(false);
    } catch (err) {
      console.error('[MoveToSpace] PATCH failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const createAndFile = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetchFn('/api/auth/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, groupType: newIsTeam ? 'standard' : 'personal' }),
      });
      if (!res.ok) {
        console.error('[MoveToSpace] create rejected:', res.status);
        setSaving(false);
        return;
      }
      const data = (await res.json()) as { group?: { id: string } };
      const id = data.group?.id;
      setNewName('');
      if (id) await file(id);
      else setSaving(false);
    } catch (err) {
      console.error('[MoveToSpace] create failed:', err);
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
              <Users className="h-5 w-5 text-primary-600" />
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                Zu Space hinzufügen
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="cursor-pointer rounded-md border-none bg-transparent p-1 text-grey-400 hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="mb-3 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {loading && <span className="px-1 text-sm text-grey-400">Wird geladen…</span>}
            {!loading && spaces.length === 0 && (
              <span className="px-1 text-sm text-grey-400">Noch keine Spaces.</span>
            )}
            {spaces.map((s) => (
              <button
                key={s.id}
                onClick={() => file(s.id)}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-primary/10 disabled:opacity-50"
              >
                <Users className="h-4 w-4 shrink-0 text-grey-500" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4 shrink-0 text-grey-500" />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createAndFile();
                }}
                placeholder="Neuen Space erstellen…"
                className="min-w-0 flex-1 rounded-lg border border-grey-200 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500/50 focus:outline-none dark:border-grey-700"
              />
              <button
                onClick={() => void createAndFile()}
                disabled={saving || !newName.trim()}
                className="rounded-lg bg-primary-600 px-2.5 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Anlegen
              </button>
            </div>
            <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 pl-6 text-xs text-grey-500">
              <input
                type="checkbox"
                checked={newIsTeam}
                onChange={(e) => setNewIsTeam(e.target.checked)}
                className="h-3 w-3"
              />
              Als Gruppen-Space (mit Team)
            </label>
          </div>

          <p className="mt-3 text-xs text-grey-400">
            Ein Chat hat einen Heim-Space. Über „Teilen" kannst du ihn zusätzlich mit weiteren
            Spaces teilen.
          </p>

          <div className="mt-4 flex justify-between">
            <button
              onClick={() => file(null)}
              disabled={saving || !threadId}
              className="rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-grey-100 disabled:opacity-50 dark:hover:bg-grey-800"
            >
              Aus Space entfernen
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
