import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { Download, FileText, Film } from 'lucide-react';
import { useCallback } from 'react';

import { chunksToSRT, chunksToVTT } from '../utils/subtitleExport';

import type { SubtitleChunk } from '../types/subtitle';

import { downloadFile } from '@/utils/downloadFile';

interface ExportDropdownProps {
  chunks: SubtitleChunk[];
  projectTitle: string;
  onExportVideo?: () => void;
  isExportingVideo?: boolean;
}

export function ExportDropdown({
  chunks,
  projectTitle,
  onExportVideo,
  isExportingVideo,
}: ExportDropdownProps) {
  const safeName = projectTitle.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_').slice(0, 50) || 'untertitel';

  const handleDownloadSRT = useCallback(() => {
    downloadFile(chunksToSRT(chunks), `${safeName}.srt`, 'text/plain');
  }, [chunks, safeName]);

  const handleDownloadVTT = useCallback(() => {
    downloadFile(chunksToVTT(chunks), `${safeName}.vtt`, 'text/vtt');
  }, [chunks, safeName]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-xs">
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleDownloadSRT} className="gap-sm">
          <FileText className="h-4 w-4 text-grey-500" />
          SRT herunterladen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownloadVTT} className="gap-sm">
          <FileText className="h-4 w-4 text-grey-500" />
          VTT herunterladen
        </DropdownMenuItem>
        {onExportVideo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onExportVideo}
              disabled={isExportingVideo}
              className="gap-sm"
            >
              <Film className="h-4 w-4 text-grey-500" />
              {isExportingVideo ? 'Wird exportiert...' : 'Video exportieren'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
