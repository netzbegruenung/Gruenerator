import '../../assets/styles/components/popups/welcome.css';
import type { JSX } from 'react';
interface WelcomePageProps {
  title: string;
  description: string;
  stepsTitle: string;
  steps: {
    title?: string;
    description?: string
  }[];
  onStart: () => void;
}

const WelcomePage = ({ title, description, steps, onStart, stepsTitle }: WelcomePageProps): JSX.Element => {
  const handleStart = () => {
    const welcomeScreen = document.querySelector('.welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.classList.add('fade-out');
    }
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

export default WelcomePage;
