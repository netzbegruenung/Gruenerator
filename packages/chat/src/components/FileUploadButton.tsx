'use client';

import { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { getAcceptedFileTypes } from '../lib/fileUtils';
import { cn } from '../lib/utils';

interface FileUploadButtonProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

export function FileUploadButton({
  onFilesSelected,
  disabled = false,
  className,
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files));
      e.target.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={getAcceptedFileTypes()}
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          'text-foreground-muted hover:bg-primary/10 hover:text-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        aria-label="Datei anhängen"
        title="Datei anhängen (Bilder, PDFs, Dokumente)"
      >
        <Paperclip className="h-4 w-4" />
      </button>
    </>
  );
}
