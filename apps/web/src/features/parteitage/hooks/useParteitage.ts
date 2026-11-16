import {
  type ConventionDetail,
  type ConventionSpeechDetail,
  type ConventionSummary,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const KEY = ['parteitage'] as const;

export type ConventionResult = { locked: false; convention: ConventionDetail } | { locked: true };

export type UnlockOutcome = 'ok' | 'wrong_password' | 'rate_limited' | 'error';

export function useConventions() {
  return useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: async (): Promise<ConventionSummary[]> => {
      const res = await getContractsClient().parteitage.list();
      if (res.status !== 200) throw new Error(`parteitage list ${res.status}`);
      return res.body.conventions;
    },
  });
}

export function useConvention(slug: string) {
  return useQuery({
    queryKey: [...KEY, 'detail', slug],
    queryFn: async (): Promise<ConventionResult> => {
      const res = await getContractsClient().parteitage.get({ params: { slug } });
      if (res.status === 200) return { locked: false, convention: res.body };
      if (res.status === 403 && res.body.code === 'LOCKED') return { locked: true };
      throw new Error(`parteitage get ${res.status}`);
    },
  });
}

export function useUnlockConvention(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (password: string): Promise<UnlockOutcome> => {
      const res = await getContractsClient().parteitage.unlock({
        params: { slug },
        body: { password },
      });
      if (res.status === 200) return 'ok';
      if (res.status === 401) return 'wrong_password';
      if (res.status === 429) return 'rate_limited';
      return 'error';
    },
    onSuccess: async (outcome) => {
      if (outcome === 'ok') {
        await queryClient.invalidateQueries({ queryKey: KEY });
      }
    },
  });
}

/** Loaded only while the detail is open — the transcript is big. */
export function useSpeechDetail(speechId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'speech', speechId],
    enabled: speechId !== null,
    queryFn: async (): Promise<ConventionSpeechDetail> => {
      const res = await getContractsClient().parteitage.getSpeech({
        params: { speechId: speechId ?? '' },
      });
      if (res.status !== 200) throw new Error(`parteitage speech ${res.status}`);
      return res.body;
    },
  });
}
