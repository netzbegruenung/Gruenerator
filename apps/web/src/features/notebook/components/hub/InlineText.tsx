import { useRef, useState, type ReactNode } from 'react';

import { cn } from '../../../../utils/cn';

interface InlineTextProps {
  value: string;
  onSave: (next: string) => void;
  /** Zeigt den Ruhezustand; der Knopf darum macht ihn per Tastatur erreichbar. */
  children: ReactNode;
  label: string;
  multiline?: boolean;
  maxLength: number;
  placeholder?: string;
  /** Startet direkt im Bearbeiten, z. B. beim frisch angelegten Notebook. */
  startEditing?: boolean;
  disabled?: boolean;
  inputClassName?: string;
}

/**
 * Klick → Feld, Enter speichert, Escape verwirft, Verlassen speichert. Bei
 * `multiline` bricht Shift+Enter um. Gespeichert wird nur, was sich geändert
 * hat — ein leerer Name bleibt der alte (das entscheidet der Aufrufer).
 */
export function InlineText({
  value,
  onSave,
  children,
  label,
  multiline = false,
  maxLength,
  placeholder,
  startEditing = false,
  disabled = false,
  inputClassName,
}: InlineTextProps) {
  const [editing, setEditing] = useState(startEditing);
  const cancelled = useRef(false);

  const finish = (raw: string) => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = raw.trim().slice(0, maxLength);
    if (next !== value) onSave(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelled.current = true;
      e.currentTarget.blur();
    }
  };

  if (editing) {
    const shared = {
      autoFocus: true,
      defaultValue: value,
      maxLength,
      placeholder,
      'aria-label': label,
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        e.currentTarget.select(),
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        finish(e.currentTarget.value),
      onKeyDown,
      className: cn(
        'w-full bg-transparent text-center text-foreground outline-none',
        inputClassName
      ),
    };
    return multiline ? <textarea rows={2} {...shared} /> : <input {...shared} />;
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={disabled}
      title={label}
      className="group inline-flex max-w-full items-center justify-center gap-sm rounded-lg px-sm py-[2px] text-center transition-colors hover:bg-background-alt disabled:cursor-default disabled:hover:bg-transparent"
    >
      {children}
      <span className="sr-only">{`, ${label}`}</span>
    </button>
  );
}
