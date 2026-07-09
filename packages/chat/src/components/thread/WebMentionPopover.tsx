'use client';

import { useEffect, useState } from 'react';
import { MentionFloatingPanel } from './MentionFloatingPanel';

interface WebMentionPopoverProps {
  visible: boolean;
  onSelect: (url: string) => void;
  onDismiss: () => void;
}

/** Normalize user input to an absolute http(s) URL, or null if it isn't one. */
function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function WebMentionPopover({ visible, onSelect, onDismiss }: WebMentionPopoverProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!visible) setValue('');
  }, [visible]);

  const normalized = normalizeUrl(value);

  const confirm = () => {
    if (!normalized) return;
    onSelect(normalized);
    setValue('');
  };

  return (
    <MentionFloatingPanel
      open={visible}
      onDismiss={onDismiss}
      width="w-[360px]"
      role="dialog"
      ariaLabel="Webseite anhängen"
    >
      <div
        className="flex flex-col gap-3 p-3"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDismiss();
          }
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted/70">
          Webseite anhängen
        </span>
        <input
          type="url"
          inputMode="url"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirm();
            }
          }}
          placeholder="https://example.org/artikel"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/40"
        />
        <p className="text-xs text-foreground-muted">
          Der Inhalt der Seite wird beim Senden abgerufen und als Kontext genutzt.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onDismiss();
            }}
            className="rounded-md px-2 py-1 text-xs text-foreground-muted hover:bg-primary/5"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!normalized}
            onMouseDown={(e) => {
              e.preventDefault();
              confirm();
            }}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Anhängen
          </button>
        </div>
      </div>
    </MentionFloatingPanel>
  );
}
