import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import { getInitials, getAvatarDisplayProps, useProfileData } from '../../utils/profileUtils';
import { useSupabaseAuth } from '../../../../context/SupabaseAuthContext';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import AvatarSelectionModal from './AvatarSelectionModal';
import { motion } from "motion/react";

const ProfileInfoTab = ({ user, templatesSupabase, onSuccessMessage, onErrorProfileMessage, updatePassword, isActive }) => {
  const queryClient = useQueryClient();
  const { setDeutschlandmodusInContext } = useSupabaseAuth();
  
  // Profildaten aus Query holen
  const { data: profile, isLoading: isLoadingProfile, isError: isErrorProfileQuery, error: errorProfileQuery } = useProfileData(user?.id, templatesSupabase);

  // Lokale States nur für Formulareingaben
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [errorProfile, setErrorProfile] = useState('');
  const [loadingPasswordChange, setLoadingPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // Initialisiere Formfelder, wenn Profildaten geladen werden
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setDisplayName(profile.display_name || (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}`.trim() : user?.email || ''));
      setEmail(user?.email || '');
    }
  }, [profile, user]);

  // Avatar immer aus Profildaten
  const avatarRobotId = profile?.avatar_robot_id ?? 1;

  const profileQueryKey = ['profileData', user?.id];

  const { mutate: updateProfileMutation, isLoading: isUpdatingProfile } = useMutation({
    mutationFn: async (profileUpdateData) => {
      if (!user?.id || !templatesSupabase) {
        throw new Error("Benutzer oder Supabase-Client nicht verfügbar.");
      }
      const { data, error } = await templatesSupabase
        .from('profiles')
        .update({ ...profileUpdateData, updated_at: new Date() })
        .eq('id', user.id)
        .select()
        .single();
      if (error) {
        throw new Error(error.message || 'Profil konnte nicht aktualisiert werden.');
      }
      return data;
    },
    onSuccess: (data) => {
      // Update Query-Cache direkt
      queryClient.setQueryData(profileQueryKey, data);
      onSuccessMessage('Profil erfolgreich aktualisiert!');
      onErrorProfileMessage('');
      setErrorProfile('');
      // Event für andere Komponenten
      if (data.avatar_robot_id !== undefined) {
        window.dispatchEvent(new CustomEvent('avatarUpdated', { 
          detail: { avatarRobotId: data.avatar_robot_id } 
        }));
      }
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
      avatar_robot_id: avatarRobotId
    });
  };

  const handleAvatarSelect = (robotId) => {
    updateProfileMutation({
      avatar_robot_id: robotId
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

  // Get avatar display properties based on current profile data
  const avatarProps = getAvatarDisplayProps({
    avatar_robot_id: avatarRobotId,
    first_name: firstName,
    last_name: lastName,
    email: email
  });

  // Korrekte Genitiv-Form mit Apostroph
  const getPossessiveForm = (name) => {
    if (!name) return "Dein";
    if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
      return `${name}'`;
    } else {
      return `${name}'s`;
    }
  };

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
            <div 
              className="profile-avatar" 
              onClick={() => setShowAvatarModal(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowAvatarModal(true);
                }
              }}
              aria-label="Avatar ändern"
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              {avatarProps.type === 'robot' ? (
                <img 
                  src={avatarProps.src} 
                  alt={avatarProps.alt}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
              <div className="profile-avatar-placeholder">
                  {avatarProps.initials}
                </div>
              )}
              <div className="profile-avatar-edit-overlay"></div>
            </div>
            <div className="profile-user-info">
              <div className="profile-user-name">
                {firstName ? getPossessiveForm(firstName) : "Dein"} Grünerator
              </div>
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

      <AvatarSelectionModal
        isOpen={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        currentAvatarId={avatarRobotId}
        onSelect={handleAvatarSelect}
      />
    </>
  );
};

export default ProfileInfoTab; 