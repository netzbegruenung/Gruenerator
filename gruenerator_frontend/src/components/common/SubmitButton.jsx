import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Spinner from './Spinner';

const SubmitButton = ({
  onClick,
  loading,
  success,
  text,
  icon,
  className = '',
  ariaLabel,
  type = "submit",
  statusMessage,
  showStatus = false,
  tabIndex,
  imageLimitInfo
}) => {
  const [internalSuccess, setInternalSuccess] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (success && !internalSuccess) {
      setInternalSuccess(true);
    }

    if (internalSuccess) {
      timerRef.current = setTimeout(() => {
        setInternalSuccess(false);
      }, 3000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [success, internalSuccess]);

  const handleClick = (event) => {
    if (!loading && onClick) {
      const activeElement = document.activeElement;

      if (activeElement && (
        activeElement.closest('.react-select') ||
        activeElement.closest('.react-select__input') ||
        activeElement.className?.includes('react-select')
      )) {
        return;
      }

      onClick(event);
    }
  };

  const getDisplayText = () => {
    if (loading && statusMessage && showStatus) {
      return statusMessage;
    }

    if (imageLimitInfo && typeof imageLimitInfo.count !== 'undefined' && typeof imageLimitInfo.limit !== 'undefined') {
      return `${text} (${imageLimitInfo.count}/${imageLimitInfo.limit})`;
    }

    return text;
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      className={`btn-primary ${className} ${loading ? 'btn-loading' : ''} ${internalSuccess ? 'btn-success' : ''}`}
      aria-busy={loading}
      aria-label={ariaLabel}
      disabled={loading}
      tabIndex={tabIndex}
    >
      {loading && <Spinner size="small" white />}
      {icon && !loading && <span className="btn-icon">{icon}</span>}
      <span>{getDisplayText()}</span>
    </button>
  );
};

SubmitButton.propTypes = {
  onClick: PropTypes.func,
  loading: PropTypes.bool,
  success: PropTypes.bool,
  text: PropTypes.string.isRequired,
  icon: PropTypes.node,
  className: PropTypes.string,
  ariaLabel: PropTypes.string,
  type: PropTypes.string,
  statusMessage: PropTypes.string,
  showStatus: PropTypes.bool,
  tabIndex: PropTypes.number,
  imageLimitInfo: PropTypes.shape({
    count: PropTypes.number,
    limit: PropTypes.number
  })
};

export default SubmitButton;
