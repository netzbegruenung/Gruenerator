/**
 * The account's nuudel polls, created by the Grünerator in the chat
 * (settings → Umfragen). The list comes from our table; nothing here calls nuudel.
 */
import { type NuudelPollListResponse } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const QUERY_KEY = ['nuudel-polls'] as const;

export const nuudelPollsQuery = {
  queryKey: QUERY_KEY,
  queryFn: async (): Promise<NuudelPollListResponse> => {
    const result = await getContractsClient().nuudelPolls.listPolls();
    if (result.status !== 200)
      throw new ApiError(result.status, 'Umfragen konnten nicht geladen werden.');
    return result.body;
  },
  staleTime: 5 * 60 * 1000,
};

export function useNuudelPolls() {
  return useQuery(nuudelPollsQuery);
}

export function useForgetNuudelPoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const result = await getContractsClient().nuudelPolls.forgetPoll({ params: { id } });
      if (result.status !== 200)
        throw new ApiError(result.status, 'Umfrage konnte nicht entfernt werden.');
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
