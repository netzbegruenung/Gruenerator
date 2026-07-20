import { Button, toast } from '@gruenerator/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import RolesSection from './RolesSection';

import Spinner from '@/components/common/Spinner';
import { useProfile } from '@/features/auth/hooks/useProfileData';
import { profileApiService, type Profile } from '@/features/auth/services/profileApiService';
import { useAuthStore } from '@/stores/authStore';

const CustomPromptSection = () => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: profileData, isLoading } = useProfile(user?.id);
  const profile = profileData as Profile | undefined;

  const [customPrompt, setCustomPrompt] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const savedPromptRef = useRef('');
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!profile || isInitialized.current) return;
    const initialPrompt = (profile as { custom_prompt?: string }).custom_prompt || '';
    setCustomPrompt(initialPrompt);
    savedPromptRef.current = initialPrompt;
    isInitialized.current = true;
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      profileApiService.updateProfile({ custom_prompt: customPrompt || null }),
    onSuccess: (updatedProfile: Profile) => {
      if (user?.id) {
        queryClient.setQueryData(['profileData', user.id], (oldData: Profile | undefined) => ({
          ...oldData,
          ...updatedProfile,
        }));
      }
      savedPromptRef.current = customPrompt;
      setIsDirty(false);
      toast.success('Anweisungen gespeichert');
    },
    onError: () => {
      toast.error('Fehler beim Speichern der Anweisungen.');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-lg">
        <Spinner size="medium" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-sm">
      <div>
        <h3 className="m-0 text-sm font-medium text-foreground">Anweisungen</h3>
        <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
          Persönliche Hinweise, die der Grünerator bei jeder Antwort berücksichtigt.
        </p>
      </div>
      <textarea
        value={customPrompt}
        onChange={(e) => {
          setCustomPrompt(e.target.value);
          setIsDirty(e.target.value !== savedPromptRef.current);
        }}
        placeholder="z.B. 'Duze die Leser*innen und schreibe knapp.'"
        rows={4}
        className="w-full resize-y rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
      />
      {isDirty && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Wird gespeichert…' : 'Speichern'}
          </Button>
        </div>
      )}
    </div>
  );
};

const PersonalizationTab = () => (
  <div className="flex flex-col gap-xl">
    <CustomPromptSection />
    <RolesSection />
  </div>
);

export default PersonalizationTab;
