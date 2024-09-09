import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Lottie from 'react-lottie-player';

let lottie_checkmark;
try {
  lottie_checkmark = require('../../assets/lotties/lottie_checkmark1.json');
} catch (error) {
  console.error('Failed to import Lottie animation:', error);
}

const SubmitButton = ({ onClick, loading, success, text, icon, className, ariaLabel, type = "submit" }) => {
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
    console.log('Effect triggered. Success:', success, 'InternalSuccess:', internalSuccess, 'ShowLottie:', showLottie);
    
    if (success && !internalSuccess) {
      console.log('Setting internal success state and showing Lottie');
      setInternalSuccess(true);
      setShowLottie(true);
    }

    if (internalSuccess) {
      timerRef.current = setTimeout(() => {
        console.log('Timer callback executed. Resetting states');
        setShowLottie(false);
        setInternalSuccess(false);
      }, 3000);
    }

    return () => {
      if (timerRef.current) {
        console.log('Clearing timeout');
        clearTimeout(timerRef.current);
      }
    };
  }, [success, internalSuccess]);

  const handleClick = (event) => {
    console.log('Button clicked. Loading:', loading, 'ShowLottie:', showLottie);
    if (!loading && !showLottie && onClick) {
      onClick(event);
    }
  };

  console.log('Rendering button. Loading:', loading, 'Success:', success, 'InternalSuccess:', internalSuccess, 'ShowLottie:', showLottie);

  return (
    <button
      ref={buttonRef}
      type={type}
      onClick={handleClick}
      className={`submit-button ${className} ${loading ? 'submit-button--loading' : ''} ${showLottie ? 'submit-button--success' : ''}`}
      aria-busy={loading}
      aria-label={ariaLabel}
      disabled={loading || showLottie}
      style={{ width: '100%', height: buttonSize.height }}
    >
      {showLottie && lottie_checkmark ? (
        <div className="submit-button__lottie-container">
          <Lottie
            animationData={lottie_checkmark}
            play
            loop={false}
            className="submit-button__lottie-animation"
          />
        </div>
      ) : (
        <div className="submit-button__content">
          {icon && <span className={`submit-button__icon ${loading ? 'submit-button__icon--loading' : ''}`}>{icon}</span>}
          {!loading && <span>{text}</span>}
        </div>
      )}
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
  type: PropTypes.string
};

export default SubmitButton;