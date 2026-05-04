import { HiCheckCircle, HiXCircle } from 'react-icons/hi2';

import { cn } from '../../../utils/cn';
import { SIDEBAR_SECTION } from '../../primitives';

import type { ComponentType, ReactNode } from 'react';
import type { IconType } from 'react-icons';

export interface ToolPanelSuccess {
  thumbnailUrl: string;
  itemName: string;
  onJumpToUploads?: () => void;
}

export interface ToolPanelProps {
  title?: string;
  body: ReactNode;
  actionLabel: string;
  actionIcon: IconType | ComponentType<{ size?: number; className?: string }>;
  canSubmit: boolean;
  isBusy: boolean;
  progressMessage?: string | null;
  error?: string | null;
  success?: ToolPanelSuccess | null;
  onAction: () => void;
  footer?: ReactNode;
}

export function ToolPanel({
  title,
  body,
  actionLabel,
  actionIcon: Icon,
  canSubmit,
  isBusy,
  progressMessage,
  error,
  success,
  onAction,
  footer,
}: ToolPanelProps) {
  return (
    <div
      className={cn(SIDEBAR_SECTION, 'gap-3 p-4 px-3 max-canvas-mobile:p-3 max-canvas-mobile:px-2')}
    >
      {title ? (
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {title}
        </span>
      ) : null}

      {body}

      <button
        type="button"
        onClick={onAction}
        disabled={!canSubmit || isBusy}
        className="w-full py-2.5 bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Icon size={16} />
        {isBusy ? progressMessage || 'Bitte warten…' : actionLabel}
      </button>

      {error ? (
        <div className="p-3 text-foreground-muted text-sm rounded-lg bg-[var(--background-alt)] flex items-start gap-2">
          <HiXCircle size={16} className="shrink-0 text-red-500 mt-0.5" />
          <p className="m-0 flex-1">{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="p-3 rounded-lg bg-[var(--background-alt)] flex items-center gap-3">
          <img
            src={success.thumbnailUrl}
            alt={success.itemName}
            className="size-12 rounded object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="m-0 text-xs flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
              <HiCheckCircle size={14} /> In Uploads gespeichert
            </p>
            <p className="m-0 text-xs text-foreground-muted truncate">{success.itemName}</p>
          </div>
          {success.onJumpToUploads ? (
            <button
              type="button"
              onClick={success.onJumpToUploads}
              className="text-xs text-primary-600 bg-transparent border-none cursor-pointer hover:underline"
            >
              Zu Uploads
            </button>
          ) : null}
        </div>
      ) : null}

      {footer}
    </div>
  );
}
