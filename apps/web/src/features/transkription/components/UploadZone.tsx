import { useCallback } from 'react';
import { PiMicrophone } from 'react-icons/pi';

import useDragDropFiles from '../../../hooks/useDragDropFiles';

import type { Accept } from 'react-dropzone';

import { cn } from '@/utils/cn';

const MEDIA_ACCEPT: Accept = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
  'audio/flac': ['.flac'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
};

const MAX_SIZE_MB = 500;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  onHoverChange?: (hovering: boolean) => void;
}

export default function UploadZone({ onFileSelected, disabled, onHoverChange }: UploadZoneProps) {
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
    accept: MEDIA_ACCEPT,
    multiple: false,
    disabled,
    noClick: false,
    noKeyboard: false,
  });

  return (
    <div
      {...getRootProps()}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      className={cn(
        'group relative flex flex-col items-center justify-center cursor-pointer rounded-[20px] border-none bg-transparent px-12 py-16 text-center',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
        'max-md:px-8 max-md:py-12',
        isDragActive && 'scale-[1.02]',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <input {...getInputProps()} />

      <div className="relative z-10 flex flex-col items-center gap-sm">
        <div
          className={cn(
            'flex size-20 items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 ease-out group-hover:scale-110 max-md:size-16',
            isDragActive
              ? 'bg-secondary-600 text-white scale-115'
              : 'bg-grey-100 text-foreground dark:bg-[#2a2a2a]/80'
          )}
        >
          <PiMicrophone className="size-10 max-md:size-8" />
        </div>
      </div>
    </div>
  );
}
