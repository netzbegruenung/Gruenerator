import { SLIDE_ALT_TEXT_MAX_CHARS } from '@gruenerator/contracts';
import { useCallback, useId, useState } from 'react';
import { HiChatBubbleBottomCenterText } from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { cn } from '../../../utils/cn';
import { MOBILE_INPUT_TEXT } from '../../sidebarStyles';

import { ToolPanel } from './ToolPanel';

import type { AltTextPage, AltTextScope } from '../../../CanvasEditorProvider';

export interface AltTextPagesSource {
  collect: (scope: AltTextScope) => Promise<AltTextPage[]>;
  pageCount: number;
}

export interface AltTextToolProps {
  pages: AltTextPagesSource;
}

interface AltTextResult {
  pageNumber: number;
  text: string | null;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-xs text-primary-600 bg-transparent border-none cursor-pointer hover:underline p-0"
    >
      {copied ? 'Kopiert' : label}
    </button>
  );
}

export function AltTextTool({ pages }: AltTextToolProps) {
  const { generateSlideAltTexts } = useCanvasEditorServices();
  const scopeName = useId();
  const [scope, setScope] = useState<AltTextScope>('all');
  const [isBusy, setIsBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AltTextResult[]>([]);

  const multiPage = pages.pageCount > 1;
  const effectiveScope: AltTextScope = multiPage ? scope : 'active';

  const handleAction = useCallback(async () => {
    if (!generateSlideAltTexts) return;
    setError(null);
    setIsBusy(true);
    setProgressMessage('Seiten werden erfasst…');
    try {
      const collected = await pages.collect(effectiveScope);
      setProgressMessage(
        collected.length > 1
          ? `${collected.length} Alt-Texte werden geschrieben…`
          : 'Alt-Text wird geschrieben…'
      );
      const texts = await generateSlideAltTexts(collected);
      setResults(
        collected.map((page, i) => ({ pageNumber: page.pageNumber, text: texts[i] ?? null }))
      );
      if (texts.some((t) => t === null)) {
        setError('Nicht jede Seite hat geklappt. Bitte noch einmal versuchen.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Alt-Texte');
    } finally {
      setIsBusy(false);
      setProgressMessage(null);
    }
  }, [generateSlideAltTexts, pages, effectiveScope]);

  const updateText = (pageNumber: number, text: string) =>
    setResults((prev) => prev.map((r) => (r.pageNumber === pageNumber ? { ...r, text } : r)));

  if (!generateSlideAltTexts) return null;

  const done = results.filter((r): r is AltTextResult & { text: string } => r.text !== null);
  const allText = done.map((r) => `Seite ${r.pageNumber}: ${r.text}`).join('\n\n');

  const scopeChoice = multiPage ? (
    <fieldset className="m-0 p-0 border-none flex flex-col gap-1.5">
      <legend className="text-xs text-foreground-muted mb-1">Für welche Seiten?</legend>
      {(
        [
          ['all', `Alle Seiten (${pages.pageCount})`],
          ['active', 'Nur aktuelle Seite'],
        ] as const
      ).map(([value, label]) => (
        <label
          key={value}
          className="flex items-center gap-2 text-sm text-foreground cursor-pointer"
        >
          <input
            type="radio"
            name={scopeName}
            value={value}
            checked={scope === value}
            onChange={() => setScope(value)}
            disabled={isBusy}
          />
          {label}
        </label>
      ))}
    </fieldset>
  ) : null;

  return (
    <ToolPanel
      body={
        <>
          <p className="m-0 text-xs text-foreground-muted leading-snug">
            Beschreibt deine Seiten für Menschen, die Bilder nicht sehen. Füge den Text beim Posten
            ins Alt-Text-Feld ein (Instagram: „Erweiterte Einstellungen“ → „Alternativtext
            schreiben“).
          </p>
          {scopeChoice}
        </>
      }
      actionLabel={results.length > 0 ? 'Neu erstellen' : 'Alt-Texte erstellen'}
      actionIcon={HiChatBubbleBottomCenterText}
      canSubmit
      isBusy={isBusy}
      progressMessage={progressMessage}
      error={error}
      onAction={() => void handleAction()}
      footer={
        results.length > 0 ? (
          <div className="flex flex-col gap-3">
            {done.length > 1 ? (
              <div className="flex justify-end">
                <CopyButton text={allText} label="Alle kopieren" />
              </div>
            ) : null}
            {results.map((result) => (
              <AltTextResultField
                key={result.pageNumber}
                result={result}
                onChange={(text) => updateText(result.pageNumber, text)}
              />
            ))}
            <p className="m-0 text-xs text-foreground-muted leading-snug">
              KI-Vorschlag – bitte vor dem Posten lesen und bei Bedarf anpassen.
            </p>
          </div>
        ) : null
      }
    />
  );
}

function AltTextResultField({
  result,
  onChange,
}: {
  result: AltTextResult;
  onChange: (text: string) => void;
}) {
  const fieldId = useId();
  const label = `Seite ${result.pageNumber}`;
  if (result.text === null) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <p className="m-0 text-xs text-foreground-muted">Konnte nicht erstellt werden.</p>
      </div>
    );
  }
  const tooLong = result.text.length > SLIDE_ALT_TEXT_MAX_CHARS;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor={fieldId} className="text-xs font-semibold text-foreground">
          {label}
        </label>
        <CopyButton text={result.text} label="Kopieren" />
      </div>
      <textarea
        id={fieldId}
        value={result.text}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className={`w-full resize-y rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] p-2 text-sm ${MOBILE_INPUT_TEXT} text-[var(--editor-text)] leading-snug`}
      />
      <span
        className={cn(
          'text-xs self-end',
          tooLong ? 'text-[var(--editor-danger-fg)]' : 'text-foreground-muted'
        )}
        aria-live="polite"
      >
        {result.text.length} / {SLIDE_ALT_TEXT_MAX_CHARS} Zeichen
        {tooLong ? ' – zu lang für Instagram' : ''}
      </span>
    </div>
  );
}
