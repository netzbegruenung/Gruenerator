import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
} from '@gruenerator/ui';
import { useState } from 'react';
import { FaDownload } from 'react-icons/fa';

export type CanvasDownloadChoice = 'png' | 'jpeg' | 'webp';

export interface DownloadSectionProps {
  onDownload: (format: CanvasDownloadChoice, pixelRatio: number, transparent: boolean) => void;
  onDownloadAllZip?: () => Promise<void>;
  pageCount: number;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
}

const DEFAULT_RASTER_PIXEL_RATIO = 2;
const SCALE_OPTIONS = [1, 2, 3] as const;

export function DownloadSection({
  onDownload,
  onDownloadAllZip,
  pageCount,
  isMultiExporting = false,
  exportProgress,
}: DownloadSectionProps) {
  const [choice, setChoice] = useState<CanvasDownloadChoice>('png');
  const [scale, setScale] = useState<number>(DEFAULT_RASTER_PIXEL_RATIO);
  const [transparent, setTransparent] = useState(false);
  const [pageSelection, setPageSelection] = useState<'current' | 'all'>('current');
  const [isDownloading, setIsDownloading] = useState(false);

  const isMultiPage = pageCount > 1 && onDownloadAllZip;
  // JPEG has no alpha channel — the transparency toggle is only meaningful for
  // PNG/WebP.
  const supportsTransparency = choice !== 'jpeg';

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (pageSelection === 'all' && onDownloadAllZip) {
        await onDownloadAllZip();
        return;
      }
      onDownload(choice, scale, supportsTransparency && transparent);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-foreground-muted">Format</Label>
        <Select value={choice} onValueChange={(v) => setChoice(v as CanvasDownloadChoice)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[10001]">
            <SelectItem value="png">PNG</SelectItem>
            <SelectItem value="jpeg">JPG</SelectItem>
            <SelectItem value="webp">WebP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Resolution + transparency only apply to single-page export; the
          multi-page ZIP path renders at fixed settings. */}
      {pageSelection === 'current' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground-muted">Auflösung</Label>
            <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
              <SelectTrigger size="sm" className="w-full">
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
              <Label className="text-xs font-medium text-foreground-muted">
                Transparenter Hintergrund
              </Label>
              <Switch checked={transparent} onCheckedChange={setTransparent} />
            </div>
          )}
        </>
      )}

      {isMultiPage && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-foreground-muted">Seiten auswählen</Label>
          <Select
            value={pageSelection}
            onValueChange={(v) => setPageSelection(v as 'current' | 'all')}
          >
            <SelectTrigger size="sm" className="w-full">
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
        <div className="relative w-full h-5 bg-grey-100 dark:bg-grey-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary-600 rounded-full transition-[width] duration-300"
            style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
            {exportProgress.current}/{exportProgress.total}
          </span>
        </div>
      )}

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
