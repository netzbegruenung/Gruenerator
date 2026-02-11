'use client';

import { X, FileText, Image as ImageIcon, File } from 'lucide-react';
import { formatFileSize, isImageMimeType, getFileTypeDisplayName } from '../lib/fileUtils';
import { cn } from '../lib/utils';

interface AttachedFilesListProps {
  files: File[];
  onRemove: (index: number) => void;
  className?: string;
}

function getFileIcon(mimeType: string) {
  if (isImageMimeType(mimeType)) {
    return ImageIcon;
  }
  if (mimeType === 'application/pdf' || mimeType === 'text/plain') {
    return FileText;
  }
  return File;
}

function getIconColor(mimeType: string): string {
  if (isImageMimeType(mimeType)) {
    return 'text-tool-purple';
  }
  if (mimeType === 'application/pdf') {
    return 'text-error';
  }
  if (mimeType === 'text/plain') {
    return 'text-badge-indigo';
  }
  return 'text-tool-emerald';
}

export function AttachedFilesList({ files, onRemove, className }: AttachedFilesListProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {files.map((file, index) => {
        const Icon = getFileIcon(file.type);
        const iconColor = getIconColor(file.type);

        return (
          <div
            key={`${file.name}-${index}`}
            className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
          >
            <Icon className={cn('h-4 w-4 flex-shrink-0', iconColor)} />
            <span className="max-w-[120px] truncate text-foreground" title={file.name}>
              {file.name}
            </span>
            <span className="text-xs text-foreground-muted">({formatFileSize(file.size)})</span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="ml-1 flex h-4 w-4 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-error-bg hover:text-error"
              aria-label={`${file.name} entfernen`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface AttachedFilesPreviewProps {
  files: File[];
  onRemove: (index: number) => void;
  className?: string;
}

export function AttachedFilesPreview({ files, onRemove, className }: AttachedFilesPreviewProps) {
  if (files.length === 0) {
    return null;
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const imageCount = files.filter((f) => isImageMimeType(f.type)).length;
  const docCount = files.length - imageCount;

  return (
    <div className={cn('rounded-lg border border-border bg-surface p-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <span className="font-medium text-foreground">
            {files.length} Datei{files.length !== 1 ? 'en' : ''}
          </span>
          <span>&middot;</span>
          <span>{formatFileSize(totalSize)}</span>
          {imageCount > 0 && docCount > 0 && (
            <>
              <span>&middot;</span>
              <span>
                {imageCount} Bild{imageCount !== 1 ? 'er' : ''}, {docCount} Dokument
                {docCount !== 1 ? 'e' : ''}
              </span>
            </>
          )}
        </div>
      </div>
      <AttachedFilesList files={files} onRemove={onRemove} />
    </div>
  );
}
