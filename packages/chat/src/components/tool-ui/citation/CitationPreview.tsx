'use client';

import { cn } from './_adapter';

import type { ReactNode } from 'react';

export interface CitationPreviewChip {
  label: string;
  bg: string;
  color: string;
}

export interface CitationPreviewProps {
  /** Source glyph or type icon, sized by the caller. */
  icon?: ReactNode;
  domain?: string | undefined;
  title: string;
  /** With a URL the title becomes a link; the popover stays open around it. */
  url?: string | undefined;
  /** Snippet or cited text under the title. Clamped — see `bodyClassName`. */
  body?: string | undefined;
  /** Collection chip (notebook sources); web sources have none. */
  chip?: CitationPreviewChip | undefined;
  /** Extra action row, e.g. the "Im Dokument lesen" button. */
  action?: ReactNode;
  /** Overrides the default body clamp, e.g. a tighter `line-clamp-2`. */
  bodyClassName?: string;
}

/**
 * The one popover body every citation surface shares: the numbered badge in
 * the answer text, the inline chip in tool results, and whatever comes next.
 * Two popovers used to carry two hand-rolled layouts for the same job.
 */
export function CitationPreview({
  icon,
  domain,
  title,
  url,
  body,
  chip,
  action,
  bodyClassName,
}: CitationPreviewProps) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {(icon || domain || chip) && (
        <div className="flex items-center gap-1.5">
          {icon}
          {domain && <span className="text-muted-foreground text-xs">{domain}</span>}
          {chip && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: chip.bg, color: chip.color }}
            >
              {chip.label}
            </span>
          )}
        </div>
      )}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm leading-snug font-medium text-primary hover:underline"
        >
          {title}
        </a>
      ) : (
        <p className="text-sm leading-snug font-medium">{title}</p>
      )}
      {body && (
        // Clamped because `citedText` carries up to 1500 chars (projectCitation
        // in apps/api/.../citationUtils.ts): unclamped, the popover grows past
        // the viewport edge. The full text lives in the document panel.
        <p
          className={cn(
            'text-muted-foreground line-clamp-6 text-xs leading-relaxed',
            bodyClassName
          )}
        >
          {body}
        </p>
      )}
      {action}
    </div>
  );
}
