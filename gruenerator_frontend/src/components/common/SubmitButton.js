import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import Lottie from 'react-lottie-player';
import lottie_checkmark from '../../assets/lotties/lottie_checkmark.json';

const SubmitButton = ({ onClick, loading, success, text = 'Grünerieren' }) => {
  const lottieRef = useRef(null);

  useEffect(() => {
    if (success && lottieRef.current) {
      lottieRef.current.play();
    }
  }, [success]);

  return (
    <button 
      onClick={onClick} 
      className={`form-button ${loading ? 'loading' : ''}`} 
      aria-busy={loading}
    >
      <HiCog className={`icon ${loading ? 'loading-icon' : ''}`} />
      {loading ? '' : (
        success ? (
          <Lottie
            ref={lottieRef}
            animationData={lottie_checkmark}
            play={false}
            loop={false}
            style={{ width: 24, height: 24 }}
          />
        ) : text
      )}
    </button>
  );
};

SubmitButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  text: PropTypes.string
};

export default SubmitButton;