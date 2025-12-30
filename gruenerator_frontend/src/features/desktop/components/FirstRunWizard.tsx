import { useState, useCallback } from 'react';
import './FirstRunWizard.css';

interface FirstRunWizardProps {
  requireLogin: boolean;
  onComplete: () => void;
  onLogin?: () => void;
}

type ThemeOption = 'light' | 'dark' | 'auto';

const STEPS = ['welcome', 'features', 'theme', 'login', 'ready'] as const;

export function FirstRunWizard({ requireLogin, onComplete, onLogin }: FirstRunWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>('auto');
  const [isExiting, setIsExiting] = useState(false);

  const handleNext = useCallback(() => {
    if (currentStep === STEPS.length - 1) {
      onComplete();
      return;
    }

    setIsExiting(true);
    setTimeout(() => {
      setCurrentStep(prev => prev + 1);
      setIsExiting(false);
    }, 300);
  }, [currentStep, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep === 0) return;

    setIsExiting(true);
    setTimeout(() => {
      setCurrentStep(prev => prev - 1);
      setIsExiting(false);
    }, 300);
  }, [currentStep]);

  const handleThemeSelect = useCallback((theme: ThemeOption) => {
    setSelectedTheme(theme);

    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, []);

  const handleLogin = useCallback(() => {
    if (onLogin) {
      onLogin();
    }
  }, [onLogin]);

  const handleSkipLogin = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const renderStep = () => {
    const stepClass = `wizard-step ${isExiting ? 'exit' : ''}`;

    switch (STEPS[currentStep]) {
      case 'welcome':
        return (
          <div className={`welcome-step ${stepClass}`}>
            <img
              className="welcome-logo"
              src="/images/Logo_Grün.svg"
              alt="Grünerator"
            />
            <h1>Willkommen beim Grünerator</h1>
            <p>KI-gestützte Textgenerierung für Grüne. Erstelle professionelle Texte, Sharepics und mehr – schnell und einfach.</p>
          </div>
        );

      case 'features':
        return (
          <div className={`features-step ${stepClass}`}>
            <h2>Was du mit dem Grünerator machen kannst</h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">✍️</div>
                <h3>Textgenerierung</h3>
                <p>Erstelle Pressemitteilungen, Social Media Posts und mehr mit KI-Unterstützung.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🖼️</div>
                <h3>Sharepics</h3>
                <p>Generiere ansprechende Grafiken für Social Media mit deinen Texten.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">👥</div>
                <h3>Kollaboration</h3>
                <p>Arbeite gemeinsam mit anderen an Texten in Echtzeit.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">💾</div>
                <h3>Offline-Modus</h3>
                <p>Nutze die Desktop-App auch ohne Internetverbindung.</p>
              </div>
            </div>
          </div>
        );

      case 'theme':
        return (
          <div className={`theme-step ${stepClass}`}>
            <h2>Wähle dein Design</h2>
            <p>Du kannst dies später in den Einstellungen ändern.</p>
            <div className="theme-options">
              <button
                className={`theme-option ${selectedTheme === 'light' ? 'selected' : ''}`}
                onClick={() => handleThemeSelect('light')}
              >
                <div className="theme-preview light">☀️</div>
                <span>Hell</span>
              </button>
              <button
                className={`theme-option ${selectedTheme === 'dark' ? 'selected' : ''}`}
                onClick={() => handleThemeSelect('dark')}
              >
                <div className="theme-preview dark">🌙</div>
                <span>Dunkel</span>
              </button>
              <button
                className={`theme-option ${selectedTheme === 'auto' ? 'selected' : ''}`}
                onClick={() => handleThemeSelect('auto')}
              >
                <div className="theme-preview auto">🌓</div>
                <span>Automatisch</span>
              </button>
            </div>
          </div>
        );

      case 'login':
        return (
          <div className={`login-step ${stepClass}`}>
            <h2>Anmelden für mehr Funktionen</h2>
            <p>Melde dich an, um alle Vorteile zu nutzen.</p>
            <div className="login-benefits">
              <div className="login-benefit">
                <span className="login-benefit-icon">☁️</span>
                <span>Texte speichern und synchronisieren</span>
              </div>
              <div className="login-benefit">
                <span className="login-benefit-icon">📝</span>
                <span>Eigene Vorlagen erstellen</span>
              </div>
              <div className="login-benefit">
                <span className="login-benefit-icon">📱</span>
                <span>Auf allen Geräten verfügbar</span>
              </div>
            </div>
            <div className="login-actions">
              <button className="login-button" onClick={handleLogin}>
                Jetzt anmelden
              </button>
              <button
                className={`skip-login ${requireLogin ? 'hidden' : ''}`}
                onClick={handleSkipLogin}
              >
                Später anmelden
              </button>
            </div>
          </div>
        );

      case 'ready':
        return (
          <div className={`ready-step ${stepClass}`}>
            <div className="ready-checkmark">
              <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2>Grünerator ist bereit!</h2>
            <p>Du kannst jetzt loslegen und deine ersten Texte erstellen.</p>
            <button className="start-button" onClick={onComplete}>
              Starten
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="first-run-wizard">
      <div className="wizard-content">
        {renderStep()}
      </div>

      <div className="progress-indicator">
        {STEPS.map((_, index) => (
          <div
            key={index}
            className={`progress-dot ${
              index === currentStep ? 'active' : index < currentStep ? 'completed' : ''
            }`}
          />
        ))}
      </div>

      {currentStep < STEPS.length - 1 && STEPS[currentStep] !== 'login' && (
        <div className="navigation-buttons">
          <button
            className="nav-button back"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            Zurück
          </button>
          <button className="nav-button next" onClick={handleNext}>
            {currentStep === STEPS.length - 2 ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      )}
    </div>
  );
}

export default FirstRunWizard;
