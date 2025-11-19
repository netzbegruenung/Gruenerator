import React from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Spinner from '../../../../../../components/common/Spinner';
import TextInput from '../../../../../../components/common/Form/Input/TextInput';
import { useAuthStore } from '../../../../../../stores/authStore';

const LocaleSelector = () => {
  const { t } = useTranslation();
  const { locale, updateLocale } = useAuthStore();

  const handleLocaleChange = async (event) => {
    const newLocale = event.target.value;
    const success = await updateLocale(newLocale);
    if (!success) {
      console.error('Failed to update locale');
    }
  };

  return (
    <div className="form-field-wrapper">
      <label htmlFor="locale">Sprache:</label>
      <select
        id="locale"
        value={locale}
        onChange={handleLocaleChange}
        className="form-select"
        aria-label="Sprachvariant auswählen"
      >
        <option value="de-DE">Deutsch (Deutschland)</option>
        <option value="de-AT">Deutsch (Österreich)</option>
      </select>
    </div>
  );
};

const ProfileView = ({
  // User and profile
  user,
  profile,
  avatarProps,
  isLoading,
  // Form state
  displayName,
  setDisplayName,
  email,
  setEmail,
  username,
  setUsername,
  // Errors and retry
  errorProfile,
  isErrorProfileQuery,
  errorProfileQueryMessage,
  onRetryProfileRefetch,
  // Avatar modal
  onOpenAvatarModal,
  // Account deletion
  canManageCurrentAccount,
  showDeleteAccountForm,
  onToggleDeleteAccountForm,
  deleteConfirmText,
  setDeleteConfirmText,
  deleteAccountError,
  isDeletingAccount,
  onDeleteAccountSubmit,
}) => {
  const getPossessiveForm = (name) => {
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
        <h2 className="profile-section-header">Profil</h2>
        <div className="profile-avatar-section">
          <div
            className="profile-avatar clickable-avatar"
            onClick={onOpenAvatarModal}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
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
            {user?.id && <div className="profile-user-id user-id-display">ID: {user.id}</div>}
            <p className="profile-beta-notice">Alle Profil-Features befinden sich in der Beta-Phase und können instabil sein.</p>
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
              <div className="form-group-title">Persönliche Daten</div>
              <div className="form-field-wrapper">
                <label htmlFor="email">E-Mail:</label>
                <TextInput
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    profile?.keycloak_id && (profile?.email || profile?.auth_email)
                      ? 'E-Mail wird von deinem Login-Anbieter verwaltet'
                      : 'Deine E-Mail-Adresse'
                  }
                  aria-label="E-Mail"
                  disabled={isLoading || (profile?.keycloak_id && (profile?.email || profile?.auth_email))}
                />
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="displayName">Name:</label>
                <TextInput
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={
                    profile?.keycloak_id && profile?.display_name
                      ? 'Name wird von deinem Login-Anbieter verwaltet'
                      : 'Dein vollständiger Name'
                  }
                  aria-label="Name"
                  disabled={isLoading || (profile?.keycloak_id && profile?.display_name)}
                />
              </div>
              <div className="form-field-wrapper">
                <label htmlFor="username">Benutzername:</label>
                <TextInput
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={
                    profile?.keycloak_id && profile?.username
                      ? 'Benutzername wird von deinem Login-Anbieter verwaltet'
                      : 'Dein Benutzername'
                  }
                  aria-label="Benutzername"
                  disabled={isLoading || (profile?.keycloak_id && profile?.username)}
                />
              </div>
              <LocaleSelector />
            </div>
            <div className="form-help-text">Änderungen werden automatisch gespeichert</div>
          </div>

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
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
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
