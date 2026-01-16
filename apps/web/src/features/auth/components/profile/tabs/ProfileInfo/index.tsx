import React, { useState, useEffect, useCallback, useRef, Suspense, lazy, FormEvent } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { profileApiService, getAvatarDisplayProps, initializeProfileFormFields, ProfileUpdateData, Profile, AvatarDisplay, ProfileFormFields } from '../../../../services/profileApiService';
import { useAutosave } from '../../../../../../hooks/useAutosave';
import { useProfile } from '../../../../hooks/useProfileData';
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useProfileStore } from '../../../../../../stores/profileStore';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';
import ProfileView from './ProfileView';

const AvatarSelectionModal = lazy(() => import('../../AvatarSelectionModal'));

interface User {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

interface ProfileInfoTabContainerProps {
  user?: User;
  onSuccessMessage: (message: string) => void;
  onErrorProfileMessage: (message: string) => void;
  deleteAccount: (options: { confirm: string }) => Promise<{ success: boolean }>;
  canManageAccount: () => boolean;
}

const ProfileInfoTabContainer = ({
  user: userProp,
  onSuccessMessage,
  onErrorProfileMessage,
  deleteAccount,
  canManageAccount
}: ProfileInfoTabContainerProps) => {
  const { user: authUser } = useOptimizedAuth();
  const user = userProp || authUser;

  // Move all hooks before conditional returns to avoid React hooks violation
  const queryClient = useQueryClient();
  const { data: profileData, isLoading: isLoadingProfile, isError: isErrorProfileQuery, error: errorProfileQuery } = useProfile(user?.id);
  const profile = profileData as Profile | undefined;
  const updateAvatarOptimistic = useProfileStore((s) => s.updateAvatarOptimistic);
  const syncProfile = useProfileStore((s) => s.syncProfile);

  const {
    getBetaFeatureState,
    updateUserBetaFeatures,
    isUpdating: isBetaFeaturesUpdating
  } = useBetaFeatures();

  const igelActive = getBetaFeatureState('igel');

  const handleToggleIgelModus = async (checked: boolean) => {
    await updateUserBetaFeatures('igel', checked);
    onSuccessMessage(`Igel-Modus ${checked ? 'aktiviert' : 'deaktiviert'}.`);
  };

  if (!user) {
    return (
      <div className="profile-tab-loading">
        <div>Benutzerinformationen werden geladen...</div>
      </div>
    );
  }



  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: ProfileUpdateData) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await profileApiService.updateProfile(profileData);
    },
    onSuccess: (updatedProfile: Profile) => {
      console.log('[ProfileInfo] Update success, updatedProfile:', updatedProfile);
      if (user?.id && updatedProfile) {
        const newProfileData = (oldData: Profile | undefined) => ({ ...oldData, ...updatedProfile });
        queryClient.setQueryData(['profileData', user.id], newProfileData);
        // Manually sync to profileStore for components not using useProfile
        const currentData = queryClient.getQueryData<Profile>(['profileData', user.id]);
        console.log('[ProfileInfo] Syncing to profileStore:', currentData);
        if (currentData) {
          syncProfile(currentData as Profile);
        }
      }
    },
    onError: (error) => {
      console.error('Profile update failed:', error);
    },
    retry: 1,
    retryDelay: 1000,
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarRobotId: string | number) => {
      if (!user) throw new Error('Nicht angemeldet');
      return await profileApiService.updateAvatar(avatarRobotId);
    },
    onMutate: async (avatarRobotId: string | number) => {
      await queryClient.cancelQueries({ queryKey: ['profileData', user?.id] });
      const previousProfile = queryClient.getQueryData<Profile>(['profileData', user?.id]);
      queryClient.setQueryData<Profile>(['profileData', user?.id], (oldData) =>
        oldData ? { ...oldData, avatar_robot_id: avatarRobotId } : { avatar_robot_id: avatarRobotId }
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
        queryClient.setQueryDefaults(['profileData', user.id], { staleTime: 60 * 60 * 1000, gcTime: 60 * 60 * 1000 });
      }
    },
    onError: (error, avatarRobotId, context) => {
      console.error('Avatar update failed:', error);
      if (context?.previousProfile) {
        queryClient.setQueryData(['profileData', user?.id], context.previousProfile);
      }
    },
  });

  const updateProfile = updateProfileMutation.mutateAsync;
  const updateAvatar = updateAvatarMutation.mutateAsync;
  const profileUpdateError = updateProfileMutation.error;

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [errorProfile, setErrorProfile] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showDeleteAccountForm, setShowDeleteAccountForm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const isInitialized = useRef(false);

  const canManageCurrentAccount = user ? canManageAccount() : false;
  const avatarRobotId = profile?.avatar_robot_id ?? 1;

  useEffect(() => {
    if (profile && isInitialized.current) {
      console.log(`[Avatar State] profile.avatar_robot_id=${profile?.avatar_robot_id}, computed=${avatarRobotId}`);
    }
  }, [profile?.avatar_robot_id, avatarRobotId]);

  const stateBasedSave = useCallback(async () => {
    if (!profile || !isInitialized.current) return;
    const fullDisplayName = displayName || email || (user?.username as string | undefined) || 'Benutzer';
    const profileUpdateData: ProfileUpdateData = {
      display_name: fullDisplayName,
      username: username || null,
      email: email?.trim() || null,
      custom_prompt: customPrompt || null
    };
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Save timeout')), 10000));
      await Promise.race([updateProfile(profileUpdateData), timeoutPromise]);
      setErrorProfile('');
    } catch (error) {
      console.error('Auto-save error:', error);
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage === 'Save timeout') {
        setErrorProfile('Speichern dauert zu lange. Bitte versuchen Sie es erneut.');
        onErrorProfileMessage('Speichern dauert zu lange. Bitte versuchen Sie es erneut.');
      }
    }
  }, [displayName, username, email, customPrompt, user?.username, profile, updateProfile, onErrorProfileMessage]);

  const { resetTracking } = useAutosave({
    saveFunction: async () => { await stateBasedSave(); },
    formRef: { getValues: () => ({ displayName, username, email, customPrompt }), watch: (callback: (value: Record<string, unknown>, { name }: { name?: string }) => void) => ({ unsubscribe: () => { } }) },
    enabled: profile && isInitialized.current,
    debounceMs: 2000,
    getFieldsToTrack: () => ['displayName', 'username', 'email', 'customPrompt'],
    onError: (error: unknown) => {
      console.error('Profile autosave failed:', error);
      setErrorProfile('Automatisches Speichern fehlgeschlagen.');
    },
  });

  useEffect(() => {
    if (!profile || !user) return;
    const formFields: ProfileFormFields = initializeProfileFormFields(profile, user);
    if (!isInitialized.current) {
      setDisplayName(formFields.displayName);
      setUsername(formFields.username);
      setEmail(formFields.email);
      setCustomPrompt((profile as { custom_prompt?: string })?.custom_prompt || '');
      isInitialized.current = true;
      setTimeout(() => resetTracking(), 100);
    }
  }, [profile, user, resetTracking]);

  useEffect(() => {
    if (profile && isInitialized.current) {
      const timer = setTimeout(() => {
        resetTracking();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [displayName, username, email, customPrompt, resetTracking, profile]);

  useEffect(() => {
    if (profileUpdateError) {
      setErrorProfile(profileUpdateError.message || 'Fehler beim Aktualisieren des Profils.');
      onErrorProfileMessage(profileUpdateError.message || 'Fehler beim Aktualisieren des Profils.');
    }
  }, [profileUpdateError, onErrorProfileMessage]);

  const handleAvatarSelect = async (robotId: string | number) => {
    try {
      const oldAvatarId = profile?.avatar_robot_id || 'unknown';
      console.log(`[Avatar] User selected avatar: ${oldAvatarId} → ${robotId}`);
      await updateAvatar(robotId);
      onSuccessMessage('Avatar erfolgreich aktualisiert!');
      setTimeout(() => {
        updateAvatarOptimistic(String(robotId)).catch(() => {
          console.debug('[ProfileInfo] ProfileStore sync after avatar update completed');
        });
        window.dispatchEvent(new CustomEvent('avatarUpdated', { detail: { avatarRobotId: robotId } }));
      }, 100);
    } catch (error) {
      console.error('[Avatar] update failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Fehler beim Aktualisieren des Avatars.';
      onErrorProfileMessage(errorMessage);
    }
  };

  const handleToggleDeleteAccountForm = () => {
    setShowDeleteAccountForm(!showDeleteAccountForm);
    if (!showDeleteAccountForm) {
      setDeleteConfirmText('');
      setDeleteAccountError('');
    } else {
      setDeleteAccountError('');
    }
  };

  const handleDeleteAccountSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeleteAccountError('');
    onErrorProfileMessage('');
    const expectedText = 'löschen';
    if ((deleteConfirmText || '').trim().toLowerCase() !== expectedText) {
      const msg = `Bitte gib "${expectedText}" zur Bestätigung ein.`;
      setDeleteAccountError(msg);
      onErrorProfileMessage(msg);
      return;
    }
    setIsDeletingAccount(true);
    try {
      const result = await deleteAccount({ confirm: expectedText });
      if (result.success) {
        onSuccessMessage('Konto erfolgreich gelöscht. Sie werden automatisch weitergeleitet...');
      }
    } catch (error) {
      console.error('Account deletion error:', error);
      const msg = error instanceof Error ? error.message : 'Fehler beim Löschen des Kontos.';
      setDeleteAccountError(msg);
      onErrorProfileMessage(msg);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const avatarProps: AvatarDisplay = getAvatarDisplayProps({
    avatar_robot_id: avatarRobotId,
    display_name: displayName,
    email: email || (user?.email as string | undefined) || (user?.username as string | undefined),
  });

  const isLoading = isLoadingProfile;

  return (
    <>
      <ProfileView
        user={user}
        profile={profile}
        avatarProps={avatarProps}
        isLoading={isLoading}
        displayName={displayName}
        setDisplayName={setDisplayName}
        email={email}
        setEmail={setEmail}
        username={username}
        setUsername={setUsername}
        customPrompt={customPrompt}
        setCustomPrompt={setCustomPrompt}
        errorProfile={errorProfile}
        isErrorProfileQuery={isErrorProfileQuery}
        errorProfileQueryMessage={errorProfileQuery?.message}
        onRetryProfileRefetch={() => queryClient.refetchQueries({ queryKey: ['profileData', user?.id] })}
        onOpenAvatarModal={() => setShowAvatarModal(true)}
        canManageCurrentAccount={canManageCurrentAccount}
        showDeleteAccountForm={showDeleteAccountForm}
        onToggleDeleteAccountForm={handleToggleDeleteAccountForm}
        deleteConfirmText={deleteConfirmText}
        setDeleteConfirmText={setDeleteConfirmText}
        deleteAccountError={deleteAccountError}
        isDeletingAccount={isDeletingAccount}
        onDeleteAccountSubmit={handleDeleteAccountSubmit}
        igelActive={igelActive}
        onToggleIgelModus={handleToggleIgelModus}
        isBetaFeaturesUpdating={isBetaFeaturesUpdating}
        onSuccessMessage={onSuccessMessage}
      />

      {showAvatarModal && (
        <Suspense fallback={<div>Lade Avatare…</div>}>
          <AvatarSelectionModal
            isOpen={showAvatarModal}
            currentAvatarId={typeof avatarRobotId === 'number' ? avatarRobotId : Number(avatarRobotId)}
            onSelect={handleAvatarSelect}
            onClose={() => setShowAvatarModal(false)}
          />
        </Suspense>
      )}
    </>
  );
};

export default ProfileInfoTabContainer;
