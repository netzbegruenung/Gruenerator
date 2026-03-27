import { type ReactNode, useCallback } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

export type { Accept };

const uploadZoneVariants = cva(
  'group relative flex flex-col items-center justify-center cursor-pointer text-center transition-all duration-200 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
  {
    variants: {
      variant: {
        default: [
          'rounded-2xl border-2 border-dashed border-grey-300 bg-background px-12 py-16',
          'hover:border-primary-500 hover:bg-primary-600/5',
          'dark:border-grey-600 dark:hover:border-primary-400',
          'max-md:px-8 max-md:py-12',
        ],
        minimal: [
          'rounded-[20px] border-none bg-transparent px-12 py-16',
          'max-md:px-8 max-md:py-12',
        ],
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface UploadZoneProps extends VariantProps<typeof uploadZoneVariants> {
  onFileSelected?: (file: File) => void;
  onFilesSelected?: (files: File[]) => void;
  accept: Accept;
  maxSizeMB?: number;
  multiple?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  title?: string;
  dragActiveTitle?: string;
  subtitle?: string;
  className?: string;
  onHoverChange?: (hovering: boolean) => void;
}

export function UploadZone({
  onFileSelected,
  onFilesSelected,
  accept,
  maxSizeMB = 100,
  multiple = false,
  disabled = false,
  icon,
  title = 'Datei auswählen oder hierher ziehen',
  dragActiveTitle = 'Datei hier ablegen',
  subtitle,
  variant,
  className,
  onHoverChange,
}: UploadZoneProps) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleDrop = useCallback(
    (files: File[]) => {
      if (!files.length) return;

      const oversized = files.find((f) => f.size > maxSizeBytes);
      if (oversized) {
        alert(`Die Datei ist zu groß (max. ${maxSizeMB} MB).`);
        return;
      }

      if (onFilesSelected) {
        onFilesSelected(files);
      } else if (files[0] && onFileSelected) {
        onFileSelected(files[0]);
      }
    },
    [onFileSelected, onFilesSelected, maxSizeBytes, maxSizeMB]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept,
    multiple,
    disabled,
    noClick: false,
    noKeyboard: false,
  });

  const defaultSubtitle = subtitle ?? `Max. ${maxSizeMB} MB`;

  return (
    <div
      {...getRootProps()}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
      className={cn(
        uploadZoneVariants({ variant }),
        isDragActive && variant !== 'minimal' && 'scale-[1.01] border-primary-500 bg-primary-600/5',
        isDragActive && variant === 'minimal' && 'scale-[1.02]',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <input {...getInputProps()} />

      <div className="relative z-10 flex flex-col items-center gap-md">
        {icon && (
          <div
            className={cn(
              'flex size-16 items-center justify-center rounded-full transition-all duration-200',
              isDragActive
                ? 'bg-primary-600 text-white scale-110'
                : 'bg-grey-100 text-foreground dark:bg-grey-800'
            )}
          >
            {icon}
          </div>
        )}

        <div className="flex flex-col items-center gap-xs">
          <p className="m-0 text-base font-semibold text-foreground">
            {isDragActive ? dragActiveTitle : title}
          </p>
          {defaultSubtitle && <p className="m-0 text-sm text-grey-400">{defaultSubtitle}</p>}
        </div>
      </div>
    </div>
  );
}
