import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
} from '@gruenerator/ui';
import { useId, useState, type FormEvent } from 'react';
import { FaDownload } from 'react-icons/fa';

import {
  IMPRESSUM_LABELS,
  isFilled,
  isImpressumComplete,
  parseImpressumLine,
  type ImpressumLocale,
  type ImpressumParts,
} from '../../composer/printImpressum';
import { downloadErrorMessage } from '../../utils/downloadError';
import { DownloadNotice } from '../DownloadNotice';

export type CanvasDownloadChoice = 'png' | 'jpeg' | 'webp';

type DownloadChoice = CanvasDownloadChoice | 'pdf';

/** Print formats: PDF with bleed and crop marks is the default download. */
export interface PrintExportProps {
  onDownloadPdf: () => Promise<void>;
  /** Notices for photos too small to print well. */
  getWarnings: () => string[];
  /** Posters only: the PDF is blocked while this is missing or a placeholder. */
  impressum?: PrintImpressumGate | null;
}

export interface PrintImpressumGate {
  /** False until the page carrying the impressum has reported its state; export stays blocked. */
  ready: boolean;
  locale: ImpressumLocale;
  /** The impressum line on the canvas; null when the element is gone. */
  text: string | null;
  /** Writes the line to the canvas (updates the element, or re-adds it). */
  onSubmit: (parts: ImpressumParts) => void;
}

function ImpressumForm({ gate }: { gate: PrintImpressumGate }) {
  const fieldId = useId();
  const labels = IMPRESSUM_LABELS[gate.locale];
  const current = parseImpressumLine(gate.locale, gate.text ?? '');
  const initial = (value: string) => (isFilled(value) ? value : '');
  const [name, setName] = useState(initial(current.name));
  const [anschrift, setAnschrift] = useState(initial(current.anschrift));
  const [touched, setTouched] = useState(false);
  const valid = isImpressumComplete({ name, anschrift });
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

export interface DownloadSectionProps {
  onDownload: (
    format: CanvasDownloadChoice,
    pixelRatio: number,
    transparent: boolean
  ) => void | Promise<void>;
  onDownloadAllZip?: () => Promise<void>;
  pageCount: number;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
  exportError?: string | null;
  exportNotice?: string | null;
  printExport?: PrintExportProps | null;
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
}: DownloadSectionProps) {
  const [choice, setChoice] = useState<DownloadChoice>(printExport ? 'pdf' : 'png');
  const [printWarnings] = useState<string[]>(() => printExport?.getWarnings() ?? []);
  const [scale, setScale] = useState<number>(DEFAULT_RASTER_PIXEL_RATIO);
  const [transparent, setTransparent] = useState(false);
  const [pageSelection, setPageSelection] = useState<'current' | 'all'>('current');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fieldId = useId();

  const isPdf = choice === 'pdf' && printExport !== null;
  const impressumGate = isPdf ? (printExport?.impressum ?? null) : null;
  const impressumBlocked =
    impressumGate !== null &&
    (!impressumGate.ready ||
      !isImpressumComplete(parseImpressumLine(impressumGate.locale, impressumGate.text ?? '')));
  const isMultiPage = pageCount > 1 && onDownloadAllZip && !isPdf;
  // JPEG has no alpha channel — the transparency toggle is only meaningful for
  // PNG/WebP.
  const supportsTransparency = choice !== 'jpeg';

  const handleDownload = async () => {
    if (impressumBlocked) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      if (choice === 'pdf' && printExport) {
        await printExport.onDownloadPdf();
        return;
      }
      if (pageSelection === 'all' && onDownloadAllZip) {
        await onDownloadAllZip();
        return;
      }
      await onDownload(
        choice === 'pdf' ? 'png' : choice,
        scale,
        supportsTransparency && transparent
      );
    } catch (err) {
      console.error('[DownloadSection] Download failed:', err);
      setDownloadError(downloadErrorMessage(err));
    } finally {
      setIsDownloading(false);
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
            <SelectItem value="png">PNG</SelectItem>
            {!printExport && <SelectItem value="jpeg">JPG</SelectItem>}
            {!printExport && <SelectItem value="webp">WebP</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {/* Resolution + transparency only apply to single-page export; the
          multi-page ZIP path renders at fixed settings. */}
      {!isPdf && pageSelection === 'current' && (
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
        <div className="relative w-full h-5 bg-editor-tile rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary-600 rounded-full transition-[width] duration-300"
            style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
            {exportProgress.current}/{exportProgress.total}
          </span>
        </div>
      )}

      {impressumBlocked && impressumGate && !impressumGate.ready && (
        <DownloadNotice tone="info">Impressum wird geprüft …</DownloadNotice>
      )}
      {impressumBlocked && impressumGate?.ready && <ImpressumForm gate={impressumGate} />}

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
        disabled={isDownloading || isMultiExporting || impressumBlocked}
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
