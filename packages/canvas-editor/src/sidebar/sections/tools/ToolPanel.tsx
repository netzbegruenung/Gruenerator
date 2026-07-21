import { useState } from 'react';
import { HiCheckCircle, HiXCircle } from 'react-icons/hi2';

import { Lightbox } from '../../../common/Lightbox';
import { cn } from '../../../utils/cn';
import { SIDEBAR_SECTION } from '../../sidebarStyles';

import type { ComponentType, ReactNode } from 'react';
import type { IconType } from 'react-icons';

export interface ToolPanelSuccess {
  thumbnailUrl: string;
  itemName: string;
  onJumpToUploads?: () => void;
  /** True when the result was placed straight onto the canvas (not just saved). */
  placedOnCanvas?: boolean;
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
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

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
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            className="block w-full p-0 bg-transparent border-none cursor-zoom-in rounded-lg overflow-hidden"
            aria-label="Bild in voller Größe ansehen"
          >
            <img
              src={success.thumbnailUrl}
              alt={success.itemName}
              className="block w-full h-auto rounded-lg"
            />
          </button>
          <div className="flex items-center gap-2 text-xs text-foreground-muted">
            <HiCheckCircle size={12} className="shrink-0 text-green-700 dark:text-green-400" />
            <span className="flex-1 truncate">
              {success.placedOnCanvas ? 'Auf Canvas platziert' : 'In Uploads gespeichert'} ·{' '}
              {success.itemName}
            </span>
            {success.onJumpToUploads ? (
              <button
                type="button"
                onClick={success.onJumpToUploads}
                className="text-primary-600 bg-transparent border-none cursor-pointer hover:underline shrink-0"
              >
                Zu Uploads
              </button>
            ) : null}
          </div>
          <Lightbox
            isOpen={isLightboxOpen}
            onClose={() => setIsLightboxOpen(false)}
            imageSrc={success.thumbnailUrl}
            altText={success.itemName}
          />
        </div>
      ) : null}

      {footer}
    </div>
  );
}
