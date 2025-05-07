import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Spinner from './Spinner';

const SubmitButton = ({ 
  onClick, 
  loading, 
  success, 
  text, 
  icon, 
  className, 
  ariaLabel, 
  type = "submit",
  statusMessage,
  showStatus = false
}) => {
  const [internalSuccess, setInternalSuccess] = useState(false);
  const timerRef = useRef(null);
  const buttonRef = useRef(null);
  const [buttonSize, setButtonSize] = useState({ width: 'auto', height: 'auto' });

  useEffect(() => {
    if (buttonRef.current) {
      const { offsetWidth, offsetHeight } = buttonRef.current;
      setButtonSize({ width: `${offsetWidth}px`, height: `${offsetHeight}px` });
    }
  }, []);

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
    if (!loading && !internalSuccess && onClick) {
      console.log('Button wurde geklickt, führe onClick aus');
      onClick(event);
    } else {
      console.log('Button-Klick ignoriert. Loading:', loading, 'internalSuccess:', internalSuccess);
    }
  };

  const getButtonContent = () => {
    return (
      <div className="submit-button__content">
        {icon && !loading && <span className="submit-button__icon">{icon}</span>}
        {!loading && <span>{text}</span>}
        {loading && (
          <>
            <span className="submit-button__loading-spinner">
              <Spinner size="small" />
            </span>
            <span>{statusMessage && showStatus ? statusMessage : text}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <button
      ref={buttonRef}
      type={type}
      onClick={handleClick}
      className={`submit-button ${className} ${loading ? 'submit-button--loading' : ''} ${internalSuccess ? 'submit-button--success' : ''} ${showStatus ? 'submit-button--with-status' : ''}`}
      aria-busy={loading}
      aria-label={ariaLabel}
      disabled={loading || internalSuccess}
      style={{ width: '100%', height: buttonSize.height }}
    >
      {getButtonContent()}
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
  showStatus: PropTypes.bool
};

export default SubmitButton;