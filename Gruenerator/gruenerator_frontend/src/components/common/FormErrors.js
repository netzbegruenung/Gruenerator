import React from 'react';
import PropTypes from 'prop-types';

const FormErrors = ({ errors }) => {
  if (Object.keys(errors).length === 0) return null;

  return (
    <div className="form-errors" role="alert" aria-live="assertive">
      {Object.entries(errors).map(([field, message]) => (
        <p key={field} className="error-message">{message}</p>
      ))}
    </div>
  );
};

FormErrors.propTypes = {
  errors: PropTypes.object,
};

export default FormErrors;