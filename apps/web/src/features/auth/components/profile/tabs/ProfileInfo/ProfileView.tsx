import { motion } from 'motion/react';
import React, { type FormEvent } from 'react';
import { GiHedgehog } from 'react-icons/gi';

import TextInput from '../../../../../../components/common/Form/Input/TextInput';
import Spinner from '../../../../../../components/common/Spinner';
import MemoriesSection from '../../../../../../components/profile/MemoriesSection';
import { Button } from '../../../../../../components/ui/button';
import { Card } from '../../../../../../components/ui/card';
import { useAuthStore, type SupportedLocale } from '../../../../../../stores/authStore';
import { cn } from '../../../../../../utils/cn';

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
  customPrompt: string;
  setCustomPrompt: (value: string) => void;
  isPromptDirty: boolean;
  isSavingPrompt: boolean;
  onSaveCustomPrompt: () => void;
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
  customPrompt,
  setCustomPrompt,
  isPromptDirty,
  isSavingPrompt,
  onSaveCustomPrompt,
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
  const { locale, updateLocale } = useAuthStore();

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    updateLocale(newLocale);
  };

  const getPossessiveForm = (name: string | undefined): string => {
    if (!name) return 'Dein';
    if (/[sßzx]$/.test(name) || name.endsWith('ss') || name.endsWith('tz') || name.endsWith('ce')) {
      return `${name}'`;
    } else {
      return `${name}'s`;
    }
  };

  return (
    <motion.div
      className="flex flex-col gap-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {(errorProfile || isErrorProfileQuery) && (
        <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 flex items-center gap-sm">
          <span>{errorProfile || errorProfileQueryMessage || 'Ein Fehler ist aufgetreten.'}</span>
          {isErrorProfileQuery && (
            <Button variant="outline" size="sm" onClick={onRetryProfileRefetch}>
              Erneut versuchen
            </Button>
          )}
        </div>
      )}

      {/* Two-column layout: Profile Card + Experimental Features */}
      <div className="flex flex-col lg:flex-row gap-xl">
        {/* Left: Profile Card */}
        <Card className="p-lg flex-1 flex flex-col gap-md">
          <div className="flex items-center gap-md flex-wrap">
            <div
              className="flex items-center justify-center size-14 rounded-full border-2 border-primary-500 overflow-hidden shrink-0 cursor-pointer bg-background-alt"
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
                <img
                  src={avatarProps.src}
                  alt={avatarProps.alt}
                  className="size-full object-contain"
                />
              ) : (
                <div className="size-full bg-primary-500 flex items-center justify-center text-2xl text-white font-bold">
                  {avatarProps.initials}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-xxs flex-1 min-w-[150px]">
              <div className="text-lg font-semibold">
                {displayName ? getPossessiveForm(displayName.split(' ')[0]) : 'Dein'} Grünerator
              </div>
              {(email || user?.email || user?.username) && (
                <div className="text-sm text-grey-500">
                  {email || user?.email || user?.username}
                </div>
              )}
              {username && <div className="text-sm text-grey-500">@{username}</div>}
            </div>

            <div className="ml-auto flex items-center gap-xs">
              <div className="flex gap-xxs">
                <button
                  type="button"
                  className={cn(
                    'flex items-center justify-center size-8 rounded-md border bg-background-alt text-lg transition-all',
                    locale === 'de-DE'
                      ? 'opacity-100 border-primary-500 bg-background'
                      : 'opacity-50 border-grey-300 dark:border-grey-600 hover:opacity-80'
                  )}
                  onClick={() => handleLocaleChange('de-DE')}
                  aria-label="Deutsch (Deutschland)"
                  title="Deutsch (Deutschland)"
                >
                  🇩🇪
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex items-center justify-center size-8 rounded-md border bg-background-alt text-lg transition-all',
                    locale === 'de-AT'
                      ? 'opacity-100 border-primary-500 bg-background'
                      : 'opacity-50 border-grey-300 dark:border-grey-600 hover:opacity-80'
                  )}
                  onClick={() => handleLocaleChange('de-AT')}
                  aria-label="Deutsch (Österreich)"
                  title="Deutsch (Österreich)"
                >
                  🇦🇹
                </button>
              </div>
              <button
                type="button"
                className={cn(
                  'flex items-center justify-center size-8 rounded-md border bg-background-alt transition-all',
                  igelActive
                    ? 'opacity-100 text-primary-500 border-primary-500 bg-background'
                    : 'opacity-50 text-foreground border-grey-300 dark:border-grey-600 hover:opacity-80',
                  'disabled:cursor-not-allowed disabled:opacity-30'
                )}
                onClick={() => onToggleIgelModus(!igelActive)}
                aria-label="Igel-Modus"
                title={igelActive ? 'Igel-Modus deaktivieren' : 'Igel-Modus aktivieren'}
                disabled={isBetaFeaturesUpdating}
              >
                <GiHedgehog size={20} />
              </button>
            </div>
          </div>

          <div className="flex flex-col pt-sm border-t border-grey-200 dark:border-grey-700">
            <label htmlFor="customPrompt" className="text-sm font-semibold mb-xs">
              Persönliche Anweisungen
            </label>
            <p className="text-xs text-grey-500 mb-sm leading-relaxed">
              Die bisherigen Anweisungen wurden in das persönliche Prompt-Feld übernommen.
            </p>
            <textarea
              id="customPrompt"
              value={customPrompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setCustomPrompt(e.target.value)
              }
              placeholder="Diese Anweisungen werden bei allen Text-Generierungen berücksichtigt, z.B. dein Schreibstil oder Infos zu dir und deinem Wahlkreis..."
              className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              rows={4}
              maxLength={2000}
              disabled={isLoading}
            />
            <div className="flex items-center justify-between mt-xs">
              <div className="text-xs text-grey-400">{customPrompt.length}/2000</div>
              {isPromptDirty && (
                <Button
                  size="sm"
                  onClick={onSaveCustomPrompt}
                  disabled={isSavingPrompt || isLoading}
                >
                  {isSavingPrompt ? 'Speichert…' : 'Speichern'}
                </Button>
              )}
            </div>
          </div>

          {/* Hidden profile fields - only shown when not from Keycloak */}
          {(!(profile?.keycloak_id && (profile?.email || profile?.auth_email)) ||
            !(profile?.keycloak_id && profile?.display_name) ||
            !(profile?.keycloak_id && profile?.username)) && (
            <div className="mt-sm flex flex-col gap-sm pt-sm border-t border-grey-200 dark:border-grey-700">
              {!(profile?.keycloak_id && (profile?.email || profile?.auth_email)) && (
                <div className="flex flex-col gap-xxs">
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
                <div className="flex flex-col gap-xxs">
                  <label htmlFor="displayName">Name:</label>
                  <TextInput
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDisplayName(e.target.value)
                    }
                    placeholder="Dein vollständiger Name"
                    aria-label="Name"
                    disabled={isLoading}
                  />
                </div>
              )}
              {!(profile?.keycloak_id && profile?.username) && (
                <div className="flex flex-col gap-xxs">
                  <label htmlFor="username">Benutzername:</label>
                  <TextInput
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setUsername(e.target.value)
                    }
                    placeholder="Dein Benutzername"
                    aria-label="Benutzername"
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Right: Experimental Features */}
        <SettingsSection
          isActive={true}
          igelActive={igelActive}
          onToggleIgelModus={onToggleIgelModus}
          isBetaFeaturesUpdating={isBetaFeaturesUpdating}
          onSuccessMessage={onSuccessMessage}
          onErrorMessage={() => {}}
          compact
        />
      </div>

      <MemoriesSection />

      {showDeleteAccountForm && (
        <Card className="p-lg border-red-200 dark:border-red-800">
          <form onSubmit={onDeleteAccountSubmit}>
            <div className="flex flex-col gap-sm">
              <div className="text-base font-semibold text-red-700 dark:text-red-400">
                Konto löschen
              </div>
              <p className="text-sm text-grey-600 dark:text-grey-400">
                <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. Alle
                Ihre Daten werden permanent gelöscht.
              </p>
              {deleteAccountError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {deleteAccountError}
                </div>
              )}
              <div className="flex flex-col gap-xxs">
                <label htmlFor="deleteConfirmText">
                  Um fortzufahren, gib &quot;löschen&quot; ein:
                </label>
                <TextInput
                  id="deleteConfirmText"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDeleteConfirmText(e.target.value)
                  }
                  placeholder="löschen"
                  aria-label="Bestätigung: löschen"
                  disabled={isDeletingAccount}
                />
              </div>
            </div>
            <div className="flex gap-sm justify-end mt-md">
              <Button variant="destructive" type="submit" disabled={isDeletingAccount}>
                {isDeletingAccount ? <Spinner size="small" /> : 'Konto unwiderruflich löschen'}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={onToggleDeleteAccountForm}
                disabled={isDeletingAccount}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Konto löschen link - at bottom of page */}
      {canManageCurrentAccount && !showDeleteAccountForm && (
        <Button
          variant="ghost"
          className="text-grey-500 hover:text-red-600 dark:hover:text-red-400 text-sm underline mt-lg w-full"
          onClick={onToggleDeleteAccountForm}
          disabled={isLoading}
        >
          Konto löschen
        </Button>
      )}
    </motion.div>
  );
};

export default ProfileView;
