import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { InteractiveCard } from './interactive-card';

export interface FeatureCardProps {
  onClick: () => void;
  /**
   * @deprecated InteractiveCard owns activation via Enter/Space natively;
   * this is kept only so existing callers that still pass it type-check.
   */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  label: string;
  description?: string;
  image?: string;
  imageFallback?: string;
  /**
   * Optional solid background color for the image-style card variant when no
   * image asset is available (e.g. format pickers). Uses the same gradient
   * overlay + label/description stacking as the `image` path so cards look
   * visually consistent with image-backed siblings.
   */
  backgroundColor?: string;
  disabled?: boolean;
  badge?: ReactNode;
  variant?: 'default' | 'gradient-dark';
  /** @deprecated InteractiveCard manages its own single tab stop. */
  tabIndex?: number;
  className?: string;
  children?: ReactNode;
}

export function FeatureCard({
  onClick,
  label,
  description,
  image,
  imageFallback,
  backgroundColor,
  disabled = false,
  badge,
  variant = 'default',
  className,
  children,
}: FeatureCardProps) {
  const isGradientDark = variant === 'gradient-dark';

  if (image || backgroundColor) {
    const isWebp = image?.endsWith('.webp') ?? false;

    return (
      <InteractiveCard
        label={label}
        onActivate={onClick}
        disabled={disabled}
        className={cn(
          'group overflow-hidden rounded-2xl aspect-square p-0 border-none shadow-none',
          // ::after — primary gradient overlay
          'after:content-[""] after:absolute after:inset-0 after:rounded-2xl after:pointer-events-none after:transition-all after:duration-300',
          isGradientDark
            ? 'after:bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.35)_50%,rgba(0,0,0,0.25)_100%)]'
            : 'after:bg-[radial-gradient(ellipse_at_top_left,rgba(0,0,0,0.9)_0%,rgba(0,0,0,0.6)_20%,rgba(0,0,0,0.25)_45%,transparent_70%)]',
          // ::before — hover darken overlay
          'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none before:z-0 before:bg-black/35 before:opacity-0 before:transition-opacity before:duration-300',
          'hover:before:opacity-100',
          disabled && 'opacity-60 cursor-not-allowed',
          !disabled && 'cursor-pointer',
          className
        )}
        style={!image && backgroundColor ? { backgroundColor } : undefined}
      >
        {badge != null && <span className="pointer-events-none">{badge}</span>}
        {image ? (
          isWebp && imageFallback ? (
            <picture className="block w-full h-full">
              <source srcSet={image} type="image/webp" />
              <img
                src={imageFallback}
                alt={label}
                className="w-full h-full object-cover transition-all duration-[400ms] ease-out group-hover:scale-[1.02] group-hover:opacity-95"
                loading="lazy"
                width={600}
                height={800}
              />
            </picture>
          ) : (
            <img
              src={image}
              alt={label}
              className="w-full h-full object-cover transition-all duration-[400ms] ease-out group-hover:scale-[1.02] group-hover:opacity-95"
              loading="lazy"
              width={600}
              height={800}
            />
          )
        ) : null}
        <div
          className={cn(
            'pointer-events-none absolute z-[1] flex flex-col',
            isGradientDark
              ? 'top-1/2 left-0 right-0 -translate-y-1/2 items-center px-4'
              : 'top-0 left-0 right-0 p-6 gap-2 max-[768px]:p-4'
          )}
        >
          <h3
            className={cn(
              'm-0 text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.5)]',
              isGradientDark
                ? 'text-center font-bold text-2xl max-[768px]:text-xl'
                : 'text-left text-xl leading-snug max-[768px]:text-lg max-[768px]:leading-snug'
            )}
          >
            {label}
          </h3>
          {description && (
            <p
              className={cn(
                'm-0 text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.6)] leading-snug opacity-0 group-hover:opacity-100 transition-opacity duration-200',
                isGradientDark ? 'text-center text-lg' : 'text-left text-lg'
              )}
            >
              {description}
            </p>
          )}
        </div>
        {children}
      </InteractiveCard>
    );
  }

  return (
    <InteractiveCard
      label={label}
      onActivate={onClick}
      disabled={disabled}
      className={cn(
        'bg-background-alt rounded-xl p-8 text-center transition-all duration-300 cursor-pointer overflow-hidden',
        'border-2 border-transparent shadow-sm',
        'hover:-translate-y-1 hover:shadow-xl hover:border-primary-600',
        'active:-translate-y-0.5 active:shadow-lg',
        'max-[1024px]:p-6 max-[768px]:p-0',
        disabled && 'opacity-60 cursor-not-allowed hover:translate-y-0',
        className
      )}
    >
      {badge != null && <span className="pointer-events-none">{badge}</span>}
      {children || (
        <>
          <div className="text-5xl mb-4" />
          <h3 className="text-xl mb-4 text-[var(--font-color-h3)] text-center">{label}</h3>
          {description && (
            <p className="text-base leading-normal mb-6 text-foreground">{description}</p>
          )}
        </>
      )}
    </InteractiveCard>
  );
}
