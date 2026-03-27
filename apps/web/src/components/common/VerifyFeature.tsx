import { Button } from '@gruenerator/ui';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '../../utils/cn';

import type { JSX, ReactNode, FormEvent } from 'react';

interface EyeIconProps {
  closed?: boolean;
}

interface VerifyFeatureProps {
  feature: string;
  children?: ReactNode;
  onVerified?: () => void;
  onCancel?: () => void;
}

// Stub functions for feature verification - implement backend support as needed
const verifyPassword = async (_password: string, _feature: string): Promise<boolean> => {
  // TODO: Implement actual password verification via backend
  console.warn('verifyPassword is not yet implemented');
  return false;
};

const isFeatureVerified = (_feature: string): boolean => {
  // TODO: Implement actual feature verification check
  return false;
};

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

export default function VerifyFeature({
  feature,
  children,
  onVerified,
  onCancel,
}: VerifyFeatureProps): JSX.Element | ReactNode {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const navigate = useNavigate();

  const MAX_ATTEMPTS = 3;
  const LOCKOUT_DURATION = 300; // 5 Minuten in Sekunden

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (lockoutTime > 0) {
      timer = setInterval(() => {
        setLockoutTime((prev) => {
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

  const handleSubmit = async (e: FormEvent) => {
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
          setError(
            `Zu viele fehlgeschlagene Versuche. Bitte warten Sie ${LOCKOUT_DURATION / 60} Minuten.`
          );
          console.log(
            `Fehlgeschlagene Anmeldeversuche für Feature ${feature} - Account gesperrt für ${LOCKOUT_DURATION / 60} Minuten`
          );
        } else {
          setError(`Falsches Passwort. Noch ${MAX_ATTEMPTS - newAttempts} Versuche übrig`);
          console.log(
            `Fehlgeschlagener Anmeldeversuch für Feature ${feature} - Versuch ${newAttempts} von ${MAX_ATTEMPTS}`
          );
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
      <div className="flex gap-2 justify-center my-2">
        {[...Array(MAX_ATTEMPTS)].map((_, index) => (
          <div
            key={index}
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              index < attempts
                ? 'bg-[#d32f2f] dark:bg-[#ff4444]'
                : 'bg-background-alt dark:bg-background'
            )}
          />
        ))}
      </div>
    );
  };

  if (isFeatureVerified(feature) && !onVerified) {
    return children;
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-black/50 fixed inset-0 z-[1000] backdrop-blur-[5px] transition-colors duration-300">
      <div className={cn('fixed inset-0 z-[1100] flex justify-center items-center')}>
        <div
          className={cn(
            'bg-background p-10 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] max-w-[400px] w-[90%] border border-background-alt transition-all duration-300',
            isLocked &&
              '[&_input]:border-[#d32f2f] [&_input]:bg-[rgba(211,47,47,0.05)] dark:[&_input]:bg-[rgba(211,47,47,0.1)]'
          )}
        >
          <h2 className="text-[var(--primary)] m-0 mb-4 text-2xl text-center">
            Zugriff verifizieren
          </h2>
          <p className="text-grey-500 mb-6 text-center text-[0.95rem]">
            Diese Funktion erfordert eine Verifizierung.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="Passwort eingeben"
                className={cn(
                  'w-full py-3 px-4 pr-12 border-2 border-grey-300 rounded-lg text-base transition-all duration-200',
                  'focus:border-[var(--primary)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.1)]',
                  isLocked && 'opacity-50 cursor-not-allowed'
                )}
                disabled={isLocked}
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-3 bg-none border-none p-2 cursor-pointer text-grey-500 transition-colors hover:text-[var(--primary)]"
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                disabled={isLocked}
              >
                <EyeIcon closed={!showPassword} />
              </button>
            </div>
            {renderAttemptDots()}
            {error && (
              <div className="text-[#d32f2f] text-[0.9rem] text-center bg-[rgba(211,47,47,0.1)] py-3 px-3 rounded-md">
                {error}
              </div>
            )}
            <div className="flex gap-4 mt-4">
              <Button variant="brand-outline" size="brand" type="button" onClick={handleBack}>
                {onCancel ? 'Abbrechen' : 'Zurück'}
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="submit"
                className={cn(isLocked && 'opacity-50 cursor-not-allowed')}
                disabled={isLocked}
              >
                Verifizieren
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
