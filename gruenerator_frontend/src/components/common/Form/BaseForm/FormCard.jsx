import React from 'react';
import PropTypes from 'prop-types';
import { HiX } from 'react-icons/hi';

/**
 * Container-Komponente für Karten-Layout mit modernem Design
 * @param {Object} props - Komponenten-Props
 * @param {string} props.className - Zusätzliche CSS-Klassen
 * @param {string} props.variant - Karten-Variante (elevated, floating, subtle)
 * @param {string} props.size - Karten-Größe (small, medium, large)
 * @param {boolean} props.hover - Hover-Effekte aktivieren
 * @param {string} props.title - Titel für die Karte (wird oben angezeigt)
 * @param {boolean} props.showHideButton - Zeige Verstecken-Button
 * @param {Function} props.onHide - Callback für Verstecken-Button
 * @param {node} props.children - Kindelemente
 * @returns {JSX.Element} Form-Karte
 */
const FormCard = ({ 
  className = '', 
  variant = 'elevated', 
  size = 'medium', 
  hover = true,
  title,
  showHideButton = false,
  onHide,
  children,
  ...rest 
}) => {
  const cardClasses = [
    'form-card',
    `form-card--${variant}`,
    `form-card--${size}`,
    hover ? 'form-card--hover' : '',
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

FormCard.propTypes = {
  className: PropTypes.string,
  variant: PropTypes.oneOf(['elevated', 'floating', 'subtle']),
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  hover: PropTypes.bool,
  title: PropTypes.string,
  showHideButton: PropTypes.bool,
  onHide: PropTypes.func,
  children: PropTypes.node.isRequired
};

FormCard.displayName = 'FormCard';

export default FormCard; 