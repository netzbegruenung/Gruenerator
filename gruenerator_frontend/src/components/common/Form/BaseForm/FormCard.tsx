import React, { memo } from 'react';
import { HiX } from 'react-icons/hi';
import type { FormCardProps } from '@/types/baseform';

const FormCard: React.FC<FormCardProps> = ({
  className = '',
  variant = 'elevated',
  size = 'medium',
  hover = true,
  title,
  showHideButton = false,
  onHide,
  children,
  isStartMode = false,
  ...rest
}) => {
  const cardClasses = [
    'form-card',
    `form-card--${variant}`,
    `form-card--${size}`,
    hover ? 'form-card--hover' : '',
    isStartMode ? 'form-card--start-mode' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} {...rest}>
      {title && (
        <div className="form-card__header">
          <h2 className="form-card__title">{title}</h2>
          {showHideButton && onHide && (
            <button
              type="button"
              className="form-card__hide-button"
              onClick={onHide}
              aria-label="Formular verstecken"
              title="Formular verstecken"
            >
              <HiX />
            </button>
          )}
        </div>
      )}
      <div className="form-card__content">
        {children}
      </div>
    </div>
  );
};

FormCard.displayName = 'FormCard';

export default memo(FormCard);
