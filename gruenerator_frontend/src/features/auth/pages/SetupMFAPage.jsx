import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';

const SetupMFAPage = () => {
  const { user, loading: authLoading } = useSupabaseAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [step, setStep] = useState(1); // 1: QR-Code anzeigen, 2: Bestätigen, 3: Recovery-Codes
  
  // MFA-Faktoren beim Laden abrufen und prüfen
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      // Wenn kein Benutzer eingeloggt ist, zur Login-Seite weiterleiten
      navigate('/login');
      return;
    }
    
    const fetchFactors = async () => {
      try {
        // Dynamischer Import für den Supabase Client
        const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
        // Verwende den Templates-Client
        const { data: factors, error: factorsError } = await templatesSupabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        // Assuming only one factor (TOTP) is possible for setup based on this page's focus
        
        // Wenn bereits TOTP eingerichtet ist, kann der Benutzer nur verwalten
        const hasTOTP = factors.totp.length > 0;
        
        if (hasTOTP) {
          // Wenn bereits MFA aktiviert ist, zeigen wir eine Meldung an
          setSuccessMessage('Du hast bereits die Zwei-Faktor-Authentifizierung aktiviert. Um dein Gerät zu wechseln, deaktiviere MFA zuerst und richte es dann neu ein.');
          setLoading(false);
          return;
        }
        
        // Neuen TOTP-Faktor erstellen
        const enrollNewFactor = async () => {
          try {
            // Dynamischer Import für den Supabase Client
            const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
            // Verwende den Templates-Client
            const { data: mfaData, error: mfaError } = await templatesSupabase.auth.mfa.enroll({
              factorType: 'totp',
            });
            
            if (mfaError) throw mfaError;
            
            // QR-Code-URL und Secret setzen
            setQrCode(mfaData.totp.qr_code);
            setSecret(mfaData.totp.secret);
            
            setStep(1);
          } catch (err) {
            console.error('Fehler beim Einrichten von MFA:', err.message);
            setError('Fehler beim Einrichten der Zwei-Faktor-Authentifizierung: ' + err.message);
          }
        };
        
        await enrollNewFactor();
      } catch (err) {
        console.error('Fehler beim Einrichten von MFA:', err.message);
        setError('Fehler beim Einrichten der Zwei-Faktor-Authentifizierung: ' + err.message);
      }
    };
    
    fetchFactors();
  }, [authLoading, user, navigate]);
  
  // MFA verifizieren
  const verifyMFA = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (!verificationCode || verificationCode.length !== 6 || !/^\d+$/.test(verificationCode)) {
        throw new Error('Bitte gib einen gültigen 6-stelligen Code ein.');
      }
      
      const verifyAndEnableFactor = async (verificationCode) => {
        if (!enrollmentData?.factor?.id) return;
        setLoading(true);
        setError(null);
        try {
          // Dynamischer Import für den Supabase Client
          const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
          
          // Verwende den Templates-Client
          const { data: verifyData, error: verifyError } = await templatesSupabase.auth.mfa.challengeAndVerify({
            factorId: enrollmentData.factor.id,
            code: verificationCode,
          });
          
          if (verifyError) throw verifyError;
          
          // Recovery-Codes abrufen
          const { data: recData, error: recError } = await templatesSupabase.auth.mfa.getAuthenticatorAssuranceLevel();
          
          if (recError) throw recError;
          
          if (recData && recData.recovery_codes) {
            setRecoveryCodes(recData.recovery_codes);
          }
          
          setSuccessMessage('Zwei-Faktor-Authentifizierung erfolgreich eingerichtet!');
          setStep(3); // Zur Recovery-Codes-Anzeige wechseln
        } catch (err) {
          setError('Fehler bei der Verifizierung: ' + err.message);
        } finally {
          setLoading(false);
        }
      };
      
      await verifyAndEnableFactor(verificationCode);
    } catch (err) {
      setError('Fehler bei der Verifizierung: ' + err.message);
    }
  };
  
  // Recovery-Codes in die Zwischenablage kopieren
  const copyRecoveryCodes = () => {
    if (recoveryCodes.length > 0) {
      const codesText = recoveryCodes.join('\n');
      navigator.clipboard.writeText(codesText)
        .then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 3000);
        })
        .catch(err => {
          console.error('Fehler beim Kopieren in die Zwischenablage:', err);
        });
    }
  };
  
  // Recovery-Codes herunterladen
  const downloadRecoveryCodes = () => {
    if (recoveryCodes.length > 0) {
      const codesText = 'RECOVERY CODES - GRÜNERATOR\n\n' + 
                         'Bewahre diese Codes sicher auf. Sie können jeweils nur einmal verwendet werden, um dich anzumelden, wenn du keinen Zugriff auf deine Authenticator-App hast.\n\n' +
                         recoveryCodes.join('\n');
      
      const blob = new Blob([codesText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      a.href = url;
      a.download = 'gruenerator-recovery-codes.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
  
  if (authLoading || loading) {
    return (
      <div className="auth-container">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Spinner size="large" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="auth-container" style={{ maxWidth: '550px' }}>
      <div className="auth-header">
        <h1>Zwei-Faktor-Authentifizierung einrichten</h1>
        <p>Erhöhe die Sicherheit deines Kontos mit einem zweiten Faktor</p>
      </div>
      
      {/* Erfolgsmeldung */}
      {successMessage && (
        <div className="auth-success-message">
          {successMessage}
        </div>
      )}
      
      {/* Fehlermeldung */}
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      {/* Schritt 1: QR-Code anzeigen */}
      {step === 1 && qrCode && (
        <div className="auth-form">
          <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-medium)' }}>
            <h3>Schritt 1: Authenticator-App einrichten</h3>
            <p>Scanne diesen QR-Code mit einer Authenticator-App (z.B. Google Authenticator, Authy oder Microsoft Authenticator).</p>
            
            <div style={{ 
              backgroundColor: 'white', 
              padding: 'var(--spacing-medium)', 
              borderRadius: '8px',
              maxWidth: '260px',
              margin: '0 auto',
              marginBottom: 'var(--spacing-medium)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <img 
                src={qrCode} 
                alt="QR-Code für MFA" 
                style={{ width: '100%', height: 'auto' }}
              />
            </div>
            
            <div style={{ marginTop: 'var(--spacing-small)' }}>
              <p style={{ fontSize: '0.9rem' }}>Manueller Code falls der QR-Code nicht funktioniert:</p>
              <code style={{ 
                display: 'block', 
                padding: 'var(--spacing-small)',
                background: 'var(--background-color-alt)',
                borderRadius: '4px',
                wordBreak: 'break-all',
                fontSize: '0.9rem',
                marginBottom: 'var(--spacing-medium)'
              }}>
                {secret}
              </code>
            </div>
          </div>
          
          <button
            type="button"
            className="auth-submit-button"
            onClick={() => setStep(2)}
          >
            Weiter zur Bestätigung
          </button>
          
          <div className="auth-links">
            <Link to="/profile">Abbrechen und zurück zum Profil</Link>
          </div>
        </div>
      )}
      
      {/* Schritt 2: Code zur Bestätigung eingeben */}
      {step === 2 && (
        <form className="auth-form" onSubmit={verifyMFA}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-medium)' }}>
            <h3>Schritt 2: Bestätige deine Einrichtung</h3>
            <p>Öffne deine Authenticator-App und gib den 6-stelligen Code ein, der angezeigt wird.</p>
          </div>
          
          <div className="form-field-wrapper">
            <label htmlFor="verification-code">Bestätigungscode:</label>
            <input
              type="text"
              id="verification-code"
              className="form-input"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.slice(0, 6))}
              placeholder="6-stelliger Code"
              maxLength={6}
              style={{ 
                fontSize: '1.5rem', 
                textAlign: 'center',
                letterSpacing: '0.5rem'
              }}
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
            />
            <p className="help-text">Der Code ändert sich alle 30 Sekunden in deiner App.</p>
          </div>
          
          <button
            type="submit"
            className="auth-submit-button"
            disabled={loading || verificationCode.length !== 6}
          >
            {loading ? <Spinner size="small" /> : 'Code bestätigen'}
          </button>
          
          <div className="auth-links">
            <button 
              type="button" 
              onClick={() => setStep(1)}
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
              Zurück zum QR-Code
            </button>
            <Link to="/profile">Abbrechen und zurück zum Profil</Link>
          </div>
        </form>
      )}
      
      {/* Schritt 3: Recovery-Codes anzeigen */}
      {step === 3 && recoveryCodes.length > 0 && (
        <div className="auth-form">
          <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-medium)' }}>
            <h3>Schritt 3: Recovery-Codes speichern</h3>
            <p className="auth-warning-message" style={{
              backgroundColor: 'rgba(255, 200, 0, 0.1)',
              borderLeft: '4px solid var(--sonne)',
              padding: 'var(--spacing-medium)',
              marginBottom: 'var(--spacing-medium)',
              borderRadius: '4px',
              textAlign: 'left'
            }}>
              <strong>Wichtig:</strong> Bewahre diese Codes sicher auf! Sie können verwendet werden, um dich anzumelden, wenn du keinen Zugriff auf deine Authenticator-App hast. Jeder Code kann nur einmal verwendet werden.
            </p>
          </div>
          
          <div className="recovery-codes" style={{
            background: 'var(--background-color-alt)',
            padding: 'var(--spacing-medium)',
            borderRadius: '8px',
            marginBottom: 'var(--spacing-medium)',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}>
            {recoveryCodes.map((code, index) => (
              <div key={index} style={{ 
                padding: 'var(--spacing-xsmall) var(--spacing-small)',
                borderBottom: index < recoveryCodes.length - 1 ? '1px solid var(--border-subtle)' : 'none'
              }}>
                {code}
              </div>
            ))}
          </div>
          
          <div style={{ 
            display: 'flex', 
            gap: 'var(--spacing-small)',
            marginBottom: 'var(--spacing-medium)'
          }}>
            <button
              type="button"
              onClick={copyRecoveryCodes}
              style={{
                flex: 1,
                padding: 'var(--spacing-small)',
                background: 'var(--background-color)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {copySuccess ? 'Kopiert! ✓' : 'In Zwischenablage kopieren'}
            </button>
            
            <button
              type="button"
              onClick={downloadRecoveryCodes}
              style={{
                flex: 1,
                padding: 'var(--spacing-small)',
                background: 'var(--background-color)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Als Datei herunterladen
            </button>
          </div>
          
          <div className="auth-success-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
            <p><strong>Die Zwei-Faktor-Authentifizierung wurde erfolgreich eingerichtet!</strong></p>
            <p>Bei deiner nächsten Anmeldung wirst du nach einem Code aus deiner Authenticator-App gefragt.</p>
          </div>
          
          <Link to="/profile" className="auth-submit-button" style={{ 
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none'
          }}>
            Zurück zum Profil
          </Link>
        </div>
      )}
    </div>
  );
};

export default SetupMFAPage; 