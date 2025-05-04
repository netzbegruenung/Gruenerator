import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';

const EmailVerificationPage = () => {
  const { loading: authLoading } = useSupabaseAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  
  const handleResendVerificationEmail = async () => {
    if (!email) return;
    setSending(true);
    setError(null);
    try {
      // Dynamischer Import für den Supabase Client
      const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
      // Verwende den Templates-Client
      const { error } = await templatesSupabase.auth.resend({
        type: 'signup',
        email: email,
      });
      
      if (error) throw error;
      
      setSuccess(true);
      
      // Countdown für erneutes Senden starten (60 Sekunden)
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prevCount) => {
          if (prevCount <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prevCount - 1;
        });
      }, 1000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };
  
  if (authLoading) {
    return (
      <div className="auth-container">
        <div className="loading-container">
          <Spinner size="large" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>E-Mail bestätigen</h1>
        <p>Wir haben dir eine Bestätigungs-E-Mail gesendet. Bitte überprüfe deinen Posteingang und klicke auf den Bestätigungslink.</p>
      </div>
      
      {success && (
        <div className="auth-success-message">
          Eine neue Bestätigungs-E-Mail wurde an {email} gesendet. Bitte überprüfe deinen Posteingang.
        </div>
      )}
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      <div className="auth-form">
        <p>Keine E-Mail erhalten? Überprüfe bitte auch deinen Spam-Ordner.</p>
        
        <div className="form-field-wrapper">
          <label htmlFor="email">E-Mail:</label>
          <input
            type="email"
            id="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Deine E-Mail-Adresse"
            disabled={sending}
          />
        </div>
        
        <button
          type="button"
          className="auth-submit-button"
          onClick={handleResendVerificationEmail}
          disabled={sending || countdown > 0}
        >
          {sending ? <Spinner size="small" /> : 
            countdown > 0 ? `Erneut senden (${countdown}s)` : 'Bestätigungs-E-Mail erneut senden'}
        </button>
      </div>
      
      <div className="auth-links">
        <Link to="/login">Zurück zum Login</Link>
      </div>
    </div>
  );
};

export default EmailVerificationPage; 