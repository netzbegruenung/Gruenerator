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
  type TextFormType,
} from '@gruenerator/contracts';
import { Button, Textarea, toast } from '@gruenerator/ui';
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
  /** Called with the distilled style block; the parent writes it into `styleBlock`. */
  onAnalyzed: (styleBlock: string) => void;
}

export function ExamplesPanel({
  rawExamples,
  onChange,
  textType,
  title,
  onAnalyzed,
}: ExamplesPanelProps) {
  const examplesFieldId = useId();
  const examplesStatusId = useId();
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeMut = useAnalyzeRecipe();

  const split = useMemo(() => splitExamples(rawExamples), [rawExamples]);
  const filledExamples = split.examples;
  const usedChars = rawExamples.trim().length;
  const tooManyExamples = filledExamples.length > MAX_TEXT_FORM_EXAMPLES;
  const tooManyChars = usedChars > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;

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
    if (filledExamples.length === 0) {
      toast.error('Bitte mindestens ein Beispiel einfügen.');
      return;
    }
    if (tooManyExamples) {
      toast.error(
        `${filledExamples.length} Beispiele erkannt — höchstens ${MAX_TEXT_FORM_EXAMPLES} sind möglich.`
      );
      return;
    }
    if (tooManyChars) {
      toast.error(
        `Zu viel Text: ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen.`
      );
      return;
    }
    try {
      const block = await analyzeMut.mutateAsync({
        ...(textType ? { textType } : { title: title.trim() }),
        examples: filledExamples.map((content) => ({ content })),
      });
      onAnalyzed(block);
      toast.success('Stil erkannt — du kannst ihn jetzt anpassen.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analyse fehlgeschlagen.');
    }
  };

  return (
    <div className="flex flex-col gap-md">
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

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => void handleAnalyze()}
        disabled={analyzeMut.isPending || filledExamples.length === 0 || tooManyExamples}
      >
        {analyzeMut.isPending ? 'Analysiere…' : 'Gemeinsamkeiten erkennen'}
      </Button>
    </div>
  );
}
