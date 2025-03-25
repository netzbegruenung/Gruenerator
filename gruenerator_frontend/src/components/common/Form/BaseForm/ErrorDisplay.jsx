import React from 'react';
import PropTypes from 'prop-types';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * Komponente zur Anzeige von Fehlermeldungen
 * @param {Object} props - Komponenten-Props
 * @param {string} props.error - Fehlertext oder Code
 * @returns {JSX.Element|null} Fehlermeldung oder null
 */
const ErrorDisplay = ({ error }) => {
  if (!error) return null;

  const errorMessage = getErrorMessage(error);

  return (
    <p role="alert" aria-live="assertive" className="error-message">
      {errorMessage}
    </p>
  );
};

ErrorDisplay.propTypes = {
  error: PropTypes.string
};

export default ErrorDisplay; 