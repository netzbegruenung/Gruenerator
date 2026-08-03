'use client';

import { Globe } from 'lucide-react';
import { memo, type CSSProperties } from 'react';

import { domainHue, domainInitial } from '../../../lib/urlUtils';

/**
 * The small icon in front of a cited source.
 *
 * It replaces a favicon fetched from `google.com/s2/favicons`. That request went
 * out from the user's browser once per displayed source, carrying their IP and
 * the domain they were about to read to a third party — and the icon was the
 * only thing we got back for it. A monogram in the domain's own stable colour
 * does the same job (tell two sources apart at a glance) with nothing leaving
 * the page.
 *
 * Decorative by design: the domain name always sits right next to it, so the
 * glyph is `aria-hidden` and screen readers are not made to spell out a letter
 * they are about to hear as a word.
 */
export const SourceGlyph = memo(function SourceGlyph({
  domain,
  size = 14,
  className = '',
  rounded = 'rounded',
}: {
  domain?: string | undefined | null;
  /** Edge length in px. The letter scales with it. */
  size?: number;
  className?: string;
  /** `rounded-full` inside a circular chip, `rounded` inline. */
  rounded?: 'rounded' | 'rounded-full';
}) {
  const initial = domainInitial(domain);

  // No domain at all (private Wolke files, sources without a URL): a globe is
  // honest here, an invented letter would not be.
  if (!initial) {
    return (
      <Globe
        className={`shrink-0 opacity-60 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  // The hue travels as a CSS variable rather than as a finished colour, so the
  // LIGHTNESS can stay in Tailwind classes and flip with the theme. An inline
  // `color` could not: inline styles win over `dark:` utilities, and the glyph
  // would have been the one element in the chat that ignores dark mode.
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(7, Math.round(size * 0.62)),
    '--glyph-hue': domainHue(domain),
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={
        'inline-flex shrink-0 items-center justify-center font-semibold leading-none ' +
        'bg-[hsl(var(--glyph-hue)_65%_50%_/_0.18)] text-[hsl(var(--glyph-hue)_60%_38%)] ' +
        `dark:text-[hsl(var(--glyph-hue)_70%_72%)] ${rounded} ${className}`
      }
      style={style}
    >
      {initial}
    </span>
  );
});
