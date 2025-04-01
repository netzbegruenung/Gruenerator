import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Lottie from 'react-lottie-player';
import Spinner from './Spinner';

let lottie_checkmark;
try {
  lottie_checkmark = require('../../assets/lotties/lottie_checkmark1.json');
} catch (error) {
  console.error('Failed to import Lottie animation:', error);
}

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
  const [showLottie, setShowLottie] = useState(false);
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
      setShowLottie(true);
    }

    if (internalSuccess) {
      timerRef.current = setTimeout(() => {
        setShowLottie(false);
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
    if (!loading && !showLottie && onClick) {
      console.log('Button wurde geklickt, führe onClick aus');
      onClick(event);
    } else {
      console.log('Button-Klick ignoriert. Loading:', loading, 'showLottie:', showLottie);
    }
  };

  const getButtonContent = () => {
    if (showLottie && lottie_checkmark) {
      return (
        <div className="submit-button__lottie-container">
          <Lottie
            animationData={lottie_checkmark}
            play
            loop={false}
            className="submit-button__lottie-animation"
          />
        </div>
      );
    }

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
      className={`submit-button ${className} ${loading ? 'submit-button--loading' : ''} ${showLottie ? 'submit-button--success' : ''} ${showStatus ? 'submit-button--with-status' : ''}`}
      aria-busy={loading}
      aria-label={ariaLabel}
      disabled={loading || showLottie}
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