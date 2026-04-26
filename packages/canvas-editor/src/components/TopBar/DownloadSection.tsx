import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruenerator/ui';
import { useState } from 'react';
import { FaDownload } from 'react-icons/fa';

import Spinner from '../../common/Spinner';

export type CanvasDownloadChoice = 'png' | 'jpeg' | 'pdf' | 'pdf-print';

export interface DownloadSectionProps {
  onDownload: (format: 'png' | 'jpeg', pixelRatio: number) => void;
  onDownloadAllZip?: () => Promise<void>;
  /**
   * Server-side PDF wrap. The canvas-editor produces the high-DPI PNG; the
   * consumer uploads it. `withBleed` is meaningful only for print formats —
   * the UI only exposes it when `bleedSupported` is true (via the dedicated
   * "PDF Druck" option).
   */
  onDownloadPdf?: (withBleed: boolean) => Promise<void>;
  bleedSupported?: boolean;
  pageCount: number;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
}

const DEFAULT_RASTER_PIXEL_RATIO = 2;

export function DownloadSection({
  onDownload,
  onDownloadAllZip,
  onDownloadPdf,
  bleedSupported = false,
  pageCount,
  isMultiExporting = false,
  exportProgress,
}: DownloadSectionProps) {
  const [choice, setChoice] = useState<CanvasDownloadChoice>('png');
  const [pageSelection, setPageSelection] = useState<'current' | 'all'>('current');
  const [isDownloading, setIsDownloading] = useState(false);

  const isMultiPage = pageCount > 1 && onDownloadAllZip;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (pageSelection === 'all' && onDownloadAllZip) {
        await onDownloadAllZip();
        return;
      }
      switch (choice) {
        case 'png':
          onDownload('png', DEFAULT_RASTER_PIXEL_RATIO);
          break;
        case 'jpeg':
          onDownload('jpeg', DEFAULT_RASTER_PIXEL_RATIO);
          break;
        case 'pdf':
          if (onDownloadPdf) await onDownloadPdf(false);
          break;
        case 'pdf-print':
          if (onDownloadPdf) await onDownloadPdf(true);
          break;
      }
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
            {onDownloadPdf && <SelectItem value="pdf">PDF</SelectItem>}
            {onDownloadPdf && bleedSupported && (
              <SelectItem value="pdf-print">PDF Druck</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

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
          <Spinner size="small" />
        ) : (
          <FaDownload className="size-3.5" />
        )}
        {isDownloading ? 'Wird heruntergeladen...' : 'Herunterladen'}
      </Button>
    </div>
  );
}
