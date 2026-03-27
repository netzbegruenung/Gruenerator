import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface FeatureCardProps {
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  label: string;
  description?: string;
  image?: string;
  imageFallback?: string;
  disabled?: boolean;
  badge?: ReactNode;
  variant?: 'default' | 'gradient-dark';
  tabIndex?: number;
  className?: string;
  children?: ReactNode;
}

export function FeatureCard({
  onClick,
  onKeyDown,
  label,
  description,
  image,
  imageFallback,
  disabled = false,
  badge,
  variant = 'default',
  tabIndex = 0,
  className,
  children,
}: FeatureCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyDown) {
      onKeyDown(e);
    } else if (e.key === 'Enter') {
      onClick();
    }
  };

  const isGradientDark = variant === 'gradient-dark';

  if (image) {
    const isWebp = image.endsWith('.webp');

    return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl aspect-square p-0 border-none shadow-none',
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
        onClick={disabled ? undefined : onClick}
        role="button"
        tabIndex={disabled ? -1 : tabIndex}
        onKeyDown={disabled ? undefined : handleKeyDown}
      >
        {badge}
        {isWebp && imageFallback ? (
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
        )}
        <div
          className={cn(
            'absolute z-[1] flex flex-col',
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
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-background-alt rounded-xl p-8 text-center transition-all duration-300 cursor-pointer relative overflow-hidden',
        'border-2 border-transparent shadow-sm',
        'hover:-translate-y-1 hover:shadow-xl hover:border-primary-600',
        'active:-translate-y-0.5 active:shadow-lg',
        'max-[1024px]:p-6 max-[768px]:p-0',
        disabled && 'opacity-60 cursor-not-allowed hover:translate-y-0',
        className
      )}
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={disabled ? -1 : tabIndex}
      onKeyDown={disabled ? undefined : handleKeyDown}
    >
      {badge}
      {children || (
        <>
          <div className="text-5xl mb-4" />
          <h3 className="text-xl mb-4 text-[var(--font-color-h3)] text-center">{label}</h3>
          {description && (
            <p className="text-base leading-normal mb-6 text-foreground">{description}</p>
          )}
        </>
      )}
    </div>
  );
}
