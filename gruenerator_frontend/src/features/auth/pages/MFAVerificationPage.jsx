import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Spinner from '../../../components/common/Spinner';

const MFAVerificationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRecoveryCodeInput, setShowRecoveryCodeInput] = useState(false);
  const [factorId, setFactorId] = useState(null);
  const [challengeId, setChallengeId] = useState(null);
  
  // Beim Laden der Komponente prüfen, ob die benötigten Daten im Location-State vorhanden sind
  useEffect(() => {
    const checkState = async () => {
      // Wenn wir keinen State oder keine MFA-Daten haben, zur Login-Seite zurückleiten
      if (!location.state || !location.state.mfaData) {
        navigate('/login');
        return;
      }
      
      const { factorId: fId, challengeId: cId } = location.state.mfaData;
      
      if (!fId || !cId) {
        navigate('/login');
        return;
      }
      
      setFactorId(fId);
      setChallengeId(cId);
    };
    
    checkState();
  }, [location, navigate]);
  
  // MFA-Verifizierung durchführen
  const verifyMFA = async (e) => {
    e.preventDefault();
    
    if (!factorId || !challengeId) {
      setError('Die MFA-Session ist abgelaufen. Bitte melde dich erneut an.');
      return;
    }
    
    if (!verificationCode) {
      setError('Bitte gib einen Verifizierungscode ein.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Dynamischer Import für den Supabase Client
      const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
      
      // Verwende den Templates-Client
      const { error: verifyError } = await templatesSupabase.auth.mfa.verifyChallenge({
        factorId,
        challengeId,
        code: verificationCode
      });
      
      if (verifyError) throw verifyError;
      
      // Bei erfolgreicher Verifizierung zur Originalseite oder zum Dashboard weiterleiten
      const redirectTo = location.state.redirectTo || '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error('MFA-Verifizierung fehlgeschlagen:', err);
      setError('Die Verifizierung ist fehlgeschlagen. Bitte überprüfe deinen Code und versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Zwei-Faktor-Authentifizierung</h1>
        <p>Gib den Code aus deiner Authenticator-App ein, um die Anmeldung abzuschließen.</p>
      </div>
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      <form className="auth-form" onSubmit={verifyMFA}>
        {!showRecoveryCodeInput ? (
          // Normales TOTP-Code-Eingabefeld
          <div className="form-field-wrapper">
            <label htmlFor="verification-code">
              {showRecoveryCodeInput ? 'Recovery-Code:' : 'Authenticator-Code:'}
            </label>
            <input
              type="text"
              id="verification-code"
              className="form-input"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.trim())}
              placeholder={showRecoveryCodeInput ? "Recovery-Code eingeben" : "6-stelliger Code"}
              maxLength={showRecoveryCodeInput ? 24 : 6}
              style={{
                fontSize: '1.5rem',
                textAlign: 'center',
                letterSpacing: showRecoveryCodeInput ? '0.2rem' : '0.5rem'
              }}
              required
              autoFocus
              autoComplete={showRecoveryCodeInput ? "off" : "one-time-code"}
              inputMode={showRecoveryCodeInput ? "text" : "numeric"}
              pattern={showRecoveryCodeInput ? ".*" : "[0-9]{6}"}
            />
            <p className="help-text">
              {showRecoveryCodeInput
                ? "Gib einen deiner Recovery-Codes ein, den du bei der MFA-Einrichtung erhalten hast."
                : "Der Code ändert sich alle 30 Sekunden in deiner App."}
            </p>
          </div>
        ) : (
          // Recovery-Code-Eingabefeld
          <div className="form-field-wrapper">
            <label htmlFor="recovery-code">Recovery-Code:</label>
            <input
              type="text"
              id="recovery-code"
              className="form-input"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.trim())}
              placeholder="Dein Recovery-Code"
              style={{
                fontSize: '1.2rem',
                textAlign: 'center'
              }}
              required
              autoFocus
              autoComplete="off"
            />
            <p className="help-text">
              Gib einen deiner Recovery-Codes ein, den du bei der MFA-Einrichtung erhalten hast.
            </p>
          </div>
        )}
        
        <button
          type="submit"
          className="auth-submit-button"
          disabled={loading || !verificationCode}
        >
          {loading ? <Spinner size="small" /> : 'Verifizieren'}
        </button>
        
        <div className="auth-links">
          <button 
            type="button"
            onClick={() => {
              setShowRecoveryCodeInput(!showRecoveryCodeInput);
              setVerificationCode('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--link-color)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'inherit',
              textDecoration: 'none'
            }}
          >
            {showRecoveryCodeInput 
              ? 'Zurück zur Code-Eingabe' 
              : 'Recovery-Code verwenden'}
          </button>
          
          <button 
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--link-color)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'inherit',
              textDecoration: 'none'
            }}
          >
            Abbrechen und zurück zum Login
          </button>
        </div>
      </form>
    </div>
  );
};

export default MFAVerificationPage; 