import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import { getInitials } from '../../utils/profileUtils';
import { useSupabaseAuth } from '../../../../context/SupabaseAuthContext';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { motion } from "motion/react";

const ProfileInfoTab = ({ user, templatesSupabase, onSuccessMessage, onErrorProfileMessage, updatePassword, isActive }) => {
  const queryClient = useQueryClient();
  const { setDeutschlandmodusInContext } = useSupabaseAuth();
  
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [errorProfile, setErrorProfile] = useState('');

  const [loadingPasswordChange, setLoadingPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);

  const profileQueryKey = ['profileData', user?.id];

  const { isLoading: isLoadingProfile, isError: isErrorProfileQuery, error: errorProfileQuery } = useQuery({
    queryKey: profileQueryKey,
    queryFn: async () => {
      if (!user?.id || !templatesSupabase) {
        throw new Error("Benutzer oder Supabase-Client nicht verfügbar.");
      }
      const { data, error } = await templatesSupabase
        .from('profiles')
        .select('display_name, first_name, last_name')
        .eq('id', user.id)
        .single();
      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message || 'Fehler beim Laden der Profildaten.');
      }
      return data || {};
    },
    enabled: !!user?.id && !!templatesSupabase && isActive,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    onSuccess: (data) => {
      setFirstName(data?.first_name || '');
      setLastName(data?.last_name || '');
      setDisplayName(data?.display_name || (data?.first_name && data?.last_name ? `${data.first_name} ${data.last_name}`.trim() : user?.email || ''));
      setEmail(user?.email || '');
      onErrorProfileMessage('');
      setErrorProfile('');
    },
    onError: (error) => {
      onErrorProfileMessage(error.message || 'Profildaten konnten nicht geladen werden.');
      setErrorProfile(error.message || 'Profildaten konnten nicht geladen werden.');
    }
  });

  const { mutate: updateProfileMutation, isLoading: isUpdatingProfile } = useMutation({
    mutationFn: async (profileUpdateData) => {
      if (!user?.id || !templatesSupabase) {
        throw new Error("Benutzer oder Supabase-Client nicht verfügbar.");
      }
      const { error } = await templatesSupabase
        .from('profiles')
        .update({ ...profileUpdateData, updated_at: new Date() })
        .eq('id', user.id);
      if (error) {
        throw new Error(error.message || 'Profil konnte nicht aktualisiert werden.');
      }
      return profileUpdateData;
    },
    onSuccess: (updatedData) => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
      onSuccessMessage('Profil erfolgreich aktualisiert!');
      onErrorProfileMessage('');
      setErrorProfile('');
      setFirstName(updatedData.first_name || '');
      setLastName(updatedData.last_name || '');
      setDisplayName(updatedData.display_name || (updatedData.first_name && updatedData.last_name ? `${updatedData.first_name} ${updatedData.last_name}`.trim() : user?.email || ''));
    },
    onError: (error) => {
      onSuccessMessage('');
      onErrorProfileMessage(error.message || 'Fehler beim Aktualisieren des Profils.');
      setErrorProfile(error.message || 'Fehler beim Aktualisieren des Profils.');
    }
  });

  const handleProfileUpdateSubmit = async (e) => {
    e.preventDefault();
    setErrorProfile(''); 
    setPasswordError(''); 
    onSuccessMessage(''); 
    onErrorProfileMessage('');
    const fullDisplayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : (displayName || user?.email || '');
    updateProfileMutation({
      display_name: fullDisplayName,
      first_name: firstName || null,
      last_name: lastName || null,
    });
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setErrorProfile('');
    onSuccessMessage('');
    onErrorProfileMessage('');

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
    if (!updatePassword) {
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
       onErrorProfileMessage(errorMsg);
       return;
    }

    setLoadingPasswordChange(true);
    try {
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
        setLoadingPasswordChange(false);
        return;
      }

      await updatePassword(newPassword);
      onSuccessMessage('Dein Passwort wurde erfolgreich geändert!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChangeForm(false);
    } catch (err) {
      const msg = 'Fehler beim Ändern des Passworts: ' + err.message;
      setPasswordError(msg);
      onErrorProfileMessage(msg);
    } finally {
      setLoadingPasswordChange(false);
    }
  };

  const handleTogglePasswordForm = () => {
    setShowPasswordChangeForm(!showPasswordChangeForm);
    if (!showPasswordChangeForm) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordError('');
    } else {
        setPasswordError('');
    }
  };

  const calculatedDisplayName = displayName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : email);

  return (
    <>
      {isLoadingProfile ? (
        <ProfileTabSkeleton type="form" itemCount={5} />
      ) : (
        <motion.div 
          className="profile-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="profile-avatar-section">
            <div className="profile-avatar">
              <div className="profile-avatar-placeholder">
                {getInitials(firstName, lastName, email)}
              </div>
            </div>
            <div className="profile-user-info">
              <div className="profile-user-name">{calculatedDisplayName}</div>
              <div className="profile-user-email">{email}</div>
              {user?.id && <div className="profile-user-id" style={{ fontSize: '0.8rem', color: 'var(--font-color-subtle)', marginTop: 'var(--spacing-xxsmall)' }}>ID: {user.id}</div>}
            </div>
          </div>

          <div className="profile-form-section">
            {(errorProfile || (isErrorProfileQuery && !isLoadingProfile)) && (
              <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)'}}>
                {errorProfile || errorProfileQuery?.message || 'Ein Fehler ist aufgetreten.'}
                {isErrorProfileQuery && 
                    <button type="button" onClick={() => queryClient.refetchQueries({ queryKey: profileQueryKey })} style={{marginLeft: '10px'}} className="profile-action-button profile-secondary-button">
                        Erneut versuchen
                    </button>
                }
              </div>
            )}

            {!isLoadingProfile && !isErrorProfileQuery && (
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
                    <TextInput id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Dein Vorname" aria-label="Vorname" disabled={isUpdatingProfile}/>
                  </div>
                  <div className="form-field-wrapper">
                    <label htmlFor="lastName">Nachname:</label>
                    <TextInput id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dein Nachname" aria-label="Nachname" disabled={isUpdatingProfile}/>
                  </div>
                </div>
                <div className="profile-actions">
                  <button type="submit" className="profile-action-button profile-primary-button" disabled={isUpdatingProfile || loadingPasswordChange || isLoadingProfile} aria-live="polite">
                    {isUpdatingProfile ? <Spinner size="small" /> : 'Profil aktualisieren'}
                  </button>
                  <Link to="/account-delete" className="profile-action-button profile-danger-button">
                    Konto löschen
                  </Link>
                </div>
              </form>
            )}

            <hr className="form-divider-large" />

            {!showPasswordChangeForm && (
                <div className="profile-actions" style={{ marginTop: 'var(--spacing-large)' }}>
                    <button 
                        type="button" 
                        className="profile-action-button" 
                        onClick={handleTogglePasswordForm}
                        disabled={isUpdatingProfile || isLoadingProfile} 
                    >
                        Passwort ändern
                    </button>
                </div>
            )}

            {showPasswordChangeForm && (
                <div style={{ marginTop: 'var(--spacing-large)' }}>
                    {passwordError && (
                    <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)'}}>{passwordError}</div>
                    )}
                    <form className="auth-form" onSubmit={handlePasswordChangeSubmit}>
                    <div className="form-group">
                        <div className="form-group-title">Passwort ändern</div>
                        <div className="form-field-wrapper">
                        <label htmlFor="current-password">Aktuelles Passwort:</label>
                        <input type="password" id="current-password" className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={loadingPasswordChange || isUpdatingProfile} aria-required="true" />
                        </div>
                        <div className="form-field-wrapper">
                        <label htmlFor="new-password">Neues Passwort:</label>
                        <input type="password" id="new-password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength="8" disabled={loadingPasswordChange || isUpdatingProfile} aria-required="true" aria-describedby="new-password-help" />
                        <p id="new-password-help" className="help-text">Mindestens 8 Zeichen</p>
                        </div>
                        <div className="form-field-wrapper">
                        <label htmlFor="confirm-password">Neues Passwort bestätigen:</label>
                        <input type="password" id="confirm-password" className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loadingPasswordChange || isUpdatingProfile} aria-required="true" />
                        </div>
                    </div>
                    <div className="profile-actions">
                        <button type="submit" className="profile-action-button profile-primary-button" disabled={loadingPasswordChange || isUpdatingProfile} aria-live="polite">
                        {loadingPasswordChange ? <Spinner size="small" /> : 'Neues Passwort speichern'}
                        </button>
                        <button type="button" className="profile-action-button" onClick={handleTogglePasswordForm} disabled={loadingPasswordChange || isUpdatingProfile}>
                            Abbrechen
                        </button>
                    </div>
                    </form>
                </div>
            )}
          </div>
        </motion.div>
      )}
    </>
  );
};

export default ProfileInfoTab; 