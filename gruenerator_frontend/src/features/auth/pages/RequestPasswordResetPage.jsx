import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import TextInput from '../../../components/common/Form/Input/TextInput';
import Spinner from '../../../components/common/Spinner';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

const RequestPasswordResetPage = () => {
  const { sendPasswordResetEmail } = useSupabaseAuth();
  
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await sendPasswordResetEmail(email);
      setSuccess(true);
    } catch (err) {
      let errorMessage = 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.';
      
      if (err.message.includes('no user found')) {
        // Aus Sicherheitsgründen trotzdem Erfolg melden, um keine Infos darüber
        // zu geben, ob die E-Mail existiert oder nicht
        setSuccess(true);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };
  
  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-header">
          <h1>Link versendet</h1>
        </div>
        <div className="auth-success-message">
          <p>Wenn ein Konto mit dieser E-Mail-Adresse existiert, haben wir einen Link zum Zurücksetzen des Passworts gesendet. Bitte überprüfe dein E-Mail-Postfach und folge den Anweisungen im E-Mail.</p>
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
        <h1>Passwort zurücksetzen</h1>
        <p>Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zurücksetzen deines Passworts</p>
      </div>
      
      {error && (
        <div className="auth-error-message">
          {error}
        </div>
      )}
      
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextInput
          id="email"
          label="E-Mail-Adresse"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="deine@email.de"
          autoComplete="email"
        />
        
        <button 
          type="submit" 
          className="auth-submit-button" 
          disabled={loading}
        >
          {loading ? <Spinner size="small" white /> : 'Link senden'}
        </button>
      </form>
      
      <div className="auth-links">
        <Link to="/login">Zurück zum Login</Link>
      </div>
    </div>
  );
};

export default RequestPasswordResetPage; 