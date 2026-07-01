'use client';

import { type KeyboardEvent, memo, useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Tag, X } from 'lucide-react';

import { useChatConfigStore } from '../../stores/chatConfigStore';
import { setThreadTagsCache } from '../../runtime/GrueneratorThreadListAdapter';

interface EditTagsDialogProps {
  threadId: string | null;
  initialTags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;

/** Normalize a hand-entered tag to match the server-side auto-tag rules
 *  (threadTagService.parseTags): strip wrapping quotes/dashes/asterisks,
 *  lowercase, trim, cap length. Keeps manual and auto tags in the same form
 *  so the tag filter (jsonb `?|`) treats them as equal. */
function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^["'\-*]+|["']+$/g, '')
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

export const EditTagsDialog = memo(function EditTagsDialog({
  threadId,
  initialTags,
  open,
  onOpenChange,
}: EditTagsDialogProps) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-sync when opening for a different thread.
  useEffect(() => {
    if (open) setTags(initialTags);
  }, [open, initialTags]);

  const addTag = (value: string) => {
    const tag = normalizeTag(value);
    if (tag.length < 2) return;
    setTags((prev) => (prev.includes(tag) || prev.length >= MAX_TAGS ? prev : [...prev, tag]));
    setDraft('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handleSave = async () => {
    if (!threadId) return;
    setSaving(true);
    try {
      const res = await fetchFn('/api/chat-service/threads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, tags }),
      });
      // fetchFn resolves on 4xx/5xx too — only persist to the cache and close
      // if the server actually accepted the update, else surface the failure.
      if (!res.ok) {
        console.error('[EditTags] PATCH rejected:', res.status);
        return;
      }
      setThreadTagsCache(threadId, tags);
      onOpenChange(false);
    } catch (err) {
      console.error('[EditTags] PATCH failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 m-auto h-fit w-full max-w-[24rem] rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary-600" />
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                Tags bearbeiten
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.length === 0 && <span className="text-sm text-grey-400">Noch keine Tags.</span>}
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary-500/10 px-2.5 py-1 text-xs text-primary-700 dark:text-primary-300"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="rounded-full hover:text-destructive"
                  aria-label={`Tag ${tag} entfernen`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tag eingeben, Enter zum Hinzufügen"
            className="w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500/50 focus:outline-none"
          />

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-grey-100 dark:hover:bg-grey-800"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !threadId}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});
