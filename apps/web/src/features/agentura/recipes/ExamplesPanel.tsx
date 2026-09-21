/**
 * Examples editor for a recipe: the one raw-text field (split heuristically
 * into individual examples), file upload, and the "Gemeinsamkeiten erkennen"
 * analyze action. Fully controlled — `rawExamples` lives in the parent form
 * state (`RecipeEditor`), this component never copies it into its own state.
 *
 * Lifted out of `TextFormEditor.tsx` (the settings-tab editor Task 6 retires).
 */
import {
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  MAX_TEXT_FORM_TITLE_CHARS,
  type TextFormType,
} from '@gruenerator/contracts';
import { Button, Input, Textarea, toast, useConfirm } from '@gruenerator/ui';
import { useId, useMemo, useRef, useState } from 'react';
import { FiUpload } from 'react-icons/fi';

import { useAnalyzeRecipe } from './api';
import { EXAMPLE_FILE_ACCEPT, extractExampleText } from './extractExampleText';
import { EXAMPLE_SEPARATOR, splitExamples, splitStrategyLabel } from './splitExamples';

const NUM = (n: number) => n.toLocaleString('de-DE');

interface ExamplesPanelProps {
  rawExamples: string;
  onChange: (value: string) => void;
  /** Preset text type, when this recipe is one — labels the analysis request. */
  textType: TextFormType | null;
  /** Recipe title — labels the analysis request when there's no preset type. */
  title: string;
  /**
   * Edits the recipe title. The name lives on the Grundlagen tab, but it is
   * *required here*: without it there is no label to analyse under. Offering it
   * on this tab too is what keeps the examples-first entry from dead-ending.
   */
  onTitleChange: (value: string) => void;
  /**
   * Whether the Anleitung above already holds text. The analysis replaces it
   * wholesale, so a filled one is confirmed away before the request goes out —
   * asking afterwards would spend the model call only to discard its result.
   */
  hasStyleBlock: boolean;
  /** Called with the distilled style block; the parent writes it into `styleBlock`. */
  onAnalyzed: (styleBlock: string) => void;
}

export function ExamplesPanel({
  rawExamples,
  onChange,
  textType,
  title,
  onTitleChange,
  hasStyleBlock,
  onAnalyzed,
}: ExamplesPanelProps) {
  const examplesFieldId = useId();
  const examplesStatusId = useId();
  const titleFieldId = useId();
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  // Warum die Analyse nicht lief — als Meldung neben dem Knopf statt als Toast.
  // Ein Toast ist nach Sekunden weg, und der Editor stellt seine Fehler ohnehin
  // dort auf, wo sie hingehören (siehe `mentionError` in `RecipeEditor`).
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const analyzeMut = useAnalyzeRecipe();

  const split = useMemo(() => splitExamples(rawExamples), [rawExamples]);
  const filledExamples = split.examples;
  const usedChars = rawExamples.trim().length;
  const tooManyExamples = filledExamples.length > MAX_TEXT_FORM_EXAMPLES;
  const tooManyChars = usedChars > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;
  // A preset labels itself server-side; everything else is labelled by its title.
  const labelMissing = !textType && title.trim().length === 0;

  /**
   * Uploaded files are appended to the one field, separated by the same rule the
   * splitter recognises: whatever the OCR read stays visible and editable, so a
   * botched extraction is obvious before it is analysed.
   */
  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setIsReadingFiles(true);
    try {
      const results = await Promise.allSettled(files.map((file) => extractExampleText(file)));
      const blocks: string[] = [];

      results.forEach((result, i) => {
        const name = files[i]?.name ?? 'Datei';
        if (result.status === 'rejected') {
          const err = result.reason as unknown;
          toast.error(
            err instanceof Error ? err.message : `„${name}" konnte nicht gelesen werden.`
          );
          return;
        }
        const text = result.value.trim();
        if (text.length === 0) {
          toast.error(`Aus „${name}" ließ sich kein Text lesen.`);
          return;
        }
        blocks.push(text);
      });

      if (blocks.length === 0) return;

      const merged = [rawExamples.trim(), ...blocks]
        .filter((b) => b.length > 0)
        .join(EXAMPLE_SEPARATOR);
      const truncated = merged.length > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;
      onChange(truncated ? merged.slice(0, MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS) : merged);

      toast.success(
        blocks.length === 1
          ? 'Beispiel aus Datei übernommen.'
          : `${blocks.length} Dateien übernommen.`
      );
      if (truncated) {
        toast.info(`Auf ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen gekürzt.`);
      }
    } finally {
      setIsReadingFiles(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzeError(null);
    if (filledExamples.length === 0) {
      setAnalyzeError('Bitte mindestens ein Beispiel einfügen.');
      return;
    }
    if (tooManyExamples) {
      setAnalyzeError(
        `${filledExamples.length} Beispiele erkannt — höchstens ${MAX_TEXT_FORM_EXAMPLES} sind möglich.`
      );
      return;
    }
    if (tooManyChars) {
      setAnalyzeError(
        `Zu viel Text: ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen.`
      );
      return;
    }
    if (labelMissing) {
      setAnalyzeError('Bitte gib dem Rezept zuerst einen Namen.');
      return;
    }
    if (hasStyleBlock) {
      const ok = await confirm({
        title: 'Vorhandene Anleitung ersetzen?',
        description:
          'Die Analyse schreibt die Anleitung komplett neu. Was jetzt darin steht — auch selbst Geschriebenes — geht dabei verloren.',
        confirmLabel: 'Neu analysieren',
        cancelLabel: 'Behalten',
        variant: 'default',
      });
      if (!ok) return;
    }
    try {
      const block = await analyzeMut.mutateAsync({
        ...(textType ? { textType } : {}),
        title: title.trim(),
        examples: filledExamples.map((content) => ({ content })),
      });
      onAnalyzed(block);
      toast.success('Stil erkannt — du kannst ihn jetzt anpassen.');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analyse fehlgeschlagen.');
    }
  };

  return (
    <div className="flex flex-col gap-md">
      {!textType && (
        <div className="flex flex-col gap-xs">
          <label htmlFor={titleFieldId} className="text-sm font-medium">
            Name
          </label>
          <Input
            id={titleFieldId}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            maxLength={MAX_TEXT_FORM_TITLE_CHARS}
            placeholder="Gib deinem Rezept einen Namen"
          />
          <p className="m-0 text-xs text-foreground-muted">
            Der Name beschriftet den erkannten Stil — ohne ihn lässt sich nicht analysieren. Er
            steht auch auf dem Tab „Grundlagen“.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-sm">
        <label htmlFor={examplesFieldId} className="text-sm font-medium">
          Beispiele — alle in dieses Feld, bis zu {MAX_TEXT_FORM_EXAMPLES} Stück
        </label>
        <p className="m-0 text-xs text-foreground-muted">
          Einfach alles hintereinander einfügen. Wir trennen die Beispiele automatisch — an einer
          Zeile aus <code>---</code>, an Überschriften wie „Beispiel 2&ldquo;, an einer Nummerierung
          oder an doppelten Leerzeilen.
        </p>
        <Textarea
          id={examplesFieldId}
          className="min-h-[280px] font-mono"
          value={rawExamples}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS}
          placeholder={'Beispiel 1…\n\n---\n\nBeispiel 2…'}
          rows={14}
          aria-describedby={examplesStatusId}
        />
        <p
          id={examplesStatusId}
          aria-live="polite"
          className={
            tooManyExamples || tooManyChars
              ? 'm-0 text-xs text-destructive'
              : 'm-0 text-xs text-foreground-muted'
          }
        >
          {filledExamples.length === 0
            ? `0 Beispiele — noch nichts eingefügt (${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen Platz)`
            : `${filledExamples.length} ${filledExamples.length === 1 ? 'Beispiel' : 'Beispiele'} erkannt (${splitStrategyLabel(split.strategy)}) · ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen`}
          {tooManyExamples && ` — höchstens ${MAX_TEXT_FORM_EXAMPLES} Beispiele.`}
        </p>
        <div className="flex flex-wrap items-center gap-md">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isReadingFiles}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline disabled:opacity-60 dark:text-primary-400"
          >
            <FiUpload size={14} /> {isReadingFiles ? 'Lese Dateien…' : 'Dateien hochladen'}
          </button>
          <span className="text-xs text-foreground-muted">
            PDF, Word, PowerPoint, Bilder oder Textdateien
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={EXAMPLE_FILE_ACCEPT}
            className="hidden"
            aria-label="Dateien mit Beispieltexten hochladen"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-xs">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => void handleAnalyze()}
          disabled={
            analyzeMut.isPending || filledExamples.length === 0 || tooManyExamples || labelMissing
          }
        >
          {analyzeMut.isPending ? 'Analysiere…' : 'Gemeinsamkeiten erkennen'}
        </Button>
        {analyzeError && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {analyzeError}
          </p>
        )}
      </div>
    </div>
  );
}
