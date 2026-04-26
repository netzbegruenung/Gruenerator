import { FeatureCard } from '@gruenerator/ui';
import React from 'react';

interface TypeCardProps {
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  previewImage?: string | null;
  previewImageFallback?: string;
  /** Solid background color when no preview image exists (e.g. format picker). */
  backgroundColor?: string;
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
  backgroundColor,
  label,
  description,
  isComingSoon = false,
  variant = 'default',
  badge,
  tabIndex = 0,
  className,
  children,
}) => {
  return (
    <FeatureCard
      onClick={onClick}
      onKeyDown={onKeyDown}
      label={label}
      description={description}
      image={previewImage ?? undefined}
      imageFallback={previewImageFallback}
      backgroundColor={backgroundColor}
      disabled={isComingSoon}
      variant={variant}
      badge={badge}
      tabIndex={tabIndex}
      className={className}
    >
      {children}
    </FeatureCard>
  );
};

export default TypeCard;
