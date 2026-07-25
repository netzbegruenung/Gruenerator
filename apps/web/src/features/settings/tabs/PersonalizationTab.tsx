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

/**
 * Absender for the PDF letterhead. Free text and multi-line, because
 * senderLines() splits the address on '\n' and real Gliederung addresses
 * ("c/o Kreisgeschäftsstelle", "Stiege 2/Top 5") do not fit a street/zip/city
 * triple.
 */
const LetterheadSection = () => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: profileData, isLoading } = useProfile(user?.id);
  const profile = profileData as Profile | undefined;

  const [organization, setOrganization] = useState('');
  const [address, setAddress] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const savedRef = useRef({ organization: '', address: '' });
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!profile || isInitialized.current) return;
    const initial = {
      organization: profile.sender_organization || '',
      address: profile.sender_address || '',
    };
    setOrganization(initial.organization);
    setAddress(initial.address);
    savedRef.current = initial;
    isInitialized.current = true;
  }, [profile]);

  const markDirty = (next: { organization?: string; address?: string }) => {
    const merged = { organization, address, ...next };
    setIsDirty(
      merged.organization !== savedRef.current.organization ||
        merged.address !== savedRef.current.address
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      profileApiService.updateProfile({
        sender_organization: organization || null,
        sender_address: address || null,
      }),
    onSuccess: (updatedProfile: Profile) => {
      if (user?.id) {
        queryClient.setQueryData(['profileData', user.id], (oldData: Profile | undefined) => ({
          ...oldData,
          ...updatedProfile,
        }));
      }
      savedRef.current = { organization, address };
      setIsDirty(false);
      toast.success('Absender gespeichert');
    },
    onError: () => {
      toast.error('Fehler beim Speichern des Absenders.');
    },
  });

  if (isLoading) return null;

  return (
    <div className="flex flex-col gap-sm">
      <div>
        <h3 className="m-0 text-sm font-medium text-foreground">Absender für Briefkopf</h3>
        <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
          Erscheint oben links, wenn du ein Dokument mit Briefkopf oder als Brief als PDF
          exportierst. Dein Anzeigename wird automatisch ergänzt.
        </p>
      </div>
      <div className="flex flex-col gap-xs">
        <label
          htmlFor="sender-organization"
          className="text-xs font-medium text-grey-600 dark:text-grey-300"
        >
          Organisation
        </label>
        <input
          id="sender-organization"
          value={organization}
          onChange={(e) => {
            setOrganization(e.target.value);
            markDirty({ organization: e.target.value });
          }}
          placeholder="z.B. 'KV Musterstadt'"
          maxLength={120}
          className="w-full rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
        />
      </div>
      <div className="flex flex-col gap-xs">
        <label
          htmlFor="sender-address"
          className="text-xs font-medium text-grey-600 dark:text-grey-300"
        >
          Adresse
        </label>
        <textarea
          id="sender-address"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            markDirty({ address: e.target.value });
          }}
          placeholder={'Musterweg 1\n12345 Musterstadt'}
          rows={3}
          maxLength={300}
          aria-describedby="sender-address-hint"
          className="w-full resize-y rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
        />
        <p id="sender-address-hint" className="m-0 text-xs text-grey-500 dark:text-grey-400">
          Eine Zeile je Adresszeile, höchstens drei.
        </p>
      </div>
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
    <LetterheadSection />
    <RolesSection />
  </div>
);

export default PersonalizationTab;
