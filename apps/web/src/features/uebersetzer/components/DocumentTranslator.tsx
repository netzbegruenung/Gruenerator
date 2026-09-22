import {
  type TranslationFormality,
  type TranslationLanguagesResponse,
  TRANSLATION_DOCUMENT_EXTENSIONS,
  TRANSLATION_DOCUMENT_MAX_BYTES,
} from '@gruenerator/contracts';
import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { useId, useState, type DragEvent } from 'react';
import { PiDownloadSimple, PiFileText, PiUploadSimple } from 'react-icons/pi';

import {
  downloadTranslatedDocument,
  useDocumentStatus,
  useUploadDocument,
} from '../hooks/useTranslation';

import { FormalityMenu } from './FormalityMenu';
import { LanguageBar } from './LanguageBar';
import {
  AUTO,
  defaultTarget,
  glossaryTargets,
  initialRecent,
  NF,
  pushRecent,
  sourceOptions,
  targetOptions,
} from './languageOptions';

import { TreeBudgetChip } from '@/components/common/TreeBudgetLine';
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
  const [recentSource, setRecentSource] = useState(() =>
    initialRecent(sources, [AUTO, 'de', defaultTarget(languages)])
  );
  const [recentTarget, setRecentTarget] = useState(() =>
    initialRecent(targets, [defaultTarget(languages), 'de'], 3)
  );

  const upload = useUploadDocument();
  const status = useDocumentStatus(jobId);
  const fileId = useId();
  const docxId = useId();
  const sourceHintId = useId();

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
      {/* The drag listeners sit on this plain wrapper rather than on the label:
          a `<label>` is a semantic, non-interactive element and jsx-a11y
          refuses pointer handlers on one. The rule wants a role and a keyboard
          path beside any pointer handler — dragging has none by nature, and the
          keyboard and screen-reader path is the file input itself. Giving this
          wrapper a role would recreate the very violation below. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* A real label around a real file input. This zone used to be a
            `role="button"` holding a `tabindex="-1" aria-hidden` input, and axe
            rejects that as `nested-interactive`: a negative tabindex keeps the
            input out of the tab order but not out of the accessibility tree, so
            the zone announced itself as a button containing a second control.
            The label needs no role, no tabIndex and no key handler — focus,
            Enter and Space come from the browser, and the label's text becomes
            the input's accessible name. */}
        <label
          htmlFor={fileId}
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
        </label>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-xl gap-y-md">
        <div className="min-w-0">
          <LanguageBar
            label="Von"
            quickLabel="Ausgangssprache"
            value={sourceLang}
            onChange={(code) => {
              setSourceLang(code);
              setRecentSource((r) => pushRecent(r, code));
            }}
            options={sources}
            recent={recentSource}
            withAuto
            autoDisabled={sourceRequired}
            describedBy={sourceRequired ? sourceHintId : undefined}
          />
          {sourceRequired ? (
            <p id={sourceHintId} className="m-0 mt-xs text-xs text-grey-500">
              Für diese Zielsprache gibt es ein Glossar — dafür braucht DeepL die Ausgangssprache.
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <LanguageBar
            label="Nach"
            quickLabel="Zielsprache"
            value={targetLang}
            onChange={(code) => {
              setTargetLang(code);
              setRecentTarget((r) => pushRecent(r, code, 3));
            }}
            options={targets}
            recent={recentTarget}
          >
            {target?.formality ? <FormalityMenu value={formality} onChange={setFormality} /> : null}
          </LanguageBar>
        </div>
      </div>

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
        <div
          className="flex flex-col gap-xs rounded-[14px] bg-primary-50 p-md dark:bg-primary-950"
          aria-live="polite"
        >
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
        <div className="flex items-center gap-xs">
          <TreeBudgetChip status={quota} hint="20.000 Zeichen = 1 Baum." />
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
