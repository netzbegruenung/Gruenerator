/**
 * Examples editor for a recipe: the one raw-text field (split heuristically
 * into individual examples), file upload, and the "Anleitung erstellen"
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
import {
  useAnalyzeRecipe,
  EXAMPLE_SEPARATOR,
  splitExamples,
} from '@gruenerator/shared/grueneratoren';
import { Button, Textarea, toast, useConfirm } from '@gruenerator/ui';
import { useId, useMemo, useRef, useState } from 'react';
import { FiUpload } from 'react-icons/fi';

import { EXAMPLE_FILE_ACCEPT, extractExampleText } from './extractExampleText';

const NUM = (n: number) => n.toLocaleString('de-DE');

interface ExamplesPanelProps {
  rawExamples: string;
  onChange: (value: string) => void;
  /** Preset text type, when this recipe is one — carried on the request. */
  textType: TextFormType | null;
  /**
   * Recipe title — labels the analysis, and required for it whatever the text
   * type. Edited in the form above this disclosure; this panel only reads it,
   * and says so when it is missing.
   */
  title: string;
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
  hasStyleBlock,
  onAnalyzed,
}: ExamplesPanelProps) {
  const examplesFieldId = useId();
  const examplesStatusId = useId();
  const examplesHintId = useId();
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
  // Der Titel beschriftet die Analyse — immer, auch bei einem Preset. Die
  // frühere Fassung ließ `textType` als Ersatz gelten; wer den Namen eines
  // Preset-Rezepts leerte, bekam damit einen aktiven Knopf und einen rohen 400
  // statt dieser Sperre.
  const labelMissing = title.trim().length === 0;

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

  const overLimit = tooManyExamples || tooManyChars;
  return (
    <div className="flex flex-col gap-sm">
      {/* Keine sichtbare Überschrift: „Aus Beispielen lernen" steht schon darüber.
          Wie getrennt wird, braucht nur, wer nicht sieht, was der Zähler meldet. */}
      <label htmlFor={examplesFieldId} className="sr-only">
        Beispiele
      </label>
      <p id={examplesHintId} className="sr-only">
        Bis zu {MAX_TEXT_FORM_EXAMPLES} Texte hintereinander einfügen, getrennt durch eine Zeile aus
        drei Bindestrichen oder eine Leerzeile.
      </p>
      <Textarea
        id={examplesFieldId}
        className="max-h-[60vh] min-h-[calc(6lh+1rem)]"
        value={rawExamples}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS}
        placeholder={
          'Füge zwei oder drei Texte ein, die so klingen sollen …\n\n---\n\nMehrere Texte mit --- trennen.'
        }
        rows={6}
        aria-describedby={`${examplesHintId} ${examplesStatusId}`}
        aria-invalid={overLimit ? true : undefined}
      />
      <p
        id={examplesStatusId}
        aria-live="polite"
        className={
          overLimit
            ? 'm-0 min-h-4 text-xs text-destructive'
            : 'm-0 min-h-4 text-xs text-foreground-muted'
        }
      >
        {filledExamples.length > 0 &&
          `${filledExamples.length} ${filledExamples.length === 1 ? 'Beispiel' : 'Beispiele'} erkannt`}
        {tooManyExamples && ` — höchstens ${MAX_TEXT_FORM_EXAMPLES} möglich.`}
        {tooManyChars &&
          ` — ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen, bitte kürzen.`}
      </p>

      <div className="flex flex-wrap items-center gap-sm">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isReadingFiles}
          title="PDF, Word, PowerPoint, Bilder oder Textdateien"
          className="flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground disabled:opacity-60"
        >
          <FiUpload size={14} aria-hidden />{' '}
          {isReadingFiles ? 'Lese Dateien…' : 'Dateien hochladen'}
        </button>
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
        <Button
          type="button"
          variant="brand"
          size="brand-sm"
          className="ml-auto"
          onClick={() => void handleAnalyze()}
          disabled={
            analyzeMut.isPending || filledExamples.length === 0 || tooManyExamples || labelMissing
          }
        >
          {analyzeMut.isPending ? 'Wird erstellt …' : 'Anleitung erstellen'}
        </Button>
      </div>
      {labelMissing && filledExamples.length > 0 && (
        <p className="m-0 text-xs text-foreground-muted">Gib dem Rezept oben einen Namen.</p>
      )}
      {analyzeError && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {analyzeError}
        </p>
      )}
    </div>
  );
}
