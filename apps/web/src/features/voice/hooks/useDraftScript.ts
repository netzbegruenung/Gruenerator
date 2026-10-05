import { type DraftScriptBody, type DraftScriptResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation } from '@tanstack/react-query';

import { speechApiError, speechRequestError } from './speechError';

export function useDraftScript() {
  return useMutation<DraftScriptResponse, Error, DraftScriptBody>({
    mutationFn: async (body) => {
      const result = await getContractsClient()
        .speech.draftScript({ body })
        .catch(speechRequestError);
      if (result.status === 200) return result.body;
      throw speechApiError(
        'draftScript',
        result,
        'Der Entwurf ist fehlgeschlagen. Bitte versuch es noch einmal.'
      );
    },
    // The assistant renders the message inline; the global toast would repeat it.
    meta: { silent: true },
  });
}
