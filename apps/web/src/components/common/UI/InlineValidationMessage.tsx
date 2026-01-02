import { HiExclamationCircle, HiCheckCircle, HiInformationCircle } from 'react-icons/hi';

interface InlineValidationMessageProps {
  message?: string;
  type?: 'error' | 'success' | 'info';
}

const InlineValidationMessage = ({ message, type = 'error' }: InlineValidationMessageProps) => {
  if (!message) {
    return null;
  }

  let IconComponent;
  let textClass = '';

  switch (type) {
    case 'success':
      IconComponent = HiCheckCircle;
      textClass = 'text-success';
      break;
    case 'info':
      IconComponent = HiInformationCircle;
      textClass = 'text-info';
      break;
    case 'error':
    default:
      IconComponent = HiExclamationCircle;
      textClass = 'text-danger';
      break;
  }

  return (
    <small className={`inline-validation-message ${textClass}`}>
      {IconComponent && <IconComponent className="validation-icon" />}
      {message}
    </small>
  );
};

export default InlineValidationMessage;
