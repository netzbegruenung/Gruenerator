import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import '../../assets/styles/components/actions/verify.css';
interface EyeIconProps {
  closed?: boolean;
}

const EyeIcon = ({ closed }: EyeIconProps): JSX.Element => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {closed ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

export default function VerifyFeature({ feature, children, onVerified, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const { verifyPassword, isFeatureVerified } = useAuth();
  const navigate = useNavigate();

  const MAX_ATTEMPTS = 3;
  const LOCKOUT_DURATION = 300; // 5 Minuten in Sekunden

  useEffect(() => {
    let timer;
    if (lockoutTime > 0) {
      timer = setInterval(() => {
        setLockoutTime(prev => {
          if (prev <= 1) {
            setIsLocked(false);
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutTime]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isLocked) {
      setError(`Bitte warten Sie noch ${Math.ceil(lockoutTime)} Sekunden`);
      return;
    }

    try {
      const success = await verifyPassword(password, feature);
      if (!success) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= MAX_ATTEMPTS) {
          setIsLocked(true);
          setLockoutTime(LOCKOUT_DURATION);
          setError(`Zu viele fehlgeschlagene Versuche. Bitte warten Sie ${LOCKOUT_DURATION / 60} Minuten.`);
          console.log(`Fehlgeschlagene Anmeldeversuche für Feature ${feature} - Account gesperrt für ${LOCKOUT_DURATION / 60} Minuten`);
        } else {
          setError(`Falsches Passwort. Noch ${MAX_ATTEMPTS - newAttempts} Versuche übrig`);
          console.log(`Fehlgeschlagener Anmeldeversuch für Feature ${feature} - Versuch ${newAttempts} von ${MAX_ATTEMPTS}`);
        }
      } else {
        setAttempts(0);
        if (onVerified) {
          onVerified();
        }
      }
    } catch (err) {
      setError('Ein Fehler ist aufgetreten');
    }
  };

  const handleBack = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/');
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const renderAttemptDots = () => {
    return (
      <div className="verify-attempts">
        {[...Array(MAX_ATTEMPTS)].map((_, index) => (
          <div
            key={index}
            className={`attempt-dot ${
              index < attempts ? 'failed' : 'active'
            }`}
          />
        ))}
      </div>
    );
  };

  if (isFeatureVerified(feature) && !onVerified) {
    return children;
  }

  return (
    <div className="verify-container">
      <div className={`verify-box ${isLocked ? 'locked' : ''}`}>
        <h2>Zugriff verifizieren</h2>
        <p>Diese Funktion erfordert eine Verifizierung.</p>

        <form onSubmit={handleSubmit} className="verify-form">
          <div className="verify-input-group">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort eingeben"
              className="verify-input"
              disabled={isLocked}
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="verify-password-toggle"
              aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
              disabled={isLocked}
            >
              <EyeIcon closed={!showPassword} />
            </button>
          </div>
          {renderAttemptDots()}
          {error && <div className="verify-error">{error}</div>}
          <div className="verify-buttons">
            <button type="button" onClick={handleBack} className="btn-secondary">
              {onCancel ? 'Abbrechen' : 'Zurück'}
            </button>
            <button type="submit" className="btn-primary" disabled={isLocked}>
              Verifizieren
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

