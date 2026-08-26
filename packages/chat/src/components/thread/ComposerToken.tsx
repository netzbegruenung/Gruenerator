'use client';

import { cn } from '@gruenerator/ui';
import { X } from 'lucide-react';

import { legibleBrandColor } from '../../lib/connectorBrand';

interface ComposerTokenProps {
  /** Vendor logo or feature glyph. Drawn with the brand colour. */
  icon?: React.ComponentType<{ className?: string }> | null;
  /** Emoji shown when there is no icon component. */
  glyph?: string | null;
  /** Brand colour, applied to the icon only — never to the label. */
  brandColor?: string;
  label: string;
  onRemove: () => void;
  removeLabel: string;
}

/**
 * One attachment chip in the composer — a pinned connector or an @-mention.
 *
 * The brand colour rides on the icon alone. It cannot carry the label: measured
 * against the chip ground, all 27 registry colours miss the 4.5:1 text floor in
 * dark mode (Sally's indigo lands at 1.78:1) and 16 of them miss it in light
 * mode too. The label therefore stays `text-foreground` — 11.2:1 dark, 15.9:1
 * light — which is also what ChatGPT's connector token does.
 *
 * Both chips were once separate copies of this markup and drifted apart; the
 * connector one lost the icon-only rule its twin documented. One component now.
 */
export function ComposerToken({
  icon: Icon,
  glyph,
  brandColor,
  label,
  onRemove,
  removeLabel,
}: ComposerTokenProps) {
  // Resolved for both themes and handed to CSS, so the chip needs no knowledge
  // of the active theme — `dark:` picks the variant the same way it picks the
  // ground these were measured against.
  const iconColor = brandColor
    ? {
        '--token-icon': legibleBrandColor(brandColor, 'light'),
        '--token-icon-dark': legibleBrandColor(brandColor, 'dark'),
      }
    : undefined;

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/[0.05] py-1 pl-2 pr-1 text-[13px] font-medium text-foreground dark:bg-white/10">
      {Icon ? (
        // The wrapper carries the colour: the shared icon type only accepts
        // className, and the marks draw with currentColor.
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0',
            iconColor && 'text-[var(--token-icon)] dark:text-[var(--token-icon-dark)]'
          )}
          style={iconColor as React.CSSProperties | undefined}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      ) : glyph ? (
        <span aria-hidden="true" className="text-xs leading-none">
          {glyph}
        </span>
      ) : null}
      <span className="max-w-40 truncate">{label}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        // 24 px hit area (WCAG 2.2 SC 2.5.8) around a 12 px glyph; the negative
        // margin keeps the chip as compact as it looks.
        className="-my-1 -mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-black/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/10"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
