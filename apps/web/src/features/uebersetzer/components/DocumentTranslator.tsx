import {
  type TranslationFormality,
  type TranslationLanguagesResponse,
  TRANSLATION_DOCUMENT_EXTENSIONS,
  TRANSLATION_DOCUMENT_MAX_BYTES,
} from '@gruenerator/contracts';
import { Alert, AlertDescription, Button, Label } from '@gruenerator/ui';
import { useId, useRef, useState, type DragEvent } from 'react';
import { PiDownloadSimple, PiFileText, PiUploadSimple } from 'react-icons/pi';

import {
  downloadTranslatedDocument,
  useDocumentStatus,
  useUploadDocument,
} from '../hooks/useTranslation';

import { FormalityToggle } from './FormalityToggle';
import {
  AUTO,
  defaultTarget,
  glossaryTargets,
  NF,
  selectCls,
  sourceOptions,
  targetOptions,
} from './languageOptions';

import { TreeBudgetLine } from '@/components/common/TreeBudgetLine';
import { cn } from '@/utils/cn';

interface DocumentTranslatorProps {
  data: TranslationLanguagesResponse;
}

const ACCEPT = TRANSLATION_DOCUMENT_EXTENSIONS.map((e) => `.${e}`).join(',');
const MAX_MB = Math.round(TRANSLATION_DOCUMENT_MAX_BYTES / (1024 * 1024));

function extensionOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Upload → poll → download. The server buffers DeepL's one-shot result, so
 * the download button can be pressed again if the first attempt fails.
 */
export function DocumentTranslator({ data }: DocumentTranslatorProps) {
  const { languages, glossaryPairs, quota } = data;
  const sources = sourceOptions(languages);
  const targets = targetOptions(languages);

  const [file, setFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState<string>(AUTO);
  const [targetLang, setTargetLang] = useState<string>(() => defaultTarget(languages));
  const [formality, setFormality] = useState<TranslationFormality>('default');
  const [asDocx, setAsDocx] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const upload = useUploadDocument();
  const status = useDocumentStatus(jobId);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const sourceId = useId();
  const targetId = useId();
  const docxId = useId();

  const target = targets.find((l) => l.code === targetLang);
  // A glossary needs an explicit source. Whenever a dictionary translates INTO
  // the chosen target, "auto" would silently drop it — so the source is required.
  const sourceRequired = glossaryTargets(glossaryPairs, targetLang);
  const isPdf = file ? extensionOf(file) === 'pdf' : false;
  const fileError = file
    ? !(TRANSLATION_DOCUMENT_EXTENSIONS as readonly string[]).includes(extensionOf(file))
      ? `„${file.name}" wird nicht unterstützt. Möglich sind: ${ACCEPT.replaceAll(',', ', ')}.`
      : file.size > TRANSLATION_DOCUMENT_MAX_BYTES
        ? `„${file.name}" ist größer als ${MAX_MB} MB.`
        : null
    : null;
  const busy =
    upload.isPending || status.data?.status === 'queued' || status.data?.status === 'translating';
  const canStart =
    !!file && !fileError && !busy && !!targetLang && !(sourceRequired && sourceLang === AUTO);

  const pick = (next: File | null) => {
    setFile(next);
    setJobId(null);
    setDownloadError(null);
    upload.reset();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0] ?? null);
  };

  const start = () => {
    if (!file || !canStart) return;
    setDownloadError(null);
    upload.mutate(
      {
        file,
        targetLang,
        sourceLang: sourceLang === AUTO ? null : sourceLang,
        formality: formality === 'default' ? null : formality,
        outputFormat: isPdf && asDocx ? 'docx' : null,
      },
      { onSuccess: (job) => setJobId(job.jobId) }
    );
  };

  const download = async () => {
    if (!jobId || !status.data) return;
    setDownloadError(null);
    try {
      await downloadTranslatedDocument(jobId, status.data.filename);
    } catch {
      setDownloadError('Der Download ist fehlgeschlagen. Bitte noch einmal versuchen.');
    }
  };

  const error =
    fileError ?? upload.error?.message ?? status.error?.message ?? downloadError ?? null;
  const jobState = status.data;

  return (
    <div className="flex flex-col gap-md">
      {/* The whole zone is the picker button: click, Enter or Space open the
          native file dialog, dragging a file onto it is the pointer shortcut. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={
          file ? `Datei: ${file.name}. Andere Datei wählen` : 'Datei auswählen oder hierher ziehen'
        }
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-sm rounded-lg border-2 border-dashed px-md py-xl text-center transition-colors',
          'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          dragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950'
            : 'border-grey-300 hover:border-grey-400 dark:border-grey-600 dark:hover:border-grey-500'
        )}
      >
        <input
          ref={inputRef}
          id={fileId}
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <PiUploadSimple aria-hidden="true" className="text-2xl text-grey-500" />
        {file ? (
          <p className="m-0 flex flex-wrap items-center justify-center gap-xs text-sm text-foreground">
            <PiFileText aria-hidden="true" className="shrink-0" />
            <span className="break-all">{file.name}</span>
            <span className="text-grey-500">({NF.format(Math.ceil(file.size / 1024))} KB)</span>
          </p>
        ) : (
          <p className="m-0 text-sm text-foreground">Datei auswählen oder hierher ziehen</p>
        )}
        <p className="m-0 text-xs text-grey-500">
          {ACCEPT.replaceAll(',', ', ')} — bis {MAX_MB} MB
        </p>
      </div>

      <div className="grid gap-sm md:grid-cols-2">
        <div className="flex flex-col gap-xs">
          <Label htmlFor={sourceId}>Von</Label>
          <select
            id={sourceId}
            className={selectCls}
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            aria-describedby={sourceRequired ? `${sourceId}-hint` : undefined}
          >
            <option value={AUTO} disabled={sourceRequired}>
              {sourceRequired ? 'Bitte wählen' : 'Automatisch erkennen'}
            </option>
            {sources.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          {sourceRequired ? (
            <p id={`${sourceId}-hint`} className="m-0 text-xs text-grey-500">
              Für diese Zielsprache gibt es ein Glossar — dafür braucht DeepL die Ausgangssprache.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-xs">
          <Label htmlFor={targetId}>Nach</Label>
          <select
            id={targetId}
            className={selectCls}
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {targets.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {target?.formality ? <FormalityToggle value={formality} onChange={setFormality} /> : null}

      {isPdf ? (
        <label htmlFor={docxId} className="flex items-center gap-xs text-sm text-foreground">
          <input
            id={docxId}
            type="checkbox"
            checked={asDocx}
            onChange={(e) => setAsDocx(e.target.checked)}
          />
          Als bearbeitbare Word-Datei (.docx) ausgeben
        </label>
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {jobState ? (
        <div className="flex flex-col gap-xs rounded-md bg-background-alt p-md" aria-live="polite">
          {jobState.status === 'done' ? (
            <>
              <p className="m-0 text-sm text-foreground">
                Fertig: <strong>{jobState.filename}</strong>
                {jobState.billedCharacters
                  ? ` — ${NF.format(jobState.billedCharacters)} Zeichen abgerechnet`
                  : ''}
              </p>
              <div>
                <Button type="button" variant="brand" onClick={() => void download()}>
                  <PiDownloadSimple aria-hidden="true" />
                  Herunterladen
                </Button>
              </div>
            </>
          ) : jobState.status === 'error' ? (
            <p className="m-0 text-sm text-destructive">{jobState.message}</p>
          ) : (
            <p className="m-0 text-sm text-foreground">
              DeepL übersetzt „{jobState.filename}“ …
              {jobState.secondsRemaining ? ` (noch etwa ${jobState.secondsRemaining} s)` : ''}
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex flex-col gap-xs">
          <TreeBudgetLine status={quota} />
          <p className="m-0 text-xs text-grey-500">
            DeepL rechnet jedes Dokument mit mindestens 50.000 Zeichen ab.
          </p>
        </div>
        <Button type="button" variant="brand" disabled={!canStart} onClick={start}>
          {busy ? 'Übersetze …' : 'Dokument übersetzen'}
        </Button>
      </div>
    </div>
  );
}
