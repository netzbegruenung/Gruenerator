import { Button } from '@gruenerator/ui';
import { motion } from 'motion/react';
import React, { useState, type FormEvent } from 'react';
import { GiHedgehog } from 'react-icons/gi';
import { HiOutlinePencil } from 'react-icons/hi';

import TextInput from '../../../../../../components/common/Form/Input/TextInput';
import Spinner from '../../../../../../components/common/Spinner';
import MemoriesSection from '../../../../../../components/profile/MemoriesSection';
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
  email: string;
  username: string;
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
  email,
  username,
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
  const [showPromptEditor, setShowPromptEditor] = useState(false);
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
      className="flex flex-col gap-xl max-w-[820px] mx-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {(errorProfile || isErrorProfileQuery) && (
        <div className="rounded-lg bg-red-50 p-md text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400 flex items-center gap-sm">
          <span>{errorProfile || errorProfileQueryMessage || 'Ein Fehler ist aufgetreten.'}</span>
          {isErrorProfileQuery && (
            <Button variant="outline" size="sm" onClick={onRetryProfileRefetch}>
              Erneut versuchen
            </Button>
          )}
        </div>
      )}

      {/* Profile header */}
      <div className="flex items-center gap-lg flex-wrap">
        <div
          className="flex items-center justify-center size-16 rounded-full border-2 border-primary-500 overflow-hidden shrink-0 cursor-pointer bg-background-alt"
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
            <img src={avatarProps.src} alt={avatarProps.alt} className="size-full object-contain" />
          ) : (
            <div className="size-full bg-primary-500 flex items-center justify-center text-2xl text-white font-bold">
              {avatarProps.initials}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-xxs flex-1 min-w-[150px]">
          <div className="text-xl font-semibold text-foreground-heading">
            {displayName ? getPossessiveForm(displayName.split(' ')[0]) : 'Dein'} Grünerator
          </div>
          {username && <div className="text-sm text-grey-500">@{username}</div>}
          {(email || user?.email) && (
            <div className="text-sm text-grey-400">{email || user?.email}</div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-xs">
          <div className="flex gap-xxs">
            <button
              type="button"
              className={cn(
                'flex items-center justify-center size-8 rounded-md text-lg transition-all',
                locale === 'de-DE' ? 'opacity-100 bg-primary-500/10' : 'opacity-40 hover:opacity-70'
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
                'flex items-center justify-center size-8 rounded-md text-lg transition-all',
                locale === 'de-AT' ? 'opacity-100 bg-primary-500/10' : 'opacity-40 hover:opacity-70'
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
              'flex items-center justify-center size-8 rounded-md transition-all',
              igelActive
                ? 'opacity-100 text-primary-500 bg-primary-500/10'
                : 'opacity-40 text-foreground hover:opacity-70',
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

      {/* Personal instructions */}
      <div className="flex flex-col">
        <div className="flex items-center gap-sm mb-sm">
          <HiOutlinePencil className="size-5 text-primary-500" />
          <span className="text-sm font-medium text-foreground">Persönliche Anweisungen</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-grey-500 hover:text-foreground"
            onClick={() => setShowPromptEditor(!showPromptEditor)}
          >
            {showPromptEditor ? 'Schließen' : 'Bearbeiten'}
          </Button>
        </div>

        {!showPromptEditor && customPrompt ? (
          <p className="text-sm text-grey-500 line-clamp-2">{customPrompt}</p>
        ) : !showPromptEditor ? (
          <p className="text-sm text-grey-400">
            Anweisungen für alle Text-Generierungen, z.B. Schreibstil oder Infos zu deinem
            Wahlkreis.
          </p>
        ) : null}

        {showPromptEditor && (
          <div className="flex flex-col gap-sm rounded-lg bg-background-alt p-md mt-sm">
            <textarea
              id="customPrompt"
              value={customPrompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setCustomPrompt(e.target.value)
              }
              placeholder="z.B. dein Schreibstil oder Infos zu dir und deinem Wahlkreis..."
              className="w-full rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground resize-vertical placeholder:text-grey-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:border-grey-600"
              rows={4}
              maxLength={2000}
              disabled={isLoading}
            />
            <div className="flex items-center justify-between">
              {customPrompt.length > 1500 ? (
                <div className="text-xs text-grey-400">{customPrompt.length}/2000</div>
              ) : (
                <div />
              )}
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
        )}
      </div>

      {/* Experimental Features */}
      <SettingsSection
        isActive={true}
        igelActive={igelActive}
        onToggleIgelModus={onToggleIgelModus}
        isBetaFeaturesUpdating={isBetaFeaturesUpdating}
        onSuccessMessage={onSuccessMessage}
        onErrorMessage={() => {}}
      />

      <MemoriesSection />

      {showDeleteAccountForm && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/10 p-lg">
          <form onSubmit={onDeleteAccountSubmit}>
            <div className="flex flex-col gap-md">
              <div className="text-base font-semibold text-red-700 dark:text-red-400">
                Konto löschen
              </div>
              <p className="text-sm text-grey-600 dark:text-grey-400">
                <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. Alle
                deine Daten werden permanent gelöscht.
              </p>
              {deleteAccountError && (
                <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-sm text-sm text-red-700 dark:text-red-400">
                  {deleteAccountError}
                </div>
              )}
              <div className="flex flex-col gap-xxs">
                <label htmlFor="deleteConfirmText" className="text-sm">
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
            <div className="flex gap-sm justify-end mt-lg">
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
        </div>
      )}

      {canManageCurrentAccount && !showDeleteAccountForm && (
        <Button
          variant="ghost"
          className="text-grey-400 hover:text-red-600 dark:hover:text-red-400 text-sm mt-md w-full"
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
