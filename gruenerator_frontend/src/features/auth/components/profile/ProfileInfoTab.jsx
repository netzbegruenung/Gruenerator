import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { profileApiService } from '../../services/profileApiService';
import { useAutosave } from '../../../../hooks/useAutosave';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import FeatureToggle from '../../../../components/common/FeatureToggle';
import { 
  getAvatarDisplayProps, 
  initializeProfileFormFields
} from '../../services/profileApiService';
import { useProfile } from '../../hooks/useProfileData';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';
import AvatarSelectionModal from './AvatarSelectionModal';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import { motion } from "motion/react";
import { GiHedgehog } from "react-icons/gi";
import { HiOutlineOfficeBuilding, HiOutlineAcademicCap } from "react-icons/hi";

const ProfileInfoTab = ({ 
  user: userProp, 
  onSuccessMessage, 
  onErrorProfileMessage, 
  deleteAccount, 
  canManageAccount 
}) => {
  const queryClient = useQueryClient();
  
  // Get user from auth hook as fallback if prop is not provided
  const { 
    user: authUser, 
    loading: authLoading, 
    isAuthenticated
  } = useOptimizedAuth();
  
  // Use beta features pattern for profile settings
  const {
    getBetaFeatureState,
    updateUserBetaFeatures,
    isUpdating: isBetaFeaturesUpdating
  } = useBetaFeatures();
  const user = userProp || authUser;
  
  // Business logic hooks from useProfileData
  const { data: profile, isLoading: isLoadingProfile, isError: isErrorProfileQuery, error: errorProfileQuery } = useProfile(user?.id);

  // Profile update mutations (moved from useProfileManager)
  const updateProfileMutation = useMutation({
    mutationFn: async (profileData) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await profileApiService.updateProfile(profileData);
    },
    onSuccess: (updatedProfile) => {
      if (user?.id && updatedProfile) {
        queryClient.setQueryData(['profileData', user.id], (oldData) => ({
          ...oldData,
          ...updatedProfile
        }));
      }
    },
    onError: (error) => {
      console.error('Profile update failed:', error);
    },
    retry: 1,
    retryDelay: 1000
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarRobotId) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await profileApiService.updateAvatar(avatarRobotId);
    },
    onSuccess: (updatedProfile) => {
      if (user?.id && updatedProfile) {
        queryClient.setQueryData(['profileData', user.id], (oldData) => ({
          ...oldData,
          ...updatedProfile
        }));
      }
    },
    onError: (error) => {
      console.error('Avatar update failed:', error);
    }
  });

  // Extract mutation functions for easier use
  const updateProfile = updateProfileMutation.mutate;
  const updateAvatar = updateAvatarMutation.mutate;
  const isUpdatingProfile = updateProfileMutation.isPending;
  const isUpdatingAvatar = updateAvatarMutation.isPending;
  const profileUpdateError = updateProfileMutation.error;
  const resetProfileMutation = () => updateProfileMutation.reset();

  // Local form states only
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [errorProfile, setErrorProfile] = useState('');
  
  // Ref to track initialization
  const isInitialized = useRef(false);
  
  
  // UI states
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // Account deletion states
  const [showDeleteAccountForm, setShowDeleteAccountForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  const canManageCurrentAccount = user ? canManageAccount() : false;

  // Early return if no user available
  if (!user) {
    return (
      <div className="profile-tab-loading">
        <div>Benutzerinformationen werden geladen...</div>
      </div>
    );
  }

  // Define avatarRobotId early since it's used in auto-save
  const avatarRobotId = profile?.avatar_robot_id ?? 1;

  // State-based autosave using shared hook pattern (moved before initialization to prevent "cannot access before initialization" error)
  const stateBasedSave = useCallback(async () => {
    if (!profile || !isInitialized.current) return;
    
    const fullDisplayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : (displayName || email || user?.username || 'Benutzer');
    
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
      // Add a timeout to prevent hanging saves
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save timeout')), 10000)
      );
      
      await Promise.race([
        updateProfile(profileUpdateData),
        timeoutPromise
      ]);
      
      setErrorProfile('');
    } catch (error) {
      console.error('Auto-save error:', error);
      if (error.message === 'Save timeout') {
        setErrorProfile('Speichern dauert zu lange. Bitte versuchen Sie es erneut.');
        onErrorProfileMessage('Speichern dauert zu lange. Bitte versuchen Sie es erneut.');
      }
    }
  }, [firstName, lastName, displayName, email, avatarRobotId, canManageCurrentAccount, user?.username, profile, updateProfile, onErrorProfileMessage]);

  // Auto-save using shared hook with state variables  
  const { resetTracking } = useAutosave({
    saveFunction: stateBasedSave,
    formRef: {
      getValues: () => ({ firstName, lastName, displayName, email, avatarRobotId }),
      watch: () => {} // Not needed for state-based
    },
    enabled: profile && isInitialized.current,
    debounceMs: 2000,
    getFieldsToTrack: () => ['firstName', 'lastName', 'displayName', 'email', 'avatarRobotId'],
    onError: (error) => {
      console.error('Profile autosave failed:', error);
      setErrorProfile('Automatisches Speichern fehlgeschlagen.');
    }
  });

  // Initialize form fields when profile data loads (centralized logic from profileApiService)
  useEffect(() => {
    if (!profile || !user) return;
    
    const formFields = initializeProfileFormFields(profile, user);
    
    // Only initialize once or when switching users
    if (!isInitialized.current) {
      setFirstName(formFields.firstName);
      setLastName(formFields.lastName);
      setDisplayName(formFields.displayName);
      setEmail(formFields.email);
      isInitialized.current = true;
      // Reset autosave tracking after initial setup
      setTimeout(() => resetTracking(), 100);
    }
  }, [profile, user, resetTracking]);

  // Trigger autosave when state changes
  useEffect(() => {
    if (profile && isInitialized.current) {
      // Small delay to allow focus detection
      const timer = setTimeout(() => {
        resetTracking();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [firstName, lastName, displayName, email, avatarRobotId, resetTracking, profile, isInitialized]);

  // Handle profile update error from hook
  useEffect(() => {
    if (profileUpdateError) {
      setErrorProfile(profileUpdateError.message || 'Fehler beim Aktualisieren des Profils.');
      onErrorProfileMessage(profileUpdateError.message || 'Fehler beim Aktualisieren des Profils.');
    }
  }, [profileUpdateError, onErrorProfileMessage]);

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

  const handleIgelModusToggle = async (enabled) => {
    try {
      await updateUserBetaFeatures('igel_modus', enabled);
      onSuccessMessage(enabled ? 'Igel-Modus aktiviert! Du bist jetzt Mitglied der Grünen Jugend.' : 'Igel-Modus deaktiviert.');
    } catch (error) {
      onErrorProfileMessage(error.message || 'Fehler beim Aktualisieren des Igel-Modus.');
    }
  };

  const handleBundestagApiToggle = async (enabled) => {
    try {
      await updateUserBetaFeatures('bundestag_api_enabled', enabled);
      onSuccessMessage(enabled ? 'Bundestag API aktiviert! Du kannst jetzt parlamentarische Dokumente verwenden.' : 'Bundestag API deaktiviert.');
    } catch (error) {
      onErrorProfileMessage(error.message || 'Fehler beim Aktualisieren der Bundestag API Einstellung.');
    }
  };

  const handleELearningToggle = async (enabled) => {
    try {
      await updateUserBetaFeatures('e_learning', enabled);
      onSuccessMessage(enabled ? 'E-Learning aktiviert! Du kannst jetzt auf die Lernmodule zugreifen.' : 'E-Learning deaktiviert.');
    } catch (error) {
      onErrorProfileMessage(error.message || 'Fehler beim Aktualisieren der E-Learning Einstellung.');
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
  const calculatedDisplayName = displayName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : email || user?.username || 'Benutzer');

  const avatarProps = getAvatarDisplayProps({
    avatar_robot_id: avatarRobotId,
    first_name: firstName,
    last_name: lastName,
    email: email || user?.email || user?.username
  });

  const getPossessiveForm = (name) => {
    if (!name) return "Dein";
    if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
      return `${name}'`;
    } else {
      return `${name}'s`;
    }
  };

  // Separate loading states - only disable fields during profile loading, not during updates
  const isLoading = isLoadingProfile;
  const isSaving = isUpdatingProfile || isUpdatingAvatar;

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
            className="profile-avatar clickable-avatar" 
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
          >
            {avatarProps.type === 'robot' ? (
              <img 
                src={avatarProps.src} 
                alt={avatarProps.alt}
                className="avatar-image"
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
            {(email || user?.email || user?.username) && <div className="profile-user-email">{email || user?.email || user?.username}</div>}
            {user?.id && <div className="profile-user-id user-id-display">ID: {user.id}</div>}
          </div>
        </div>

        <div className="profile-form-section">
          {(errorProfile || isErrorProfileQuery) && (
            <div className="auth-error-message error-margin">
              {errorProfile || errorProfileQuery?.message || 'Ein Fehler ist aufgetreten.'}
              {isErrorProfileQuery && 
                <button 
                  type="button" 
                  onClick={() => queryClient.refetchQueries({ queryKey: ['profileData', user?.id] })} 
                  className="retry-button profile-action-button profile-secondary-button"
                >
                  Erneut versuchen
                </button>
              }
            </div>
          )}
          
          <div className="auth-form">
            <div className="form-group">
              <div className="form-group-title">Persönliche Daten</div>
              <div className="form-field-wrapper">
                <label htmlFor="email">E-Mail:</label>
                <TextInput 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder={!canManageCurrentAccount ? "E-Mail wird von deinem Login-Anbieter verwaltet" : "Deine E-Mail-Adresse"} 
                  aria-label="E-Mail" 
                  disabled={!canManageCurrentAccount}
                />
                {!canManageCurrentAccount && profile?.is_sso_user && (
                  <div className="form-help-text">
                    Deine E-Mail-Adresse wird von deinem Login-Anbieter (SSO) verwaltet und kann hier nicht geändert werden.
                  </div>
                )}
                {canManageCurrentAccount && profile?.is_sso_user && !profile?.auth_email && (
                  <div className="form-help-text form-help-text-success">
                    Du kannst hier deine E-Mail-Adresse hinzufügen, da keine von deinem Login-Anbieter bereitgestellt wurde.
                  </div>
                )}
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
                  disabled={false}
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
            <div className="form-help-text">
              Änderungen werden automatisch gespeichert
            </div>
          </div>

          <hr className="form-divider" />
          
          <div className="form-group">
            <div className="form-group-title">Mitgliedschaften</div>
            <FeatureToggle
              isActive={getBetaFeatureState('igel_modus')}
              onToggle={handleIgelModusToggle}
              label="Igel-Modus"
              icon={GiHedgehog}
              description="Aktiviere den Igel-Modus, um als Mitglied der Grünen Jugend erkannt zu werden. Dies beeinflusst deine Erfahrung und verfügbare Funktionen."
              className="igel-modus-toggle"
              disabled={isBetaFeaturesUpdating}
            />
          </div>

          <hr className="form-divider" />
          
          <div className="form-group">
            <div className="form-group-title">API Integrationen</div>
            <FeatureToggle
              isActive={getBetaFeatureState('bundestag_api_enabled')}
              onToggle={handleBundestagApiToggle}
              label="Bundestag API aktivieren"
              icon={HiOutlineOfficeBuilding}
              description="Aktiviere die Integration mit der Bundestag API (DIP - Dokumentations- und Informationssystem für Parlamentsmaterialien) um parlamentarische Dokumente, Drucksachen und Plenarprotokolle in deine Anträge einzubeziehen."
              className="bundestag-api-toggle"
              disabled={isBetaFeaturesUpdating}
            />
          </div>

          <hr className="form-divider" />
          
          <div className="form-group">
            <div className="form-group-title">Bildung & Lernen</div>
            <FeatureToggle
              isActive={getBetaFeatureState('e_learning')}
              onToggle={handleELearningToggle}
              label="E-Learning aktivieren"
              icon={HiOutlineAcademicCap}
              description="Aktiviere den Zugang zu interaktiven E-Learning Modulen über grüne Politik, Klimaschutz und nachhaltiges Engagement. Erweitere dein Wissen mit strukturierten Lernpfaden."
              className="elearning-toggle"
              disabled={isBetaFeaturesUpdating}
            />
            {getBetaFeatureState('e_learning') && (
              <div className="form-help-text form-help-text-success" style={{ marginTop: 'var(--spacing-small)' }}>
                ✅ E-Learning aktiviert! <a href="/e-learning" style={{ color: 'var(--link-color)', textDecoration: 'underline' }}>Zu den Lernmodulen →</a>
              </div>
            )}
          </div>

          {canManageCurrentAccount && !showDeleteAccountForm && (
            <>
              <hr className="form-divider-large" />
              <div className="profile-actions profile-actions-centered">
                <button 
                  type="button" 
                  className="delete-all-link" 
                  onClick={handleToggleDeleteAccountForm}
                  disabled={isLoading}
                >
                  Konto löschen
                </button>
              </div>
            </>
          )}

          {showDeleteAccountForm && (
            <form className="auth-form" onSubmit={handleDeleteAccountSubmit}>
              <div className="form-group">
                <div className="form-group-title">Konto löschen</div>
                <p className="warning-text">
                  <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. 
                  Alle Ihre Daten werden permanent gelöscht.
                </p>
                {deleteAccountError && (
                  <div className="auth-error-message">
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