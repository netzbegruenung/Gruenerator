import { Alert, AlertDescription } from '@gruenerator/ui';
import { useId, useState } from 'react';
import { PiImage, PiSpinner } from 'react-icons/pi';

import { cn } from '@/utils/cn';
import { extractTextFromFile } from '@/utils/scannerExtract';

/**
 * The image formats the OCR route takes — `ALLOWED_EXTENSIONS` in
 * `apps/api/routes/scanner/index.ts`, minus its document entries (.pdf, .docx,
 * .pptx). Those belong to the Dokument tab, which hands the file to DeepL whole
 * and gets a translated file back; reading them out into the text field would
 * throw away their formatting for nothing.
 */
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp';
/** multer's `limits.fileSize` on that route. Checked here too, so a photo that
 *  would be refused never leaves the phone. */
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));

interface ImageTranslatorProps {
  /** Hands the recognised text to the text tab, which is where it gets translated. */
  onExtracted: (text: string) => void;
}

/**
 * Reads the text out of a photo or screenshot and puts it into the Ausgangstext
 * field — a sign, a flyer, a slide someone photographed.
 *
 * This tab translates nothing itself. It ends where the text tab begins, which
 * is deliberate: the recognised text is a guess, and OCR gets a smudged sign
 * wrong often enough that it has to land somewhere editable before anything is
 * billed for translating it.
 *
 * The OCR itself is `POST /api/scanner/extract` (Docling → Mistral OCR), the
 * same door the Scanner page and the recipe examples use — no new endpoint, and
 * nothing here is booked against the Bäume budget, which only meters DeepL,
 * images, Voice and Deep Research.
 */
export function ImageTranslator({ onExtracted }: ImageTranslatorProps) {
  const fileId = useId();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File | null) => {
    if (!file || busy) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`„${file.name}" ist größer als ${MAX_MB} MB.`);
      return;
    }
    setBusy(file.name);
    try {
      const text = await extractTextFromFile(file);
      // An empty answer is not an error — the route did its job, the picture
      // just has no text on it. Saying so beats switching to an empty field and
      // leaving the user to guess what went wrong.
      if (!text.trim()) {
        setError('Auf diesem Bild wurde kein Text gefunden.');
        return;
      }
      onExtracted(text.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Das Bild konnte nicht gelesen werden.');
    } finally {
      setBusy(null);
    }
  };

  return (
    // The drag listeners sit on this plain wrapper, not on the label: a
    // `<label>` is a semantic, non-interactive element and jsx-a11y refuses
    // pointer handlers on one. The visible highlight stays on the zone, and
    // dropping anywhere in the tab now counts, which is the larger target.
    //
    // The rule wants a role and a keyboard path next to any pointer handler.
    // Dragging has no keyboard equivalent by nature — the keyboard and screen
    // reader path is the file input itself, which is a real focusable control
    // with a real label, not a `tabindex="-1"` one hidden inside a
    // `role="button"`. Giving this wrapper a role would recreate exactly the
    // `nested-interactive` violation this component was built to avoid.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="flex flex-col gap-md"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void read(e.dataTransfer.files[0] ?? null);
      }}
    >
      {/* A real label around a real file input, not a `role="button"` with a
          hidden one inside. That shape is what the Dokument tab uses, and axe
          rejects it as `nested-interactive`: a `tabindex="-1"` does not stop
          assistive technology from reaching the input, so the zone announces
          itself as a button that contains a second control. The label needs no
          role, no tabIndex and no key handler — the browser gives the input
          focus, Enter and Space for free, and the drag handlers sit on the
          label because that is the surface people aim at. */}
      <label
        htmlFor={fileId}
        aria-busy={busy !== null}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-sm rounded-[14px] border-2 border-dashed px-md py-xl text-center transition-colors',
          'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
          dragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950'
            : 'border-grey-300 hover:border-grey-400 dark:border-grey-600 dark:hover:border-grey-500'
        )}
      >
        <input
          id={fileId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => void read(e.target.files?.[0] ?? null)}
        />
        {busy ? (
          <PiSpinner
            aria-hidden="true"
            className="animate-spin text-2xl text-primary-600 dark:text-primary-300"
          />
        ) : (
          <PiImage aria-hidden="true" className="text-2xl text-grey-500" />
        )}
        <p className="m-0 text-sm text-foreground">
          {busy ? `„${busy}" wird gelesen …` : 'Bild auswählen oder hierher ziehen'}
        </p>
        <p className="m-0 text-xs text-grey-500">
          {ACCEPT.replaceAll(',', ', ')} — bis {MAX_MB} MB
        </p>
      </label>

      {/* Says where the text goes before anyone drops a file, not after. */}
      <p className="m-0 text-xs text-grey-500">
        Der erkannte Text landet im Ausgangstext-Feld und wird dort übersetzt — dann lässt er sich
        vor dem Übersetzen noch verbessern.
      </p>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
