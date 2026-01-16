import React, { memo } from 'react';
import { HiX } from 'react-icons/hi';
import type { FormCardProps, HelpContent } from '@/types/baseform';
import HelpIconPopover from '../../HelpIconPopover';

interface ExtendedFormCardProps extends FormCardProps {
  helpContent?: HelpContent | null;
}

const FormCard: React.FC<ExtendedFormCardProps> = ({
  className = '',
  variant = 'elevated',
  size = 'medium',
  hover = true,
  title,
  subtitle,
  showHideButton = false,
  onHide,
  children,
  isStartMode = false,
  helpContent = null,
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
          <div className="form-card__title-wrapper">
            <h2 className="form-card__title">{title}</h2>
            {subtitle && <p className="form-card__subtitle">{subtitle}</p>}
          </div>
          <div className="form-card__header-actions">
            <HelpIconPopover helpContent={helpContent} />
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
