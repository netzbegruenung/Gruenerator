import { useCallback } from 'react';
import { PiUploadSimple } from 'react-icons/pi';

import useDragDropFiles from '../../../hooks/useDragDropFiles';

import type { Accept } from 'react-dropzone';

import { cn } from '@/utils/cn';

const TRANSFER_ACCEPT: Accept = {
  'application/pdf': ['.pdf'],
  'application/zip': ['.zip'],
  'application/x-rar-compressed': ['.rar'],
  'application/x-7z-compressed': ['.7z'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

const MAX_SIZE_MB = 100;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface TransferUploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function TransferUploadZone({ onFileSelected, disabled }: TransferUploadZoneProps) {
  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_SIZE_BYTES) {
        alert(`Die Datei ist zu groß (max. ${MAX_SIZE_MB} MB).`);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDragDropFiles({
    onFilesAccepted: handleFiles,
    accept: TRANSFER_ACCEPT,
    multiple: false,
    disabled,
    noClick: false,
    noKeyboard: false,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'group relative flex flex-col items-center justify-center cursor-pointer rounded-2xl border-2 border-dashed border-grey-300 bg-background px-12 py-16 text-center transition-all duration-200',
        'hover:border-primary-500 hover:bg-primary-600/5',
        'dark:border-grey-600 dark:hover:border-primary-400',
        'max-md:px-8 max-md:py-12',
        isDragActive && 'scale-[1.01] border-primary-500 bg-primary-600/5',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center gap-md">
        <div
          className={cn(
            'flex size-16 items-center justify-center rounded-full transition-all duration-200',
            isDragActive
              ? 'bg-primary-600 text-white scale-110'
              : 'bg-grey-100 text-foreground dark:bg-grey-800'
          )}
        >
          <PiUploadSimple className="size-8" />
        </div>

        <div className="flex flex-col items-center gap-xs">
          <p className="m-0 text-base font-semibold text-foreground">
            {isDragActive ? 'Datei hier ablegen' : 'Datei auswählen oder hierher ziehen'}
          </p>
          <p className="m-0 text-sm text-grey-400">
            PDF, Office, Bilder, Videos, Audio, ZIP — bis {MAX_SIZE_MB} MB
          </p>
        </div>
      </div>
    </div>
  );
}
