// SPDX-License-Identifier: MPL-2.0
import { useAnnounce } from '@ggraphic/editor/hooks/useAnnounce';
import { useAutoSaveStore, useAutoSaveStoreApi } from '@ggraphic/editor/stores/useAutoSaveStore';
import { useId } from 'react';

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

/**
 * The alt text for the exported image: the person's edit, else the suggestion
 * from the canvas text. The edit lives in the per-editor store, so the sidebar
 * and the top-bar share read and write the same value.
 */
export function useShareAltText(imageText: string): [string, (value: string) => void] {
  const storeApi = useAutoSaveStoreApi();
  const edited = useAutoSaveStore((s) => s.shareAltText);
  const set = (value: string) => storeApi.getState().setShareAltText(value);
  return [edited ?? composeAltText(imageText), set];
}

/**
 * The alt text that goes into the shared post text: only when the person ticked
 * „Bildbeschreibung im Beitragstext mitschicken" (off by default), else empty.
 */
export function useCaptionAltText(altText: string): string {
  const include = useAutoSaveStore((s) => s.shareAltTextInCaption);
  return include ? altText : '';
}

interface AltTextFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function AltTextField({ value, onChange }: AltTextFieldProps) {
  const fieldId = useId();
  const hintId = useId();
  const announce = useAnnounce();
  const storeApi = useAutoSaveStoreApi();
  const inCaption = useAutoSaveStore((s) => s.shareAltTextInCaption);

  // Ohne Clipboard-API (WebView, unsicherer Ursprung) oder bei verweigertem
  // Zugriff hört die Person, dass nichts kopiert wurde.
  const copy = () => {
    const failed = () => announce('Kopieren nicht möglich');
    if (!navigator.clipboard?.writeText) {
      failed();
      return;
    }
    navigator.clipboard.writeText(value).then(() => announce('Alt-Text kopiert'), failed);
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
      <label className="flex min-h-6 items-center gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={inCaption}
          onChange={(e) => storeApi.getState().setShareAltTextInCaption(e.target.checked)}
          className="size-4 accent-primary-600 cursor-pointer"
        />
        Bildbeschreibung im Beitragstext mitschicken
      </label>
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
