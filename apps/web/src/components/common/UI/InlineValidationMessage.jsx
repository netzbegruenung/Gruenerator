import React from 'react';
import PropTypes from 'prop-types';
import { HiExclamationCircle, HiCheckCircle, HiInformationCircle } from 'react-icons/hi';

/**
 * InlineValidationMessage component to display validation messages.
 * It can show messages for error, success, or info states.
 */
const InlineValidationMessage = ({ message, type = 'error' }) => {
  if (!message) {
    return null;
  }

  let IconComponent;
  let textClass = '';

  switch (type) {
    case 'success':
      IconComponent = HiCheckCircle;
      textClass = 'text-success'; // Assuming a global .text-success class for green text
      break;
    case 'info':
      IconComponent = HiInformationCircle;
      textClass = 'text-info';    // Assuming a global .text-info class for blue text
      break;
    case 'error':
    default:
      IconComponent = HiExclamationCircle;
      textClass = 'text-danger';  // Assuming a global .text-danger class for red text
      break;
  }

  return (
    <small className={`inline-validation-message ${textClass}`}>
      {IconComponent && <IconComponent className="validation-icon" />}
      {message}
    </small>
  );
};

InlineValidationMessage.propTypes = {
  /** The message string to display */
  message: PropTypes.string,
  /** The type of message (error, success, info), determines icon and color */
  type: PropTypes.oneOf(['error', 'success', 'info']),
};

export default InlineValidationMessage; 