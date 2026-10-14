import { Alert, AlertDescription, UploadZone } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import { cn } from '@/utils/cn';

const IMAGE_ACCEPT = { 'image/jpeg': [], 'image/png': [], 'image/webp': [] };

export const TOOL_PILL =
  'inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-grey-200 px-md text-sm font-semibold text-foreground transition-colors max-md:h-11 dark:border-grey-700 ' +
  'hover:bg-grey-100 dark:hover:bg-grey-800 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 ' +
  'aria-pressed:border-transparent aria-pressed:bg-secondary-600 aria-pressed:text-white aria-checked:border-transparent aria-checked:bg-secondary-600 aria-checked:text-white';

export const TOOL_LABEL = 'm-0 text-sm font-semibold text-foreground-heading';

export const TOOL_HINT = 'm-0 text-sm text-grey-600 dark:text-grey-400';

export const TOOL_PANEL =
  'rounded-[14px] border border-grey-200 bg-background p-md dark:border-grey-700';

export const TOOL_ACTIONS =
  'flex flex-wrap items-center gap-sm border-t border-grey-200 pt-md dark:border-grey-700';

export function ToolUpload({
  icon,
  title,
  subtitle,
  error,
  onFile,
  onError,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  error: string | null;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      <UploadZone
        accept={IMAGE_ACCEPT}
        maxSizeMB={10}
        icon={icon}
        title={title}
        subtitle={subtitle}
        className="min-h-[320px] max-md:min-h-[240px]"
        onFileSelected={onFile}
        onError={onError}
      />
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

export function ToolSpinner({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center gap-sm', className)}>
      <span
        aria-hidden="true"
        className="size-5 shrink-0 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600 dark:border-grey-600 dark:border-t-primary-400"
      />
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}

export function ToolProcessing({ imageUrl, label }: { imageUrl: string | null; label: string }) {
  return (
    <div className={cn(TOOL_PANEL, 'flex flex-col items-center gap-md p-lg')}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="max-h-[280px] animate-pulse rounded-[10px] opacity-70"
        />
      ) : null}
      <ToolSpinner label={label} />
    </div>
  );
}
