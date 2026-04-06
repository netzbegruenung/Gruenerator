import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Badge,
} from '@gruenerator/ui';
import { useState } from 'react';
import { FaDownload } from 'react-icons/fa';

import Spinner from '../../common/Spinner';

export interface DownloadSectionProps {
  onDownload: (format: 'png' | 'jpeg', pixelRatio: number) => void;
  onDownloadAllZip?: () => Promise<void>;
  canvasWidth: number;
  canvasHeight: number;
  pageCount: number;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
}

export function DownloadSection({
  onDownload,
  onDownloadAllZip,
  canvasWidth,
  canvasHeight,
  pageCount,
  isMultiExporting = false,
  exportProgress,
}: DownloadSectionProps) {
  const [fileFormat, setFileFormat] = useState<'png' | 'jpeg'>('png');
  const [pixelRatio, setPixelRatio] = useState(2);
  const [pageSelection, setPageSelection] = useState<'current' | 'all'>('current');
  const [isDownloading, setIsDownloading] = useState(false);

  const outputWidth = Math.round(canvasWidth * pixelRatio);
  const outputHeight = Math.round(canvasHeight * pixelRatio);
  const isMultiPage = pageCount > 1 && onDownloadAllZip;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (pageSelection === 'all' && onDownloadAllZip) {
        await onDownloadAllZip();
      } else {
        onDownload(fileFormat, pixelRatio);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* File type */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-foreground-muted">Dateityp</Label>
        <Select value={fileFormat} onValueChange={(v) => setFileFormat(v as 'png' | 'jpeg')}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[10001]">
            <SelectItem value="png">
              <span className="flex items-center gap-2">
                PNG
                <Badge className="text-[10px] px-1.5 py-0">Empfohlen</Badge>
              </span>
            </SelectItem>
            <SelectItem value="jpeg">JPG</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quality / scale */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-foreground-muted">Qualität</Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[pixelRatio]}
            onValueChange={(v) => setPixelRatio(v[0])}
            min={1}
            max={3}
            step={1}
            className="flex-1"
          />
          <span className="text-xs font-semibold text-foreground tabular-nums w-6 text-right">
            {pixelRatio}x
          </span>
        </div>
        <span className="text-[11px] text-foreground-muted tabular-nums">
          {outputWidth.toLocaleString('de-DE')} × {outputHeight.toLocaleString('de-DE')} px
        </span>
      </div>

      {/* Page selection (multi-page only) */}
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

      {/* Progress bar */}
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

      {/* Download button */}
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
