import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
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
    if (!loading && onClick) {
      console.log('Button wurde geklickt, führe onClick aus');
      onClick(event);
    } else {
      console.log('Button-Klick ignoriert. Loading:', loading);
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

  // Ultra-smooth gradient animation with 5 layers for perfect transitions
  const gradientAnimation = loading ? {
    '--layer1-opacity': [0.8, 0.9, 0.6, 0.3, 0.1, 0.2, 0.4, 0.7, 0.8],
    '--layer2-opacity': [0.2, 0.5, 0.8, 0.9, 0.7, 0.4, 0.1, 0.1, 0.2],
    '--layer3-opacity': [0.1, 0.1, 0.3, 0.6, 0.9, 0.8, 0.5, 0.2, 0.1],
    '--layer4-opacity': [0.3, 0.2, 0.1, 0.2, 0.5, 0.8, 0.9, 0.6, 0.3],
    '--layer5-opacity': [0.5, 0.3, 0.2, 0.1, 0.3, 0.6, 0.8, 0.9, 0.5]
  } : {};

  return (
    <motion.button
      ref={buttonRef}
      type={type}
      onClick={handleClick}
      className={`submit-button ${className} ${loading ? 'submit-button--loading' : ''} ${internalSuccess ? 'submit-button--success' : ''} ${showStatus ? 'submit-button--with-status' : ''}`}
      aria-busy={loading}
      aria-label={ariaLabel}
      disabled={loading}
      whileHover={{ scale: 1.01 }}
      animate={gradientAnimation}
      transition={{
        scale: { type: "spring", stiffness: 400, damping: 25 },
        default: loading ? { 
          duration: 5,
          ease: [0.25, 0.46, 0.45, 0.94],
          repeat: Infinity,
          times: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
        } : {
          duration: 0.25,
          ease: "easeOut"
        }
      }}
      style={{
        position: 'relative'
      }}
    >
      {/* Gradient Layer 1: Top-left focus */}
      <motion.div 
        className="submit-button__gradient-layer submit-button__gradient-layer--1"
        style={{ opacity: 'var(--layer1-opacity, 1)' }}
      />
      
      {/* Gradient Layer 2: Top-right focus */}
      <motion.div 
        className="submit-button__gradient-layer submit-button__gradient-layer--2"
        style={{ opacity: 'var(--layer2-opacity, 0)' }}
      />
      
      {/* Gradient Layer 3: Bottom-right focus */}
      <motion.div 
        className="submit-button__gradient-layer submit-button__gradient-layer--3"
        style={{ opacity: 'var(--layer3-opacity, 0)' }}
      />
      
      {/* Gradient Layer 4: Bottom-left focus */}
      <motion.div 
        className="submit-button__gradient-layer submit-button__gradient-layer--4"
        style={{ opacity: 'var(--layer4-opacity, 0)' }}
      />
      
      {/* Gradient Layer 5: Center focus */}
      <motion.div 
        className="submit-button__gradient-layer submit-button__gradient-layer--5"
        style={{ opacity: 'var(--layer5-opacity, 0)' }}
      />
      
      {/* Content layer */}
      <div className="submit-button__content-wrapper">
        {getButtonContent()}
      </div>
    </motion.button>
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