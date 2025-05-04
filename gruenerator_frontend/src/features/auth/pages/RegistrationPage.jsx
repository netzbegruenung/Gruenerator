import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import TextInput from '../../../components/common/Form/Input/TextInput';
import CheckboxInput from '../../../components/common/Form/Input/CheckboxInput';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

const RegistrationPage = () => {
  const { signup } = useSupabaseAuth();
  
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const validatePassword = () => {
    if (password.length < 8) {
      return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
    }
    if (password !== confirmPassword) {
      return 'Die Passwörter stimmen nicht überein.';
    }
    return null;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const passwordError = validatePassword();
    if (passwordError) {
      setError(passwordError);
      setLoading(false);
      return;
    }
    
    if (!agreeTerms) {
      setError('Bitte stimme den Nutzungsbedingungen und der Datenschutzerklärung zu, um fortzufahren.');
      setLoading(false);
      return;
    }
    
    try {
      const { user } = await signup(email, password);
      
      // Vor- und Nachnamen in der profiles-Tabelle speichern
      if (user) {
        try {
          const { templatesSupabase } = await import('../../../components/utils/templatesSupabaseClient');
          await templatesSupabase.from('profiles').upsert({
            id: user.id,
            first_name: firstName,
            last_name: lastName,
            display_name: firstName ? `${firstName} ${lastName}`.trim() : '',
            updated_at: new Date().toISOString()
          });
        } catch (profileError) {
          console.error('Fehler beim Speichern des Profils:', profileError);
        }
      }
      
      setSuccess(true);
    } catch (err) {
      // Fehlermeldungen auf Deutsch anzeigen
      let errorMessage = 'Registrierung fehlgeschlagen. Bitte versuche es später erneut.';
      
      if (err.message.includes('already registered')) {
        errorMessage = 'Diese E-Mail-Adresse wird bereits verwendet.';
      } else if (err.message.includes('password')) {
        errorMessage = 'Das Passwort entspricht nicht den Anforderungen. Es sollte mindestens 8 Zeichen lang sein.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Registrierung erfolgreich</h1>
        </div>
        <div className="auth-success-message">
          <p>Wir haben dir eine E-Mail zur Bestätigung deiner Adresse geschickt. Bitte schaue in deinem Postfach nach und klicke auf den Bestätigungslink.</p>
        </div>
        <div className="auth-links">
          <Link to="/login">Zurück zum Login</Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Registrieren</h1>
        <p>Erstelle ein Konto, um alle Funktionen nutzen zu können</p>
      </div>
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextInput
          id="email"
          label="E-Mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="deine@email.de"
          autoComplete="email"
        />
        
        <TextInput
          id="firstName"
          label="Vorname"
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Dein Vorname"
          autoComplete="given-name"
        />
        
        <TextInput
          id="lastName"
          label="Nachname"
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Dein Nachname"
          autoComplete="family-name"
        />
        
        <TextInput
          id="password"
          label="Passwort"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Passwort (mind. 8 Zeichen)"
          helpText="Mindestens 8 Zeichen"
          autoComplete="new-password"
        />
        
        <TextInput
          id="confirm-password"
          label="Passwort bestätigen"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          placeholder="Passwort wiederholen"
          autoComplete="new-password"
        />
        
        <CheckboxInput
          id="agree-terms"
          label={
            <span>
              Ich stimme den <Link to="/terms" target="_blank">Nutzungsbedingungen</Link> und der <Link to="/privacy" target="_blank">Datenschutzerklärung</Link> zu
            </span>
          }
          checked={agreeTerms}
          onChange={(e) => setAgreeTerms(e.target.checked)}
        />
        
        <button 
          type="submit" 
          className="auth-submit-button" 
          disabled={loading}
        >
          {loading ? <Spinner size="small" white /> : 'Registrieren'}
        </button>
      </form>
      
      <div className="auth-links">
        <span>
          Bereits ein Konto? <Link to="/login">Anmelden</Link>
        </span>
      </div>
    </div>
  );
};

export default RegistrationPage; 