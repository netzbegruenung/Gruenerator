/**
 * React Query hooks for the "Texte anlernen" feature (per-user learned writing
 * styles). Wraps the typed ts-rest client (`userTextForms` namespace).
 */
import { type SaveTextFormBody, type TextForm, type TextFormType } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const TEXT_FORMS_KEY = ['text-forms'];

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    return String((body as { message: unknown }).message);
  }
  return `HTTP ${status}`;
}

/** Shared by the hook and the tab's preload, so both hit the same cache entry. */
export const textFormsQuery = {
  queryKey: TEXT_FORMS_KEY,
  retry: false,
  queryFn: async (): Promise<TextForm[]> => {
    const res = await getContractsClient().userTextForms.list();
    if (res.status !== 200) throw new Error(errorMessage(res.body, res.status));
    return res.body.forms;
  },
};

export function useTextForms(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({ ...textFormsQuery, enabled });

  const analyze = useMutation({
    mutationFn: async (input: {
      textType?: TextFormType | null;
      title?: string | null;
      examples: Array<{ content: string }>;
    }): Promise<string> => {
      const res = await getContractsClient().userTextForms.analyze({
        body: {
          ...(input.textType ? { textType: input.textType } : {}),
          ...(input.title ? { title: input.title } : {}),
          examples: input.examples,
        },
      });
      if (res.status !== 200) throw new Error(errorMessage(res.body, res.status));
      return res.body.styleBlock;
    },
  });

  const save = useMutation({
    mutationFn: async (input: { mention: string; body: SaveTextFormBody }): Promise<TextForm> => {
      const res = await getContractsClient().userTextForms.save({
        params: { mention: input.mention },
        body: input.body,
      });
      if (res.status !== 200) throw new Error(errorMessage(res.body, res.status));
      return res.body.form;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEXT_FORMS_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: async (mention: string): Promise<void> => {
      const res = await getContractsClient().userTextForms.remove({ params: { mention } });
      if (res.status !== 200) throw new Error(errorMessage(res.body, res.status));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEXT_FORMS_KEY });
    },
  });

  const share = useMutation({
    mutationFn: async (input: { mention: string; groupId: string }): Promise<void> => {
      const res = await getContractsClient().userTextForms.share({
        params: { mention: input.mention },
        body: { group_id: input.groupId },
      });
      if (res.status !== 200) throw new Error(errorMessage(res.body, res.status));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEXT_FORMS_KEY });
    },
  });

  const unshare = useMutation({
    mutationFn: async (input: { mention: string; groupId: string }): Promise<void> => {
      const res = await getContractsClient().userTextForms.unshare({
        params: { mention: input.mention },
        body: { group_id: input.groupId },
      });
      if (res.status !== 200) throw new Error(errorMessage(res.body, res.status));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEXT_FORMS_KEY });
    },
  });

  return { query, analyze, save, remove, share, unshare };
}
