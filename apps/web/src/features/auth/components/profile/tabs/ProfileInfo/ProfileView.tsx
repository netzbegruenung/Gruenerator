import React, { FormEvent } from 'react';
import { motion } from 'motion/react';
import Spinner from '../../../../../../components/common/Spinner';
import TextInput from '../../../../../../components/common/Form/Input/TextInput';
import SettingsSection from './SettingsSection';

interface User {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

interface Profile {
  keycloak_id?: string | null;
  avatar_robot_id?: string | number;
  display_name?: string;
  email?: string | null;
  auth_email?: string;
  username?: string;
  [key: string]: unknown;
}

interface RobotAvatarProps {
  type: 'robot';
  src: string;
  alt: string;
  robotId: number;
}

interface InitialsAvatarProps {
  type: 'initials';
  initials: string;
}

type AvatarProps = RobotAvatarProps | InitialsAvatarProps;

interface ProfileViewProps {
  user: User;
  profile: Profile | undefined;
  avatarProps: AvatarProps;
  isLoading: boolean;
  displayName: string;
  setDisplayName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  errorProfile: string;
  isErrorProfileQuery: boolean;
  errorProfileQueryMessage: string | undefined;
  onRetryProfileRefetch: () => void;
  onOpenAvatarModal: () => void;
  canManageCurrentAccount: boolean;
  showDeleteAccountForm: boolean;
  onToggleDeleteAccountForm: () => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
  deleteAccountError: string;
  isDeletingAccount: boolean;
  onDeleteAccountSubmit: (e: FormEvent<HTMLFormElement>) => void;
  igelActive: boolean;
  onToggleIgelModus: (checked: boolean) => void;
  isBetaFeaturesUpdating: boolean;
  onSuccessMessage: (message: string) => void;
}

const ProfileView = ({
  user,
  profile,
  avatarProps,
  isLoading,
  displayName,
  setDisplayName,
  email,
  setEmail,
  username,
  setUsername,
  errorProfile,
  isErrorProfileQuery,
  errorProfileQueryMessage,
  onRetryProfileRefetch,
  onOpenAvatarModal,
  canManageCurrentAccount,
  showDeleteAccountForm,
  onToggleDeleteAccountForm,
  deleteConfirmText,
  setDeleteConfirmText,
  deleteAccountError,
  isDeletingAccount,
  onDeleteAccountSubmit,
  igelActive,
  onToggleIgelModus,
  isBetaFeaturesUpdating,
  onSuccessMessage,
}: ProfileViewProps) => {
  const getPossessiveForm = (name: string | undefined): string => {
    if (!name) return 'Dein';
    if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
      return `${name}'`;
    } else {
      return `${name}'s`;
    }
  };

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
            onClick={onOpenAvatarModal}
            role="button"
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenAvatarModal();
              }
            }}
            aria-label="Avatar ändern"
          >
            {avatarProps.type === 'robot' ? (
              <img src={avatarProps.src} alt={avatarProps.alt} className="avatar-image" />
            ) : (
              <div className="profile-avatar-placeholder">{avatarProps.initials}</div>
            )}
            <div className="profile-avatar-edit-overlay"></div>
          </div>
          <div className="profile-user-info">
            <div className="profile-user-name">
              {displayName ? getPossessiveForm(displayName.split(' ')[0]) : 'Dein'} Grünerator
            </div>
            {(email || user?.email || user?.username) && (
              <div className="profile-user-email">{email || user?.email || user?.username}</div>
            )}
            {username && (
              <div className="profile-user-email">@{username}</div>
            )}
          </div>
        </div>

        <div className="profile-form-section">
          {(errorProfile || isErrorProfileQuery) && (
            <div className="auth-error-message error-margin">
              {errorProfile || errorProfileQueryMessage || 'Ein Fehler ist aufgetreten.'}
              {isErrorProfileQuery && (
                <button
                  type="button"
                  onClick={onRetryProfileRefetch}
                  className="retry-button profile-action-button profile-secondary-button"
                >
                  Erneut versuchen
                </button>
              )}
            </div>
          )}

          <div className="auth-form">
            <div className="form-group">
              {!(profile?.keycloak_id && (profile?.email || profile?.auth_email)) && (
                <div className="form-field-wrapper">
                  <label htmlFor="email">E-Mail:</label>
                  <TextInput
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    placeholder="Deine E-Mail-Adresse"
                    aria-label="E-Mail"
                    disabled={isLoading}
                  />
                </div>
              )}
              {!(profile?.keycloak_id && profile?.display_name) && (
                <div className="form-field-wrapper">
                  <label htmlFor="displayName">Name:</label>
                  <TextInput
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                    placeholder="Dein vollständiger Name"
                    aria-label="Name"
                    disabled={isLoading}
                  />
                </div>
              )}
              {!(profile?.keycloak_id && profile?.username) && (
                <div className="form-field-wrapper">
                  <label htmlFor="username">Benutzername:</label>
                  <TextInput
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                    placeholder="Dein Benutzername"
                    aria-label="Benutzername"
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          </div>

          <SettingsSection
            isActive={true}
            igelActive={igelActive}
            onToggleIgelModus={onToggleIgelModus}
            isBetaFeaturesUpdating={isBetaFeaturesUpdating}
            onSuccessMessage={onSuccessMessage}
            onErrorMessage={() => {}}
          />

          {canManageCurrentAccount && !showDeleteAccountForm && (
            <>
              <hr className="form-divider-large" />
              <div className="profile-actions profile-actions-centered">
                <button
                  type="button"
                  className="delete-all-link"
                  onClick={onToggleDeleteAccountForm}
                  disabled={isLoading}
                >
                  Konto löschen
                </button>
              </div>
            </>
          )}

          {showDeleteAccountForm && (
            <form className="auth-form" onSubmit={onDeleteAccountSubmit}>
              <div className="form-group">
                <div className="form-group-title">Konto löschen</div>
                <p className="warning-text">
                  <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. Alle Ihre Daten werden permanent gelöscht.
                </p>
                {deleteAccountError && <div className="auth-error-message">{deleteAccountError}</div>}
                <div className="form-field-wrapper">
                  <label htmlFor="deleteConfirmText">Um fortzufahren, gib "löschen" ein:</label>
                  <TextInput
                    id="deleteConfirmText"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteConfirmText(e.target.value)}
                    placeholder="löschen"
                    aria-label="Bestätigung: löschen"
                    disabled={isDeletingAccount}
                  />
                </div>
              </div>
              <div className="profile-actions">
                <button type="submit" className="profile-action-button profile-danger-button" disabled={isDeletingAccount}>
                  {isDeletingAccount ? <Spinner size="small" /> : 'Konto unwiderruflich löschen'}
                </button>
                <button type="button" className="profile-action-button" onClick={onToggleDeleteAccountForm} disabled={isDeletingAccount}>
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </>
  );
};

export default ProfileView;
