'use client';

import { X } from 'lucide-react';
import { useAttachmentNoticeStore } from '../../stores/attachmentNoticeStore';
import { GrueneratorHomeIconLoading } from '../icons';
import { useChatDensity } from './chatDensityContext';

export function InlineAttachmentNotice() {
  const notice = useAttachmentNoticeStore((s) => s.notice);
  const dismiss = useAttachmentNoticeStore((s) => s.dismiss);
  const isCompact = useChatDensity() === 'compact';

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isCompact
          ? 'group mx-auto flex w-full min-w-0 items-start gap-2'
          : 'group mx-auto flex w-full min-w-0 max-w-3xl items-start gap-4'
      }
    >
      <GrueneratorHomeIconLoading
        width={isCompact ? 24 : 32}
        height={isCompact ? 24 : 32}
        className="flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{notice.title}</p>
              <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
                {notice.description}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Hinweis schließen"
              className="-mr-1 -mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-amber-900/60 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-100/60 dark:hover:bg-amber-900/40 dark:hover:text-amber-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
