import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { Button } from '@ggraphic/editor/ui/button';
import { Input } from '@ggraphic/editor/ui/input';
import { Label } from '@ggraphic/editor/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ggraphic/editor/ui/select';
import { Skeleton } from '@ggraphic/editor/ui/skeleton';
import { Switch } from '@ggraphic/editor/ui/switch';
import { downloadErrorMessage } from '@ggraphic/editor/utils/downloadError';
import { PRINT_UNGETESTET_HINWEIS } from '@gruenerator/contracts';
import { useId, useState, type FormEvent } from 'react';
import { FaDownload } from 'react-icons/fa';

import { MOBILE_INPUT_TEXT } from '../../sidebar/sidebarStyles';
import { DownloadNotice } from '../DownloadNotice';

import type {
  CanvasImpressumLocale,
  CanvasImpressumParts,
  CanvasImpressumService,
} from '@ggraphic/editor/hostServices';

export type CanvasDownloadChoice = 'png' | 'jpeg' | 'webp';

type DownloadChoice = CanvasDownloadChoice | 'pdf' | 'pptx';

/** Print formats: PDF with bleed and crop marks is the default download. */
export interface PrintExportProps {
  onDownloadPdf: () => Promise<void>;
  /** Notices for photos too small to print well. */
  getWarnings: () => string[];
  /** Posters only: warns (without blocking) while this is missing or a placeholder. */
  impressum?: PrintImpressumGate | null;
}

/**
 * Digitale Folien-Decks: „PowerPoint (.pptx)“ ist die Vorgabe, „PDF“ ein PDF
 * mit allen Seiten, ohne Druckmarken.
 */
export interface SlideDeckExportProps {
  onDownloadPdf: () => Promise<void>;
  /** Meldet nach jeder geschriebenen Folie den Fortschritt. */
  onDownloadPptx: (onProgress: (done: number, total: number) => void) => Promise<void>;
  /** Welche Hausschriften das Deck trägt: deutsche oder österreichische Marke. */
  locale: DeckLocale;
}

type DeckLocale = 'de-DE' | 'de-AT';

const PPTX_FONT_HINT: Record<DeckLocale, string> = {
  'de-DE':
    'Damit die Folien wie im Grünerator aussehen, installiere die Schriften GrueneType Neue und PT Sans – sonst ersetzt PowerPoint sie.',
  'de-AT':
    'Damit die Folien wie im Grünerator aussehen, installiere die Schriften Gotham Narrow Book, Bold und Ultra – sonst ersetzt PowerPoint sie.',
};

export interface PrintImpressumGate {
  /** False until every poster page has reported its state; no warning until then. */
  ready: boolean;
  locale: CanvasImpressumLocale;
  /** The impressum line on the canvas; null when the element is gone. */
  text: string | null;
  /** Writes the line to the canvas (updates the element, or re-adds it). */
  onSubmit: (parts: CanvasImpressumParts) => void;
}

function ImpressumForm({
  gate,
  impressum,
}: {
  gate: PrintImpressumGate;
  impressum: CanvasImpressumService;
}) {
  const { isFilled } = impressum;
  const fieldId = useId();
  const labels = impressum.labels[gate.locale];
  const current = impressum.parse(gate.locale, gate.text ?? '');
  const initial = (value: string) => (isFilled(value) ? value : '');
  const [name, setName] = useState(initial(current.name));
  const [anschrift, setAnschrift] = useState(initial(current.anschrift));
  const [touched, setTouched] = useState(false);
  const valid = impressum.isComplete({ name, anschrift });
  const nameError = touched && !isFilled(name) ? `Bitte ${labels.name} eintragen.` : null;
  const anschriftError = touched && !isFilled(anschrift) ? 'Bitte Anschrift eintragen.' : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (valid) gate.onSubmit({ name, anschrift });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <h4 className="m-0 text-sm font-semibold text-foreground">Impressum ergänzen</h4>
      <p className="m-0 text-xs text-foreground-muted">{labels.hint}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-name`} className="text-xs font-medium text-foreground-muted">
          {labels.name}
        </Label>
        <Input
          id={`${fieldId}-name`}
          className={MOBILE_INPUT_TEXT}
          value={name}
          placeholder={labels.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameError !== null}
          {...(nameError ? { 'aria-describedby': `${fieldId}-name-error` } : {})}
        />
        {nameError && (
          <p id={`${fieldId}-name-error`} role="alert" className="m-0 text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={`${fieldId}-anschrift`}
          className="text-xs font-medium text-foreground-muted"
        >
          Anschrift
        </Label>
        <Input
          id={`${fieldId}-anschrift`}
          className={MOBILE_INPUT_TEXT}
          value={anschrift}
          placeholder="Straße Nr., PLZ Ort"
          onChange={(e) => setAnschrift(e.target.value)}
          aria-invalid={anschriftError !== null}
          {...(anschriftError ? { 'aria-describedby': `${fieldId}-anschrift-error` } : {})}
        />
        {anschriftError && (
          <p
            id={`${fieldId}-anschrift-error`}
            role="alert"
            className="m-0 text-xs text-destructive"
          >
            {anschriftError}
          </p>
        )}
      </div>
      <Button type="submit" variant="brand" className="w-full rounded-lg">
        Übernehmen
      </Button>
    </form>
  );
}

function ProgressBar({ progress }: { progress: { current: number; total: number } }) {
  return (
    <div className="relative w-full h-5 bg-editor-tile rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-primary-600 rounded-full transition-[width] duration-300"
        style={{ width: `${(progress.current / progress.total) * 100}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
        {progress.current}/{progress.total}
      </span>
    </div>
  );
}

export interface DownloadSectionProps {
  onDownload: (
    format: CanvasDownloadChoice,
    pixelRatio: number,
    transparent: boolean
  ) => void | Promise<void>;
  onDownloadAllZip?: (format: CanvasDownloadChoice) => Promise<void>;
  pageCount: number;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
  exportError?: string | null;
  exportNotice?: string | null;
  printExport?: PrintExportProps | null;
  slideDeck?: SlideDeckExportProps | null;
}

const DEFAULT_RASTER_PIXEL_RATIO = 1;
const SCALE_OPTIONS = [1, 2] as const;

export function DownloadSection({
  onDownload,
  onDownloadAllZip,
  pageCount,
  isMultiExporting = false,
  exportProgress,
  exportError,
  exportNotice,
  printExport = null,
  slideDeck = null,
}: DownloadSectionProps) {
  const [choice, setChoice] = useState<DownloadChoice>(
    printExport ? 'pdf' : slideDeck ? 'pptx' : 'png'
  );
  const [pptxProgress, setPptxProgress] = useState<{ current: number; total: number } | null>(null);
  const [printWarnings] = useState<string[]>(() => printExport?.getWarnings() ?? []);
  const [scale, setScale] = useState<number>(DEFAULT_RASTER_PIXEL_RATIO);
  const [transparent, setTransparent] = useState(false);
  const [pageSelection, setPageSelection] = useState<'current' | 'all'>('current');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fieldId = useId();
  // Without the host's print service no format carries an impressum.
  const impressum = useCanvasEditorServices().print?.impressum ?? null;

  const isPdf = choice === 'pdf' && printExport !== null;
  const impressumGate = isPdf && impressum ? (printExport?.impressum ?? null) : null;
  const impressumMissing =
    impressum !== null &&
    impressumGate?.ready === true &&
    !impressum.isComplete(impressum.parse(impressumGate.locale, impressumGate.text ?? ''));
  const isSlidesPdf = choice === 'pdf' && slideDeck !== null;
  const isPptx = choice === 'pptx' && slideDeck !== null;
  const isMultiPage = pageCount > 1 && onDownloadAllZip && !isPdf && !isSlidesPdf && !isPptx;
  // JPEG has no alpha channel — the transparency toggle is only meaningful for
  // PNG/WebP.
  const supportsTransparency = choice !== 'jpeg';
  const rasterFormat: CanvasDownloadChoice = choice === 'pdf' || choice === 'pptx' ? 'png' : choice;

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      if (choice === 'pdf' && printExport) {
        await printExport.onDownloadPdf();
        return;
      }
      if (isSlidesPdf && slideDeck) {
        await slideDeck.onDownloadPdf();
        return;
      }
      if (isPptx && slideDeck) {
        setPptxProgress({ current: 0, total: pageCount });
        await slideDeck.onDownloadPptx((current, total) => setPptxProgress({ current, total }));
        return;
      }
      if (pageSelection === 'all' && onDownloadAllZip) {
        await onDownloadAllZip(rasterFormat);
        return;
      }
      await onDownload(rasterFormat, scale, supportsTransparency && transparent);
    } catch (err) {
      console.error('[DownloadSection] Download failed:', err);
      setDownloadError(downloadErrorMessage(err));
    } finally {
      setIsDownloading(false);
      setPptxProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-format`} className="text-xs font-medium text-foreground-muted">
          Format
        </Label>
        <Select value={choice} onValueChange={(v) => setChoice(v as DownloadChoice)}>
          <SelectTrigger id={`${fieldId}-format`} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[10001]">
            {printExport && <SelectItem value="pdf">PDF (Druck)</SelectItem>}
            {slideDeck && <SelectItem value="pptx">PowerPoint (.pptx)</SelectItem>}
            {slideDeck && <SelectItem value="pdf">PDF</SelectItem>}
            <SelectItem value="png">PNG</SelectItem>
            {!printExport && <SelectItem value="jpeg">JPG</SelectItem>}
            {!printExport && <SelectItem value="webp">WebP</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {/* Resolution + transparency only apply to single-page export; the
          multi-page ZIP path renders at fixed settings, in the chosen format. */}
      {!isPdf && !isSlidesPdf && !isPptx && pageSelection === 'current' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor={`${fieldId}-scale`}
              className="text-xs font-medium text-foreground-muted"
            >
              Auflösung
            </Label>
            <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
              <SelectTrigger id={`${fieldId}-scale`} size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[10001]">
                {SCALE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}× {s === DEFAULT_RASTER_PIXEL_RATIO ? '(Standard)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {supportsTransparency && (
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={`${fieldId}-transparent`}
                className="text-xs font-medium text-foreground-muted"
              >
                Transparenter Hintergrund
              </Label>
              <Switch
                id={`${fieldId}-transparent`}
                checked={transparent}
                onCheckedChange={setTransparent}
              />
            </div>
          )}
        </>
      )}

      {isMultiPage && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-pages`} className="text-xs font-medium text-foreground-muted">
            Seiten auswählen
          </Label>
          <Select
            value={pageSelection}
            onValueChange={(v) => setPageSelection(v as 'current' | 'all')}
          >
            <SelectTrigger id={`${fieldId}-pages`} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[10001]">
              <SelectItem value="current">Aktuelle Seite</SelectItem>
              <SelectItem value="all">Alle {pageCount} Seiten (ZIP)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isMultiExporting && exportProgress && exportProgress.total > 0 && (
        <ProgressBar progress={exportProgress} />
      )}
      {pptxProgress && pptxProgress.total > 0 && <ProgressBar progress={pptxProgress} />}

      {impressumMissing && impressumGate && impressum && (
        <>
          <DownloadNotice tone="info">
            Noch kein vollständiges Impressum – herunterladen kannst du trotzdem.
          </DownloadNotice>
          <ImpressumForm gate={impressumGate} impressum={impressum} />
        </>
      )}

      {isPdf && <DownloadNotice tone="info">{PRINT_UNGETESTET_HINWEIS}</DownloadNotice>}
      {isPptx && slideDeck && (
        <DownloadNotice tone="info">{PPTX_FONT_HINT[slideDeck.locale]}</DownloadNotice>
      )}
      {isPdf &&
        printWarnings.map((warning) => (
          <DownloadNotice key={warning} tone="info">
            {warning}
          </DownloadNotice>
        ))}
      {downloadError && <DownloadNotice>{downloadError}</DownloadNotice>}
      {exportError && !isMultiExporting && <DownloadNotice>{exportError}</DownloadNotice>}
      {exportNotice && <DownloadNotice tone="info">{exportNotice}</DownloadNotice>}

      <Button
        variant="brand"
        className="w-full rounded-lg"
        onClick={handleDownload}
        disabled={isDownloading || isMultiExporting}
      >
        {isDownloading || isMultiExporting ? (
          <Skeleton className="size-3.5 rounded-full" />
        ) : (
          <FaDownload className="size-3.5" />
        )}
        {isDownloading ? 'Wird heruntergeladen...' : 'Herunterladen'}
      </Button>
    </div>
  );
}
