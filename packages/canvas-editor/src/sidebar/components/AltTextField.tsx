import { useId } from 'react';

import { useAnnounce } from '../../hooks/useAnnounce';
import { MOBILE_INPUT_TEXT } from '../sidebarStyles';

/** Vorschlag aus dem Text auf der Leinwand; ohne Text gibt es keinen Vorschlag. */
export function composeAltText(canvasText: string): string {
  const text = canvasText.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return `Sharepic mit dem Text: ${text}${/[.!?]$/.test(text) ? '' : '.'}`;
}

/** Hängt die Bildbeschreibung als eigene Zeile an; ein geleertes Feld hängt nichts an. */
export function withAltText(shareText: string, altText: string): string {
  const alt = altText.trim();
  if (!alt) return shareText;
  const line = `Bildbeschreibung: ${alt}`;
  return shareText ? `${shareText}\n${line}` : line;
}

interface AltTextFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function AltTextField({ value, onChange }: AltTextFieldProps) {
  const fieldId = useId();
  const hintId = useId();
  const announce = useAnnounce();

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => announce('Alt-Text kopiert'));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-xs font-semibold text-foreground">
        Bildbeschreibung (Alt-Text)
      </label>
      <textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hintId}
        rows={4}
        className={`w-full resize-y rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] p-2 text-sm ${MOBILE_INPUT_TEXT} text-[var(--editor-text)] leading-snug`}
      />
      <p id={hintId} className="m-0 text-xs text-foreground-muted leading-snug">
        Damit auch Menschen mit Screenreader wissen, was auf dem Bild steht.
      </p>
      <button
        type="button"
        onClick={copy}
        disabled={!value.trim()}
        className="self-start min-h-6 rounded-lg border border-editor-border bg-transparent px-3 py-1 text-sm font-medium text-foreground cursor-pointer hover:bg-editor-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Alt-Text kopieren
      </button>
    </div>
  );
}
