import React from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/welcome.css';

const WelcomePage = ({ title, description, steps, onStart, stepsTitle }) => {
  const handleStart = () => {
    const welcomeScreen = document.querySelector('.welcome-screen');
    welcomeScreen.classList.add('fade-out');
    setTimeout(() => {
      window.scrollTo(0, 0);
      onStart();
    }, 500);
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <h1>{title}</h1>
        <p className="welcome-intro">{description}</p>
        
        <div className="welcome-steps">
          <h2>{stepsTitle}</h2>
          <div className="steps-grid">
            {steps.map((step, index) => (
              <div key={index} className="step-card">
                <div className="step-number">{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        <button 
          className="start-button"
          onClick={handleStart}
        >
          Los geht&apos;s!
        </button>
      </div>
    </div>
  );
};

WelcomePage.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  stepsTitle: PropTypes.string.isRequired,
  steps: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired
    })
  ).isRequired,
  onStart: PropTypes.func.isRequired
};

export default WelcomePage; 