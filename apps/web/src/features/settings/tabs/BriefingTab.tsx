/**
 * Tagesbriefing — the opt-in for the first chat message of the day.
 *
 * Its own tab since 11.11.2026: it used to sit above the memory list, where it
 * read as a memory setting. It is not one — it decides whether the Grünerator
 * writes first, and nothing in it is remembered.
 */
import { requestDailyBriefingNow, requestThreadListReload } from '@gruenerator/chat';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { Button, Switch } from '@gruenerator/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import SettingsRow from '../components/SettingsRow';

import { QUERY_KEYS, useProfile } from '@/features/auth/hooks/useProfileData';
import { profileApiService, type Profile } from '@/features/auth/services/profileApiService';
import { useAuthStore } from '@/stores/authStore';

const CONTENTS = [
  'Deine offenen Aufgaben aus den Boards',
  'Was heute los ist — Schlagzeilen aus Partei und Welt, jeweils mit Quelle',
  'Ein kurzer Blick auf das, woran du zuletzt gearbeitet hast',
  'Zwei bis vier Ideen für heute',
];

export default function BriefingTab() {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const { data: profileData } = useProfile(userId);
  const profile = profileData as Profile | undefined;
  const enabled = profile?.proactive_briefing_enabled ?? false;
  const [error, setError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      profileApiService.updateProfile({ proactive_briefing_enabled: next }),
    onSuccess: (updated: Profile, next: boolean) => {
      queryClient.setQueryData(QUERY_KEYS.profile(userId), (old: Profile | undefined) => ({
        ...old,
        ...updated,
      }));
      setError(null);
      if (next) requestDailyBriefingNow();
    },
    onError: () => setError('Der Schalter konnte nicht gespeichert werden.'),
  });

  const rerun = useMutation({
    mutationFn: async (simulateNextDay: boolean) => {
      const res = await getContractsClient().briefing.devRerun({
        body: simulateNextDay ? { simulateNextDay } : {},
      });
      if (res.status !== 200) throw new ApiError(res.status, 'Tagesbriefing-Neubau fehlgeschlagen');
    },
    onSuccess: () => {
      setError(null);
      requestThreadListReload();
    },
    onError: () => setError('Das Tagesbriefing konnte nicht neu erzeugt werden.'),
  });

  if (!userId) return null;

  return (
    <div className="flex flex-col gap-lg">
      <div className="-mt-4 border-b border-grey-200 dark:border-grey-800">
        <SettingsRow id="tagesbriefing.schalter">
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => toggle.mutate(checked)}
            disabled={toggle.isPending || !profile}
            aria-label="Tagesbriefing im Chat einschalten"
          />
        </SettingsRow>
      </div>

      {error && (
        <p role="alert" className="m-0 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-sm">
        <h3 className="m-0 text-sm font-semibold text-foreground-heading">Was drinsteht</h3>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-grey-500">
          {CONTENTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="m-0 text-xs text-grey-500">
          Das Briefing erscheint als neuer Chat in deiner Seitenleiste. Hast du nicht darauf
          geantwortet, tritt am nächsten Tag das neue an seine Stelle.
        </p>
      </section>

      {import.meta.env.VITE_E2E_AUTH_BYPASS === 'true' && (
        <div className="flex gap-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={rerun.isPending}
            onClick={() => rerun.mutate(false)}
          >
            Tagesbriefing jetzt neu erzeugen
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={rerun.isPending}
            onClick={() => rerun.mutate(true)}
          >
            Folgetag simulieren
          </Button>
        </div>
      )}
    </div>
  );
}
