import { useCallback, useRef } from 'react';
import { HiMicrophone } from 'react-icons/hi';

import { cn } from '@/utils/cn';

import useDragDropFiles from '../../../hooks/useDragDropFiles';

import type { Accept } from 'react-dropzone';

const AUDIO_ACCEPT: Accept = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
  'audio/flac': ['.flac'],
};

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const FORMAT_BADGES = ['MP3', 'WAV', 'M4A', 'AAC', 'OGG', 'FLAC'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFileSelected, disabled }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    [onFileSelected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDragDropFiles({
    onFilesAccepted: handleFiles,
    accept: AUDIO_ACCEPT,
    multiple: false,
    disabled,
    noClick: false,
    noKeyboard: false,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'relative flex flex-col items-center justify-center gap-md p-xl rounded-lg border-2 border-dashed transition-colors cursor-pointer',
        isDragActive
          ? 'border-primary-500 bg-primary-500/5'
          : 'border-grey-300 dark:border-grey-600 hover:border-primary-400 hover:bg-grey-50 dark:hover:bg-grey-800/50',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <input {...getInputProps()} ref={fileInputRef} />

      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary-600/10 text-primary-600">
        <HiMicrophone size={28} />
      </div>

      <div className="text-center">
        <p className="text-base font-medium text-foreground-heading">
          {isDragActive ? 'Datei hier ablegen' : 'Audio-Datei hochladen'}
        </p>
        <p className="text-sm text-grey-500 dark:text-grey-400 mt-xs">
          Ziehe eine Datei hierher oder klicke zum Auswählen
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-xs mt-xs">
        {FORMAT_BADGES.map((fmt) => (
          <span
            key={fmt}
            className="px-sm py-0.5 text-xs rounded-full bg-grey-100 dark:bg-grey-800 text-grey-600 dark:text-grey-300"
          >
            {fmt}
          </span>
        ))}
        <span className="text-xs text-grey-400 dark:text-grey-500">max. {MAX_SIZE_MB} MB</span>
      </div>
    </div>
  );
}
