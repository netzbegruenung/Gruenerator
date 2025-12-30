import React from 'react';
import { motion } from 'motion/react';
import PropTypes from 'prop-types';

const StepIndicator = ({ steps, currentStep, onStepClick, allowClickNavigation = false }) => {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <nav className="step-indicator" role="navigation" aria-label="Fortschrittsanzeige">
      {steps.map((step, index) => {
        const isActive = step === currentStep;
        const isCompleted = index < currentIndex;
        const isClickable = allowClickNavigation && isCompleted;

        return (
          <motion.button
            key={step}
            type="button"
            className={`step-indicator__dot ${isActive ? 'step-indicator__dot--active' : ''} ${isCompleted ? 'step-indicator__dot--completed' : ''}`}
            onClick={() => isClickable && onStepClick?.(step)}
            disabled={!isClickable}
            aria-label={`Schritt ${index + 1} von ${steps.length}`}
            aria-current={isActive ? 'step' : undefined}
            whileHover={isClickable ? { scale: 1.1 } : {}}
            whileTap={isClickable ? { scale: 0.95 } : {}}
          />
        );
      })}
    </nav>
  );
};

StepIndicator.propTypes = {
  steps: PropTypes.arrayOf(PropTypes.string).isRequired,
  currentStep: PropTypes.string.isRequired,
  onStepClick: PropTypes.func,
  allowClickNavigation: PropTypes.bool
};

export default StepIndicator;
