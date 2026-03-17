import React from 'react';

import { cn } from '../../../utils/cn';

import PreviewImage from './PreviewImage';

import './TypeCard.css';

interface TypeCardProps {
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  previewImage?: string | null;
  previewImageFallback?: string;
  label: string;
  description?: string;
  isBeta?: boolean;
  isComingSoon?: boolean;
  variant?: 'default' | 'gradient-dark';
  badge?: React.ReactNode;
  tabIndex?: number;
  className?: string;
  children?: React.ReactNode;
}

const TypeCard: React.FC<TypeCardProps> = ({
  onClick,
  onKeyDown,
  previewImage,
  previewImageFallback,
  label,
  description,
  isComingSoon = false,
  variant = 'default',
  badge,
  tabIndex = 0,
  className,
  children,
}) => {
  const hasImage = !!previewImage;
  const isGradientDark = variant === 'gradient-dark';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyDown) {
      onKeyDown(e);
    } else if (e.key === 'Enter') {
      onClick();
    }
  };

  if (hasImage) {
    return (
      <div
        className={cn(
          'type-card-image group',
          isGradientDark && 'type-card-image--gradient-dark',
          isComingSoon && 'opacity-60 cursor-not-allowed',
          !isComingSoon && 'cursor-pointer',
          className
        )}
        onClick={isComingSoon ? undefined : onClick}
        role="button"
        tabIndex={isComingSoon ? -1 : tabIndex}
        onKeyDown={isComingSoon ? undefined : handleKeyDown}
      >
        {badge}
        <PreviewImage
          src={previewImage ?? ''}
          fallbackSrc={previewImageFallback}
          alt={label}
          className="w-full h-full object-cover transition-all duration-[400ms] ease-out group-hover:scale-[1.02] group-hover:opacity-95"
          width={600}
          height={800}
        />
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
        isComingSoon && 'opacity-60 cursor-not-allowed hover:translate-y-0',
        className
      )}
      onClick={isComingSoon ? undefined : onClick}
      role="button"
      tabIndex={isComingSoon ? -1 : tabIndex}
      onKeyDown={isComingSoon ? undefined : handleKeyDown}
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
};

export default TypeCard;
