import { Button, toast } from '@gruenerator/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Suspense,
  lazy,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import SettingsRow from '../components/SettingsRow';

import TextInput from '@/components/common/Form/Input/TextInput';
import { RobotAvatar } from '@/components/common/RobotAvatar';
import Spinner from '@/components/common/Spinner';
import { useProfile } from '@/features/auth/hooks/useProfileData';
import {
  profileApiService,
  initializeProfileFormFields,
  type Profile,
} from '@/features/auth/services/profileApiService';
import { useOptimizedAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

const AvatarSelectionModal = lazy(() => import('../components/AvatarSelectionModal'));

const AccountTab = () => {
  const authUser = useAuthStore((s) => s.user);
  const { user: optimizedUser, deleteAccount, canManageAccount } = useOptimizedAuth();
  const user = optimizedUser || authUser;

  const queryClient = useQueryClient();
  const {
    data: profileData,
    isLoading: isLoadingProfile,
    isError: isErrorProfileQuery,
    error: errorProfileQuery,
  } = useProfile(user?.id);
  const profile = profileData as Profile | undefined;
  const updateAvatarOptimistic = useProfileStore((s) => s.updateAvatarOptimistic);

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showDeleteAccountForm, setShowDeleteAccountForm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarRobotId: string | number) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await profileApiService.updateAvatar(avatarRobotId);
    },
    onMutate: async (avatarRobotId: string | number) => {
      await queryClient.cancelQueries({ queryKey: ['profileData', user?.id] });
      const previousProfile = queryClient.getQueryData<Profile>(['profileData', user?.id]);
      queryClient.setQueryData<Profile>(['profileData', user?.id], (oldData) =>
        oldData
          ? { ...oldData, avatar_robot_id: avatarRobotId }
          : { avatar_robot_id: avatarRobotId }
      );
      return { previousProfile, avatarRobotId };
    },
    onSuccess: (updatedProfile: Profile, avatarRobotId: string | number) => {
      if (user?.id) {
        queryClient.setQueryData<Profile>(['profileData', user.id], (oldData) => ({
          ...(oldData || {}),
          ...updatedProfile,
          avatar_robot_id: avatarRobotId,
        }));
        queryClient.setQueryDefaults(['profileData', user.id], {
          staleTime: 60 * 60 * 1000,
          gcTime: 60 * 60 * 1000,
        });
      }
    },
    onError: (_error, _avatarRobotId, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(['profileData', user?.id], context.previousProfile);
      }
    },
  });

  const updateAvatar = updateAvatarMutation.mutateAsync;

  const handleAvatarSelect = async (robotId: string | number) => {
    try {
      await updateAvatar(robotId);
      toast.success('Avatar aktualisiert');
      setTimeout(() => {
        updateAvatarOptimistic(String(robotId)).catch(() => {});
        window.dispatchEvent(
          new CustomEvent('avatarUpdated', { detail: { avatarRobotId: robotId } })
        );
      }, 100);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Fehler beim Aktualisieren des Avatars.'
      );
    }
  };

  const handleDeleteAccountSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeleteAccountError('');
    const expectedText = 'löschen';
    if ((deleteConfirmText || '').trim().toLowerCase() !== expectedText) {
      setDeleteAccountError(`Bitte gib "${expectedText}" zur Bestätigung ein.`);
      return;
    }
    setIsDeletingAccount(true);
    try {
      const result = await deleteAccount({ confirm: expectedText });
      if (result.success) {
        toast.success('Konto gelöscht. Du wirst automatisch weitergeleitet …');
      }
    } catch (error) {
      setDeleteAccountError(
        error instanceof Error ? error.message : 'Fehler beim Löschen des Kontos.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const avatarRobotId = profile?.avatar_robot_id ?? 1;

  if (!user) return null;

  // Read-only profile fields — managed via the identity provider, not here.
  const fields =
    profile && !isLoadingProfile
      ? initializeProfileFormFields(profile, user)
      : { displayName: '', username: '', email: '' };

  return (
    <div className="flex flex-col gap-lg">
      {isErrorProfileQuery && (
        <div className="flex items-center gap-sm rounded-lg bg-red-50 p-md text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <span>{errorProfileQuery?.message || 'Ein Fehler ist aufgetreten.'}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.refetchQueries({ queryKey: ['profileData', user.id] })}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      <div className="flex items-center gap-lg">
        <div
          className="flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-primary-500 bg-background-alt"
          onClick={() => setShowAvatarModal(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowAvatarModal(true);
            }
          }}
          aria-label="Avatar ändern"
        >
          <RobotAvatar
            robotId={typeof avatarRobotId === 'number' ? avatarRobotId : Number(avatarRobotId)}
            displayName={fields.displayName}
            email={fields.email}
            sizePx={64}
            className="size-full"
            fallbackClassName="text-2xl"
            priority
          />
        </div>
        <div className="min-w-0 text-sm text-grey-500">
          Klicke auf den Avatar, um ihn zu ändern.
        </div>
      </div>

      {isLoadingProfile ? (
        <div className="flex justify-center py-lg">
          <Spinner size="medium" />
        </div>
      ) : (
        <div className="-my-4 divide-y divide-grey-200 dark:divide-grey-800">
          <SettingsRow title="Anzeigename">
            <span className="text-sm text-grey-500 dark:text-grey-400">
              {fields.displayName || '—'}
            </span>
          </SettingsRow>
          <SettingsRow title="Benutzername">
            <span className="text-sm text-grey-500 dark:text-grey-400">
              {fields.username || '—'}
            </span>
          </SettingsRow>
          <SettingsRow title="E-Mail">
            <span className="text-sm text-grey-500 dark:text-grey-400">{fields.email || '—'}</span>
          </SettingsRow>
        </div>
      )}

      {showDeleteAccountForm ? (
        <div className="rounded-lg bg-red-50 p-lg dark:bg-red-900/10">
          <form onSubmit={handleDeleteAccountSubmit}>
            <div className="flex flex-col gap-md">
              <div className="text-base font-semibold text-red-700 dark:text-red-400">
                Konto löschen
              </div>
              <p className="m-0 text-sm text-grey-600 dark:text-grey-400">
                <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. Alle
                deine Daten werden permanent gelöscht.
              </p>
              {deleteAccountError && (
                <div className="rounded-md bg-red-100 p-sm text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setDeleteConfirmText(e.target.value)
                  }
                  placeholder="löschen"
                  aria-label="Bestätigung: löschen"
                  disabled={isDeletingAccount}
                />
              </div>
            </div>
            <div className="mt-lg flex justify-end gap-sm">
              <Button variant="destructive" type="submit" disabled={isDeletingAccount}>
                {isDeletingAccount ? <Spinner size="small" /> : 'Konto unwiderruflich löschen'}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowDeleteAccountForm(false)}
                disabled={isDeletingAccount}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </div>
      ) : (
        canManageAccount() && (
          <Button
            variant="ghost"
            className="w-full text-sm text-grey-400 hover:text-red-600 dark:hover:text-red-400"
            onClick={() => {
              setShowDeleteAccountForm(true);
              setDeleteConfirmText('');
              setDeleteAccountError('');
            }}
            disabled={isLoadingProfile}
          >
            Konto löschen
          </Button>
        )
      )}

      {showAvatarModal && (
        <Suspense fallback={null}>
          <AvatarSelectionModal
            isOpen={showAvatarModal}
            currentAvatarId={
              typeof avatarRobotId === 'number' ? avatarRobotId : Number(avatarRobotId)
            }
            onSelect={handleAvatarSelect}
            onClose={() => setShowAvatarModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default AccountTab;
