import React from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/ui/spinner.css';

/**
 * Gemeinsame Spinner-Komponente für Ladeanzeigen
 * 
 * @param {Object} props - Komponenten-Props
 * @param {string} [props.size='medium'] - Größe des Spinners ('small', 'medium', 'large')
 * @param {boolean} [props.white=false] - Ob der Spinner weiß sein soll (für dunkle Hintergründe)
 * @param {boolean} [props.withBackground=false] - Ob der Spinner einen grünen Hintergrund haben soll
 * @param {string} [props.className=''] - Zusätzliche CSS-Klassen
 * @returns {JSX.Element} Spinner-Komponente
 */
const Spinner = ({ size = 'medium', white = false, withBackground = false, className = '' }) => {
  const sizeClass = `spinner-${size}`;
  const colorClass = white ? 'spinner-white' : '';
  const classes = ['spinner', sizeClass, colorClass, className].filter(Boolean).join(' ');

  if (withBackground) {
    return (
      <div className="spinner-with-background">
        <div className={classes} aria-label="Wird geladen..." role="status" />
      </div>
    );
  }

  return <div className={classes} aria-label="Wird geladen..." role="status" />;
};

Spinner.propTypes = {
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  white: PropTypes.bool,
  withBackground: PropTypes.bool,
  className: PropTypes.string
};

export default Spinner; 