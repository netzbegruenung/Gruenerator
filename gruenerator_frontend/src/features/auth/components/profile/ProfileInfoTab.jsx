import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import { getInitials } from '../../utils/profileUtils'; // Corrected path: one level up

const ProfileInfoTab = ({ user, templatesSupabase, onSuccessMessage, onErrorProfileMessage, updatePassword }) => {
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [errorProfile, setErrorProfile] = useState('');

  // States from PasswordChangeTab
  const [loadingPasswordChange, setLoadingPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(''); // For password change errors

  // State to toggle password change form visibility
  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);

  // Effect to set initial email and fetch profile base data
  useEffect(() => {
    let isMounted = true;
    if (user && templatesSupabase) {
      setEmail(user.email || '');
      const fetchProfileBaseData = async () => {
        setLoadingProfile(true); // Indicate loading starts
        try {
          const { data, error } = await templatesSupabase
            .from('profiles')
            .select('display_name, first_name, last_name')
            .eq('id', user.id)
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          if (isMounted && data) {
            setDisplayName(data.display_name || '');
            setFirstName(data.first_name || '');
            setLastName(data.last_name || '');
          }
        } catch (err) {
          if (isMounted) {
            console.error('Fehler beim Laden der Basis-Profildaten:', err.message);
            setErrorProfile('Profil konnte nicht geladen werden.');
            onErrorProfileMessage('Profil konnte nicht geladen werden.'); // Notify parent for profile specific load error
          }
        } finally {
            if (isMounted) setLoadingProfile(false); // Indicate loading ends
        }
      };
      fetchProfileBaseData();
    }
    return () => { isMounted = false; };
  }, [user, templatesSupabase, onErrorProfileMessage]); // Add onErrorProfileMessage dependency


  // Function to update profile
  const handleProfileUpdateSubmit = async (e) => {
    e.preventDefault();
    setErrorProfile(''); // Clear local profile error
    setPasswordError(''); // Clear local password error
    onSuccessMessage(''); // Clear parent messages
    onErrorProfileMessage(''); // Clear parent messages

    if (!user) {
      const msg = "Benutzer nicht gefunden. Bitte neu anmelden.";
      setErrorProfile(msg);
      onErrorProfileMessage(msg);
      return;
    }
    if (!templatesSupabase) {
        const msg = "Supabase Client nicht bereit.";
        setErrorProfile(msg);
        onErrorProfileMessage(msg);
        return;
    }
    setLoadingProfile(true);
    try {
      // Ensure displayName reflects first/last name if they exist
      const fullDisplayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : displayName || email; // Fallback to email if names and display_name are empty

      const { error: profileErrorUpdate } = await templatesSupabase
        .from('profiles')
        .update({
          display_name: fullDisplayName,
          first_name: firstName || null,
          last_name: lastName || null,
          updated_at: new Date()
        })
        .eq('id', user.id);

      if (profileErrorUpdate) throw profileErrorUpdate;

      setDisplayName(fullDisplayName); // Update local state immediately
      onSuccessMessage('Profil erfolgreich aktualisiert!');

    } catch (err) {
      const msg = 'Fehler beim Aktualisieren des Profils: ' + err.message;
      setErrorProfile(msg);
      onErrorProfileMessage(msg);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Function to change password (copied and adapted from PasswordChangeTab)
  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setPasswordError(''); // Clear local password error
    setErrorProfile(''); // Clear local profile error
    onSuccessMessage(''); // Clear parent messages
    onErrorProfileMessage(''); // Clear parent messages

    if (!user?.email) {
      const msg = "Benutzerinformationen nicht verfügbar. Bitte neu anmelden.";
      setPasswordError(msg);
      onErrorProfileMessage(msg);
      return;
    }
    if (!templatesSupabase) {
        const msg = "Supabase Client nicht bereit.";
        setPasswordError(msg);
        onErrorProfileMessage(msg);
        return;
    }
    if (!updatePassword) { // Check if updatePassword prop is provided
        const msg = "Passwortänderungsfunktion nicht verfügbar.";
        setPasswordError(msg);
        onErrorProfileMessage(msg);
        return;
    }
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
       let errorMsg = '';
       if (!currentPassword) errorMsg = 'Bitte gib dein aktuelles Passwort ein.';
       else if (newPassword.length < 8) errorMsg = 'Das neue Passwort muss mindestens 8 Zeichen lang sein.';
       else if (newPassword !== confirmPassword) errorMsg = 'Die neuen Passwörter stimmen nicht überein.';
       setPasswordError(errorMsg);
       onErrorProfileMessage(errorMsg); // Use the general error message prop for parent
       return;
    }

    setLoadingPasswordChange(true);
    try {
      // First verify the current password by trying to sign in
      const { error: signInError } = await templatesSupabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });

      if (signInError) {
        let specificErrorMsg = 'Fehler bei der Passwortüberprüfung.';
        if (signInError.message.includes('Invalid login credentials')) {
           specificErrorMsg = 'Das aktuelle Passwort ist nicht korrekt.';
        } else {
           specificErrorMsg = 'Fehler bei der Passwortüberprüfung: ' + signInError.message;
        }
        setPasswordError(specificErrorMsg);
        onErrorProfileMessage(specificErrorMsg);
        return; // Stop if verification fails
      }

      // If verification succeeds, update the password
      await updatePassword(newPassword); // Use the function from SupabaseAuth context (passed as prop)
      onSuccessMessage('Dein Passwort wurde erfolgreich geändert!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      // This catches errors from updatePassword
      const msg = 'Fehler beim Ändern des Passworts: ' + err.message;
      setPasswordError(msg);
      onErrorProfileMessage(msg);
    } finally {
      setLoadingPasswordChange(false);
    }
  };

  const handleTogglePasswordForm = () => {
    setShowPasswordChangeForm(!showPasswordChangeForm);
    // Clear password fields and errors when toggling
    if (showPasswordChangeForm) { // If it's being closed
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordError('');
        // Clear global messages related to password if any were set by this form
        // onErrorProfileMessage(''); // This might be too aggressive if a profile error unrelated to password was shown
    }
  };

  const userDisplayName = displayName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : email);

  return (
    <div className="profile-content">
      {/* Avatar Section - Reuse or pass user details */}
      <div className="profile-avatar-section">
        <div className="profile-avatar">
          <div className="profile-avatar-placeholder">
            {getInitials(firstName, lastName, email)}
          </div>
        </div>
        <div className="profile-user-info">
          <div className="profile-user-name">{userDisplayName}</div>
          <div className="profile-user-email">{email}</div>
          <div className="profile-user-id" style={{ fontSize: '0.8rem', color: 'var(--font-color-subtle)', marginTop: 'var(--spacing-xxsmall)' }}>ID: {user.id}</div>
        </div>
      </div>

      {/* Form Section */}
      <div className="profile-form-section">
        {/* Display local errors for profile update */}
        {errorProfile && (
          <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)'}}>{errorProfile}</div>
        )}
        {/* Profile Update Form */}
        <form className="auth-form" onSubmit={handleProfileUpdateSubmit}>
          <div className="form-group">
            <div className="form-group-title">Persönliche Daten</div>
            <div className="form-field-wrapper">
              <label htmlFor="email">E-Mail:</label>
              <input type="email" id="email" className="form-input" value={email} disabled={true} readOnly aria-describedby="email-help" />
              <p id="email-help" className="help-text">Deine E-Mail-Adresse kann nicht geändert werden.</p>
            </div>
            <div className="form-field-wrapper">
              <label htmlFor="firstName">Vorname:</label>
              <TextInput id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Dein Vorname" aria-label="Vorname" />
            </div>
            <div className="form-field-wrapper">
              <label htmlFor="lastName">Nachname:</label>
              <TextInput id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dein Nachname" aria-label="Nachname" />
            </div>
          </div>
          <div className="profile-actions">
            <button type="submit" className="profile-action-button profile-primary-button" disabled={loadingProfile || loadingPasswordChange} aria-live="polite">
              {loadingProfile ? <Spinner size="small" /> : 'Profil aktualisieren'}
            </button>
            {/* Link to account deletion could stay in the main page or be moved */}
            <Link to="/account-delete" className="profile-action-button profile-danger-button">
              Konto löschen
            </Link>
          </div>
        </form>

        <hr className="form-divider-large" />

        {/* Toggle Button for Password Change Form */}
        {!showPasswordChangeForm && (
            <div className="profile-actions" style={{ marginTop: 'var(--spacing-large)' }}>
                <button 
                    type="button" 
                    className="profile-action-button" 
                    onClick={handleTogglePasswordForm}
                    disabled={loadingProfile} // Disable if profile update is in progress
                >
                    Passwort ändern
                </button>
            </div>
        )}

        {/* Password Change Form - Conditional Rendering */}
        {showPasswordChangeForm && (
            <div style={{ marginTop: 'var(--spacing-large)' }}>
                {/* Display local errors for password change */}
                {passwordError && (
                <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)'}}>{passwordError}</div>
                )}
                <form className="auth-form" onSubmit={handlePasswordChangeSubmit}>
                <div className="form-group">
                    <div className="form-group-title">Passwort ändern</div>
                    <div className="form-field-wrapper">
                    <label htmlFor="current-password">Aktuelles Passwort:</label>
                    <input type="password" id="current-password" className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={loadingPasswordChange || loadingProfile} aria-required="true" />
                    </div>
                    <div className="form-field-wrapper">
                    <label htmlFor="new-password">Neues Passwort:</label>
                    <input type="password" id="new-password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength="8" disabled={loadingPasswordChange || loadingProfile} aria-required="true" aria-describedby="new-password-help" />
                    <p id="new-password-help" className="help-text">Mindestens 8 Zeichen</p>
                    </div>
                    <div className="form-field-wrapper">
                    <label htmlFor="confirm-password">Neues Passwort bestätigen:</label>
                    <input type="password" id="confirm-password" className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loadingPasswordChange || loadingProfile} aria-required="true" />
                    </div>
                </div>
                <div className="profile-actions">
                    <button type="submit" className="profile-action-button profile-primary-button" disabled={loadingPasswordChange || loadingProfile} aria-live="polite">
                    {loadingPasswordChange ? <Spinner size="small" /> : 'Neues Passwort speichern'}
                    </button>
                    <button type="button" className="profile-action-button" onClick={handleTogglePasswordForm} disabled={loadingPasswordChange || loadingProfile}>
                        Abbrechen
                    </button>
                </div>
                </form>
            </div>
        )}

      </div>
    </div>
  );
};

export default ProfileInfoTab; 