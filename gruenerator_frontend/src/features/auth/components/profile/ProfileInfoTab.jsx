import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import { 
  getAvatarDisplayProps, 
  useProfileData, 
  useProfileManager 
} from '../../utils/profileUtils';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import AvatarSelectionModal from './AvatarSelectionModal';
import { motion } from "motion/react";

const ProfileInfoTab = ({ 
  user, 
  onSuccessMessage, 
  onErrorProfileMessage, 
  updatePassword, 
  deleteAccount, 
  canManageAccount, 
  isActive 
}) => {
  const queryClient = useQueryClient();
  
  // Business logic hooks from profileUtils
  const { data: profile, isLoading: isLoadingProfile, isError: isErrorProfileQuery, error: errorProfileQuery } = useProfileData();
  const { updateProfile, updateAvatar, isUpdatingProfile, isUpdatingAvatar, profileUpdateError } = useProfileManager();

  // Local form states only
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [errorProfile, setErrorProfile] = useState('');
  
  // Password change states
  const [loadingPasswordChange, setLoadingPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);
  
  // UI states
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // Account deletion states
  const [showDeleteAccountForm, setShowDeleteAccountForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  const canManageCurrentAccount = canManageAccount();

  // Initialize form fields when profile data loads
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setDisplayName(profile.display_name || (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}`.trim() : user?.email || ''));
      setEmail(profile.email || user?.email || '');
    }
  }, [profile, user]);

  // Handle profile update error from hook
  useEffect(() => {
    if (profileUpdateError) {
      setErrorProfile(profileUpdateError.message || 'Fehler beim Aktualisieren des Profils.');
      onErrorProfileMessage(profileUpdateError.message || 'Fehler beim Aktualisieren des Profils.');
    }
  }, [profileUpdateError, onErrorProfileMessage]);

  const avatarRobotId = profile?.avatar_robot_id ?? 1;

  const handleProfileUpdateSubmit = async (e) => {
    e.preventDefault();
    setErrorProfile(''); 
    setPasswordError(''); 
    onSuccessMessage(''); 
    onErrorProfileMessage('');

    // Email validation for manageable accounts
    if (canManageCurrentAccount && email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        const errorMsg = 'Bitte gib eine gültige E-Mail-Adresse ein.';
        setErrorProfile(errorMsg);
        onErrorProfileMessage(errorMsg);
        return;
      }
    }

    const fullDisplayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : (displayName || email || 'Benutzer');
    
    const profileUpdateData = {
      display_name: fullDisplayName,
      first_name: firstName || null,
      last_name: lastName || null,
      avatar_robot_id: avatarRobotId
    };

    if (canManageCurrentAccount) {
      profileUpdateData.email = email?.trim() || null;
    }

    try {
      await updateProfile(profileUpdateData);
      onSuccessMessage('Profil erfolgreich aktualisiert!');
      onErrorProfileMessage('');
      setErrorProfile('');
      
      // Event for other components
      if (profileUpdateData.avatar_robot_id !== undefined) {
        window.dispatchEvent(new CustomEvent('avatarUpdated', { 
          detail: { avatarRobotId: profileUpdateData.avatar_robot_id } 
        }));
      }
    } catch (error) {
      // Error is handled by useEffect above
    }
  };

  const handleAvatarSelect = async (robotId) => {
    try {
      await updateAvatar(robotId);
      onSuccessMessage('Avatar erfolgreich aktualisiert!');
      
      // Event for other components
      window.dispatchEvent(new CustomEvent('avatarUpdated', { 
        detail: { avatarRobotId: robotId } 
      }));
    } catch (error) {
      onErrorProfileMessage('Fehler beim Aktualisieren des Avatars.');
    }
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setErrorProfile('');
    onSuccessMessage('');
    onErrorProfileMessage('');

    // Basic validation
    if (!user?.email) {
      const msg = "Benutzerinformationen nicht verfügbar. Bitte neu anmelden.";
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
      // Note: Password validation and update logic should ideally be moved to profileUtils
      // For now, keeping the existing logic but this could be further extracted
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

  const handleToggleDeleteAccountForm = () => {
    setShowDeleteAccountForm(!showDeleteAccountForm);
    if (!showDeleteAccountForm) {
      setDeletePassword('');
      setDeleteConfirmText('');
      setDeleteAccountError('');
    } else {
      setDeleteAccountError('');
    }
  };

  const handleDeleteAccountSubmit = async (e) => {
    e.preventDefault();
    setDeleteAccountError('');
    onErrorProfileMessage('');

    if (!deletePassword) {
      const msg = 'Bitte geben Sie Ihr Passwort zur Bestätigung ein.';
      setDeleteAccountError(msg);
      onErrorProfileMessage(msg);
      return;
    }

    const expectedText = 'KONTO LÖSCHEN';
    if (deleteConfirmText !== expectedText) {
      const msg = `Bitte geben Sie "${expectedText}" zur Bestätigung ein.`;
      setDeleteAccountError(msg);
      onErrorProfileMessage(msg);
      return;
    }

    setIsDeletingAccount(true);

    try {
      const result = await deleteAccount({
        password: deletePassword
      });

      if (result.success) {
        onSuccessMessage('Konto erfolgreich gelöscht. Sie werden automatisch weitergeleitet...');
      }
    } catch (error) {
      console.error('Account deletion error:', error);
      const msg = error.message || 'Fehler beim Löschen des Kontos.';
      setDeleteAccountError(msg);
      onErrorProfileMessage(msg);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // UI Helper functions
  const calculatedDisplayName = displayName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : email || 'Benutzer');

  const avatarProps = getAvatarDisplayProps({
    avatar_robot_id: avatarRobotId,
    first_name: firstName,
    last_name: lastName,
    email: email || user?.email
  });

  const getPossessiveForm = (name) => {
    if (!name) return "Dein";
    if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
      return `${name}'`;
    } else {
      return `${name}'s`;
    }
  };

  const isLoading = isLoadingProfile || isUpdatingProfile || isUpdatingAvatar;

  return (
    <>
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
            {(email || user?.email) && <div className="profile-user-email">{email || user?.email}</div>}
            {user?.id && <div className="profile-user-id" style={{ fontSize: '0.8rem', color: 'var(--font-color-subtle)', marginTop: 'var(--spacing-xxsmall)' }}>ID: {user.id}</div>}
          </div>
        </div>

        <div className="profile-form-section">
          {(errorProfile || isErrorProfileQuery) && (
            <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)'}}>
              {errorProfile || errorProfileQuery?.message || 'Ein Fehler ist aufgetreten.'}
              {isErrorProfileQuery && 
                <button 
                  type="button" 
                  onClick={() => queryClient.refetchQueries({ queryKey: ['profileData', user?.id] })} 
                  style={{marginLeft: '10px'}} 
                  className="profile-action-button profile-secondary-button"
                >
                  Erneut versuchen
                </button>
              }
            </div>
          )}
          
          <form className="auth-form" onSubmit={handleProfileUpdateSubmit}>
            <div className="form-group">
              <div className="form-group-title">Persönliche Daten</div>
              <div className="form-field-wrapper">
                <label htmlFor="email">E-Mail:</label>
                <TextInput 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="Deine E-Mail-Adresse" 
                  aria-label="E-Mail" 
                  disabled={!canManageCurrentAccount || isLoading}
                />
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="firstName">Vorname:</label>
                <TextInput 
                  id="firstName" 
                  type="text" 
                  value={firstName} 
                  onChange={(e) => setFirstName(e.target.value)} 
                  placeholder="Dein Vorname" 
                  aria-label="Vorname" 
                  disabled={isLoading}
                />
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="lastName">Nachname:</label>
                <TextInput 
                  id="lastName" 
                  type="text" 
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)} 
                  placeholder="Dein Nachname" 
                  aria-label="Nachname" 
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="profile-actions">
              <button 
                type="submit" 
                className="profile-action-button profile-primary-button" 
                disabled={isLoading || loadingPasswordChange} 
                aria-live="polite"
              >
                {isLoading ? <Spinner size="small" /> : 'Profil aktualisieren'}
              </button>
            </div>
          </form>

          <hr className="form-divider-large" />

          {!showPasswordChangeForm && (
            <div className="profile-actions" style={{ marginTop: 'var(--spacing-large)' }}>
              <button 
                type="button" 
                className="profile-action-button" 
                onClick={handleTogglePasswordForm}
                disabled={isLoading} 
              >
                Passwort ändern
              </button>
            </div>
          )}

          {showPasswordChangeForm && (
            <form className="auth-form" onSubmit={handlePasswordChangeSubmit} style={{ marginTop: 'var(--spacing-large)' }}>
              <div className="form-group">
                <div className="form-group-title">Passwort ändern</div>
                {passwordError && (
                  <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
                    {passwordError}
                  </div>
                )}
                <div className="form-field-wrapper">
                  <label htmlFor="currentPassword">Aktuelles Passwort:</label>
                  <TextInput 
                    id="currentPassword" 
                    type="password" 
                    value={currentPassword} 
                    onChange={(e) => setCurrentPassword(e.target.value)} 
                    placeholder="Dein aktuelles Passwort" 
                    aria-label="Aktuelles Passwort" 
                    disabled={loadingPasswordChange || isLoading}
                  />
                </div>
                <div className="form-field-wrapper">
                  <label htmlFor="newPassword">Neues Passwort:</label>
                  <TextInput 
                    id="newPassword" 
                    type="password" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    placeholder="Dein neues Passwort (min. 8 Zeichen)" 
                    aria-label="Neues Passwort" 
                    disabled={loadingPasswordChange || isLoading}
                  />
                </div>
                <div className="form-field-wrapper">
                  <label htmlFor="confirmPassword">Neues Passwort bestätigen:</label>
                  <TextInput 
                    id="confirmPassword" 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder="Neues Passwort wiederholen" 
                    aria-label="Neues Passwort bestätigen" 
                    disabled={loadingPasswordChange || isLoading}
                  />
                </div>
              </div>
              <div className="profile-actions">
                <button 
                  type="submit" 
                  className="profile-action-button profile-primary-button" 
                  disabled={loadingPasswordChange || isLoading}
                >
                  {loadingPasswordChange ? <Spinner size="small" /> : 'Passwort ändern'}
                </button>
                <button 
                  type="button" 
                  className="profile-action-button" 
                  onClick={handleTogglePasswordForm}
                  disabled={loadingPasswordChange || isLoading}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}

          {canManageCurrentAccount && !showDeleteAccountForm && (
            <>
              <hr className="form-divider-large" />
              <div className="profile-actions" style={{ marginTop: 'var(--spacing-large)' }}>
                <button 
                  type="button" 
                  className="profile-action-button profile-danger-button" 
                  onClick={handleToggleDeleteAccountForm}
                  disabled={isLoading || loadingPasswordChange}
                >
                  Konto löschen
                </button>
              </div>
            </>
          )}

          {showDeleteAccountForm && (
            <form className="auth-form" onSubmit={handleDeleteAccountSubmit} style={{ marginTop: 'var(--spacing-large)' }}>
              <div className="form-group">
                <div className="form-group-title" style={{ color: 'var(--error-color)' }}>Konto löschen</div>
                <p className="warning-text">
                  <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. 
                  Alle Ihre Daten werden permanent gelöscht.
                </p>
                {deleteAccountError && (
                  <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
                    {deleteAccountError}
                  </div>
                )}
                <div className="form-field-wrapper">
                  <label htmlFor="deletePassword">Passwort zur Bestätigung:</label>
                  <TextInput 
                    id="deletePassword" 
                    type="password" 
                    value={deletePassword} 
                    onChange={(e) => setDeletePassword(e.target.value)} 
                    placeholder="Ihr aktuelles Passwort" 
                    aria-label="Passwort zur Bestätigung" 
                    disabled={isDeletingAccount}
                  />
                </div>
                <div className="form-field-wrapper">
                  <label htmlFor="deleteConfirmText">Geben Sie "KONTO LÖSCHEN" ein:</label>
                  <TextInput 
                    id="deleteConfirmText" 
                    type="text" 
                    value={deleteConfirmText} 
                    onChange={(e) => setDeleteConfirmText(e.target.value)} 
                    placeholder="KONTO LÖSCHEN" 
                    aria-label="Bestätigungstext" 
                    disabled={isDeletingAccount}
                  />
                </div>
              </div>
              <div className="profile-actions">
                <button 
                  type="submit" 
                  className="profile-action-button profile-danger-button" 
                  disabled={isDeletingAccount}
                >
                  {isDeletingAccount ? <Spinner size="small" /> : 'Konto unwiderruflich löschen'}
                </button>
                <button 
                  type="button" 
                  className="profile-action-button" 
                  onClick={handleToggleDeleteAccountForm}
                  disabled={isDeletingAccount}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>

      {showAvatarModal && (
        <AvatarSelectionModal
          isOpen={showAvatarModal}
          currentAvatarId={avatarRobotId}
          onSelect={handleAvatarSelect}
          onClose={() => setShowAvatarModal(false)}
        />
      )}
    </>
  );
};

export default ProfileInfoTab; 