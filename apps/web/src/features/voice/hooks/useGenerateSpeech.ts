import { type GenerateSpeechBody, type GenerateSpeechResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation } from '@tanstack/react-query';

/** The server already writes its error bodies for people; the page shows them as they are. */
function errorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error;
  }
  return 'Die Sprachausgabe ist fehlgeschlagen. Bitte versuch es noch einmal.';
}

export function useGenerateSpeech() {
  return useMutation<GenerateSpeechResponse, Error, GenerateSpeechBody>({
    mutationFn: async (body) => {
      const result = await getContractsClient().speech.generate({ body });
      if (result.status === 200) return result.body;
      throw new Error(errorMessage(result.body));
    },
  });
}
