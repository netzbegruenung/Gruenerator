import { type GenerateSpeechBody, type GenerateSpeechResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation } from '@tanstack/react-query';

import { speechApiError, speechRequestError } from './speechError';

export function useGenerateSpeech() {
  return useMutation<GenerateSpeechResponse, Error, GenerateSpeechBody>({
    mutationFn: async (body) => {
      const result = await getContractsClient().speech.generate({ body }).catch(speechRequestError);
      if (result.status === 200) return result.body;
      throw speechApiError(
        'generate',
        result,
        'Die Sprachausgabe ist fehlgeschlagen. Bitte versuch es noch einmal.'
      );
    },
    // The page renders the message as an alert; the global toast would repeat it.
    meta: { silent: true },
  });
}
