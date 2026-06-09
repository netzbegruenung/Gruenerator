import { memo, useEffect, useRef, useState } from 'react';

import { Markdown } from '@/components/common/Markdown/Markdown';

interface CardDescriptionProps {
  value: string;
  /** Persist the markdown string (called on blur if changed). */
  onSave: (markdown: string) => void;
}

/**
 * Card description with lightweight Markdown support. Renders formatted Markdown
 * in read mode; click switches to a raw textarea, and blur saves the markdown
 * string back to the cell (same on-blur model as the rest of the card fields).
 */
export const CardDescription = memo(function CardDescription({
  value,
  onSave,
}: CardDescriptionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={5}
        className="w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-primary-500 resize-y text-foreground placeholder:text-grey-400 leading-relaxed"
        placeholder="Beschreibung (Markdown wird unterstützt)…"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full min-h-[2.5rem] rounded-lg border border-transparent hover:border-grey-200 dark:hover:border-grey-700 bg-transparent px-3 py-2 text-left cursor-text transition-colors"
      title="Zum Bearbeiten klicken"
    >
      {value.trim() ? (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
          <Markdown>{value}</Markdown>
        </div>
      ) : (
        <span className="text-sm text-grey-400 dark:text-grey-300">Beschreibung hinzufügen…</span>
      )}
    </button>
  );
});
