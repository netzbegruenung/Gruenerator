import { useState, type CSSProperties, type JSX } from 'react';

import type { IconBaseProps, IconType } from 'react-icons';

import { cn } from '@/utils/cn';


/**
 * Official Canva brand mark.
 *
 * Per Canva's brand guidelines (https://www.canva.dev/docs/connect/guidelines/brand/)
 * the approved logo assets MUST be used unmodified — never recolored, stretched,
 * compressed, or distorted — with at least 8px of clear space. Use the square
 * icon mark below 50px and the script wordmark at/above 50px.
 *
 * The SVGs live in `apps/web/public/brand/canva/` and must be the official files
 * downloaded from the Canva Developer Portal brand kit (see the README there).
 * Until they are present the component renders a labelled fallback chip rather
 * than a broken image — it never substitutes an unapproved third-party logo.
 */

const ICON_SRC = '/brand/canva/canva-icon.svg';
const SCRIPT_SRC = '/brand/canva/canva-logo.svg';

/** Minimum clear space mandated by Canva's brand guidelines. */
export const CANVA_LOGO_CLEAR_SPACE_PX = 8;

export interface CanvaLogoProps {
  /** Rendered height in px. Below 50 → icon mark, at/above 50 → script wordmark. */
  size?: number;
  className?: string;
  /** Force a variant regardless of size. */
  variant?: 'icon' | 'script';
  /** Wrap with the mandated 8px clear space. */
  withClearSpace?: boolean;
}

export function CanvaLogo({
  size = 24,
  className,
  variant,
  withClearSpace = false,
}: CanvaLogoProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const useScript = variant ? variant === 'script' : size >= 50;
  const src = useScript ? SCRIPT_SRC : ICON_SRC;

  const wrapperStyle: CSSProperties | undefined = withClearSpace
    ? { padding: CANVA_LOGO_CLEAR_SPACE_PX }
    : undefined;

  if (failed) {
    // Asset not yet added — show a neutral placeholder, never an unapproved mark.
    return (
      <span
        role="img"
        aria-label="Canva"
        title="Canva-Logo fehlt – siehe public/brand/canva/README.md"
        style={{ height: size, ...wrapperStyle }}
        className={cn(
          'inline-flex items-center justify-center rounded border border-dashed border-grey-300 px-1 text-[10px] font-semibold uppercase tracking-wide text-grey-400',
          className
        )}
      >
        Canva
      </span>
    );
  }

  return (
    <span style={wrapperStyle} className="inline-flex">
      <img
        src={src}
        alt="Canva"
        height={size}
        onError={() => setFailed(true)}
        style={{ height: size, width: 'auto', display: 'inline-block' }}
        className={className}
      />
    </span>
  );
}

/**
 * `IconType`-compatible icon mark, for slots that expect a react-icons component
 * (e.g. generic link-icon grids, action buttons). Renders the official square
 * icon at the requested size; `color` is ignored on purpose (the mark must keep
 * its approved colors).
 */
export const CanvaLogoIcon: IconType = ({ className, size }: IconBaseProps) => {
  const numericSize = typeof size === 'number' ? size : undefined;
  return (
    <CanvaLogo
      variant="icon"
      {...(numericSize ? { size: numericSize } : {})}
      {...(className ? { className } : {})}
    />
  );
};

/**
 * "Powered by Canva" lockup — the brand-approved alternative to showing the logo
 * at an integration entry point.
 */
export function PoweredByCanva({ className }: { className?: string }): JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-grey-400', className)}>
      Powered by
      <CanvaLogo size={14} variant="script" />
    </span>
  );
}
