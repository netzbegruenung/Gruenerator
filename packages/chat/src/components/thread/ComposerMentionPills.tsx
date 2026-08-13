'use client';

import { cn } from '@gruenerator/ui';
import { X } from 'lucide-react';

import { mentionableKey, type Mentionable } from '../../lib/mentionables';

interface ComposerMentionPillsProps {
  mentions: Mentionable[];
  onRemove: (mention: Mentionable) => void;
  className?: string;
}

/**
 * Selected @-mentions rendered as chips in the composer (ChatGPT-style)
 * instead of raw `@websuche` text. Visual twin of the pinned-connector chip in
 * GrueneratorComposer; the brand colour stays on the icon only — several
 * registry `backgroundColor`s are too light to carry label text on the
 * neutral chip ground (see docs/CLAUDE-a11y.md).
 */
export function ComposerMentionPills({ mentions, onRemove, className }: ComposerMentionPillsProps) {
  if (mentions.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {mentions.map((m) => {
        const Icon = m.icon;
        return (
          <span
            key={mentionableKey(m)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/[0.05] py-1 pl-2 pr-1.5 text-[13px] font-medium text-foreground dark:bg-white/10"
          >
            {Icon ? (
              // Wrapper carries the brand colour — the shared icon type only
              // accepts className, and the icons draw with currentColor.
              <span
                aria-hidden="true"
                className="flex shrink-0"
                style={{ color: m.backgroundColor }}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span aria-hidden="true" className="text-xs leading-none">
                {m.avatar}
              </span>
            )}
            <span className="max-w-40 truncate">{m.title}</span>
            <button
              type="button"
              aria-label={`${m.title} entfernen`}
              onClick={() => onRemove(m)}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
