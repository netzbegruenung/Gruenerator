import { z } from 'zod';

import { callGrueneratorApi, notebooksApiError } from '../api-client.ts';

export const notebooksSearchTool = {
  name: 'notebooks_search',
  description: `Liefert die rohen, am besten passenden Dokument-Chunks zu einer Anfrage — ohne LLM-Synthese.

Nutze die Treffer, um deine Antwort selbst zu formulieren und auf die Quellen zu verweisen.

Erfordert einen Bearer API-Key, dessen Scope den angefragten \`landesverband\` abdeckt.`,

  inputSchema: {
    query: z.string().describe('Suchanfrage auf Deutsch'),
    landesverband: z.string().describe('Landesverband-Code (z.B. HH, BY, BE)'),
  },

  async handler(
    { query, landesverband }: { query: string; landesverband: string },
    apiKey: string
  ) {
    if (!apiKey) {
      return {
        error: true,
        message: 'No API key forwarded — set Authorization: Bearer header on the MCP request.',
      };
    }
    const result = await callGrueneratorApi('/api/v1/notebooks/search', {
      apiKey,
      method: 'POST',
      body: { query, landesverband },
    });
    if (!result.ok) {
      return notebooksApiError(result.status, result.message);
    }
    return result.data;
  },
};
